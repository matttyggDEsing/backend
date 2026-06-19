'use strict';

const { pool } = require('../config/db');

/**
 * Retorna servicios activos con paginación.
 * FIX: agregado LIMIT/OFFSET + COUNT para no traer toda la tabla de una.
 */
const getActive = async ({ categoryId, search, limit = 50, offset = 0 } = {}) => {
  const params = [];
  let where = 'WHERE s.is_active = 1';

  if (categoryId) {
    where += ' AND s.category_id = ?';
    params.push(categoryId);
  }

  if (search) {
    // busca por nombre o por ID numérico exacto
    where += ' AND (s.name LIKE ? OR s.provider_service_id = ?)';
    params.push(`%${search}%`, parseInt(search) || 0);
  }

  const countSql = `
    SELECT COUNT(*) AS total
    FROM services s
    JOIN categories c ON c.id = s.category_id
    ${where}
  `;

  const dataSql = `
    SELECT s.id, s.provider_service_id, s.name, s.description,
           s.rate, s.min_order, s.max_order, s.type, s.refill, s.cancel,
           c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji
    FROM services s
    JOIN categories c ON c.id = s.category_id
    ${where}
    ORDER BY c.sort_order ASC, s.sort_order ASC, s.name ASC
    LIMIT ? OFFSET ?
  `;

  // FIX: pool.query() devuelve [rows, fields], por eso Promise.all resuelve en
  // [ [[{total:N}], fields], [[row,...], fields] ].
  // El patrón correcto necesita un nivel extra de brackets para el count.
  const [[[{ total }]], [rows]] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, parseInt(limit), parseInt(offset)]),
  ]);

  return { rows, total };
};

const findAll = async ({ category } = {}) => {
  let sql = `
    SELECT s.id, s.provider_service_id, s.name, s.description,
           s.rate, s.min_order, s.max_order, s.type, s.refill, s.cancel,
           c.name AS category, c.slug AS category_slug
    FROM services s
    JOIN categories c ON c.id = s.category_id
    WHERE s.is_active = 1
  `;
  const params = [];
  if (category) {
    sql += ' AND (c.slug = ? OR c.name = ?)';
    params.push(category, category);
  }
  sql += ' ORDER BY c.sort_order ASC, s.name ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT s.*, c.name AS category, c.slug AS category_slug
     FROM services s
     JOIN categories c ON c.id = s.category_id
     WHERE s.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

const getCategories = async () => {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, c.slug, c.emoji, c.sort_order
     FROM categories c
     WHERE c.is_active = 1
       AND EXISTS (SELECT 1 FROM services s WHERE s.category_id = c.id AND s.is_active = 1)
     ORDER BY c.sort_order ASC`,
  );
  return rows;
};

const getAll = async ({ limit = 20, offset = 0, search = null, categoryId = null, isActive = null } = {}) => {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(s.name LIKE ? OR s.provider_service_id = ?)');
    params.push(`%${search}%`, parseInt(search) || 0);
  }
  if (categoryId) {
    conditions.push('s.category_id = ?');
    params.push(categoryId);
  }
  if (isActive !== null) {
    conditions.push('s.is_active = ?');
    params.push(isActive);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT s.id, s.provider_service_id, s.name, s.description,
            s.rate, s.min_order, s.max_order, s.type,
            s.refill, s.cancel, s.is_active, s.sort_order,
            s.created_at, s.updated_at,
            c.name AS category_name, c.id AS category_id,
            p.name AS provider_name
     FROM services s
     LEFT JOIN categories c ON c.id = s.category_id
     LEFT JOIN providers  p ON p.id = s.provider_id
     ${where}
     ORDER BY s.id DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)],
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM services s ${where}`,
    params,
  );

  return { rows, total };
};

const create = async ({
  provider_id, category_id, provider_service_id = 0,
  name, description = '', rate, min_order, max_order,
  type = 'Default', refill = false, cancel = false,
}) => {
  const [result] = await pool.query(
    `INSERT INTO services
       (provider_id, category_id, provider_service_id, name, description,
        rate, min_order, max_order, type, refill, cancel, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      provider_id, category_id, provider_service_id,
      name, description, parseFloat(rate),
      parseInt(min_order), parseInt(max_order),
      type, refill ? 1 : 0, cancel ? 1 : 0,
    ],
  );
  return result.insertId;
};

const update = async (id, data) => {
  const allowed = [
    'name', 'description', 'rate', 'min_order', 'max_order',
    'type', 'is_active', 'category_id', 'refill', 'cancel', 'sort_order',
  ];
  const fields = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }

  if (!fields.length) return;
  values.push(id);
  await pool.query(
    `UPDATE services SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    values,
  );
};

/**
 * Sincroniza servicios desde un proveedor SMM.
 */
const syncFromProvider = async (services, providerId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!providerId) {
      throw new Error('syncFromProvider requiere un providerId explícito');
    }
    const [[provider]] = await conn.query(
      `SELECT id FROM providers WHERE id = ? LIMIT 1`,
      [providerId],
    );
    if (!provider) throw new Error('Proveedor no encontrado');

    // Categoría fallback
    let [[fallbackCat]] = await conn.query(
      `SELECT id FROM categories WHERE slug = 'sin-categoria' LIMIT 1`,
    );
    if (!fallbackCat) {
      const [ins] = await conn.query(
        `INSERT INTO categories (name, slug, is_active) VALUES ('Sin categoría', 'sin-categoria', 1)`,
      );
      fallbackCat = { id: ins.insertId };
    }

    let synced = 0;
    for (const s of services) {
      const providerServiceId = s.service ?? s.provider_service_id ?? 0;
      const categoryName = s.category ?? 'Sin categoría';
      const rate    = parseFloat(s.rate ?? 0);
      const minOrd  = parseInt(s.min ?? s.min_order ?? 1);
      const maxOrd  = parseInt(s.max ?? s.max_order ?? 1000000);
      const svcName = s.name ?? 'Servicio sin nombre';
      const svcType = s.type ?? 'Default';
      const svcDesc = s.description ?? '';
      const svcRefill = s.refill ? 1 : 0;
      const svcCancel = s.cancel ? 1 : 0;

      // Buscar o crear categoría
      let [[cat]] = await conn.query(
        `SELECT id FROM categories WHERE name = ? LIMIT 1`,
        [categoryName],
      );
      if (!cat) {
        const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
        await conn.query(
          `INSERT IGNORE INTO categories (name, slug, is_active) VALUES (?, ?, 1)`,
          [categoryName, slug],
        );
        [[cat]] = await conn.query(
          `SELECT id FROM categories WHERE name = ? LIMIT 1`,
          [categoryName],
        );
      }
      const categoryId = cat?.id ?? fallbackCat.id;

      // Upsert servicio
      const [existing] = await conn.query(
        `SELECT id FROM services WHERE provider_service_id = ? AND provider_id = ? LIMIT 1`,
        [providerServiceId, providerId],
      );

      if (existing.length > 0) {
        await conn.query(
          `UPDATE services SET
             name = ?, description = ?, provider_rate = ?,
             min_order = ?, max_order = ?, type = ?,
             refill = ?, cancel = ?, category_id = ?, updated_at = NOW()
           WHERE provider_service_id = ? AND provider_id = ?`,
          [svcName, svcDesc, rate, minOrd, maxOrd, svcType, svcRefill, svcCancel,
           categoryId, providerServiceId, providerId],
        );
      } else {
        await conn.query(
          `INSERT INTO services
             (provider_id, category_id, provider_service_id, name, description,
              rate, provider_rate, min_order, max_order, type, refill, cancel, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [providerId, categoryId, providerServiceId, svcName, svcDesc,
           rate, rate, minOrd, maxOrd, svcType, svcRefill, svcCancel],
        );
      }
      synced++;
    }

    await conn.commit();
    return { synced };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const applyMarkup = async (markupPercent, providerId = null) => {
  const multiplier = 1 + (parseFloat(markupPercent) / 100);
  let where = 'WHERE provider_rate > 0';
  const params = [multiplier];
  if (providerId) { where += ' AND provider_id = ?'; params.push(providerId); }
  const [result] = await pool.query(
    `UPDATE services SET rate = ROUND(provider_rate * ?, 4), updated_at = NOW() ${where}`,
    params,
  );
  return { updated: result.affectedRows };
};

module.exports = {
  getActive,
  findAll,
  findById,
  getCategories,
  getAll,
  create,
  update,
  syncFromProvider,
  applyMarkup,
};



