'use strict';

const { pool } = require('../config/db');

/**
 * Retorna servicios activos (con join a categories).
 * Usado por servicesController y apiController.
 */
const getActive = async ({ categoryId } = {}) => {
  let sql = `
    SELECT s.id, s.provider_service_id, s.name, s.description,
           s.rate, s.min_order, s.max_order, s.type, s.refill, s.cancel,
           c.name AS category, c.slug AS category_slug, c.emoji AS category_emoji
    FROM services s
    JOIN categories c ON c.id = s.category_id
    WHERE s.is_active = 1
  `;
  const params = [];
  if (categoryId) {
    sql += ' AND s.category_id = ?';
    params.push(categoryId);
  }
  sql += ' ORDER BY c.sort_order ASC, s.sort_order ASC, s.name ASC';
  const [rows] = await pool.query(sql, params);
  return rows;
};

// Alias para serviceController que llama findAll({ category })
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

/**
 * Busca un servicio por ID.
 */
const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT s.*, c.name AS category, c.slug AS category_slug
     FROM services s
     JOIN categories c ON c.id = s.category_id
     WHERE s.id = ? AND s.is_active = 1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

/**
 * Obtiene categorías con servicios activos.
 */
const getCategories = async () => {
  const [rows] = await pool.query(
    `SELECT DISTINCT c.id, c.name, c.slug, c.emoji
     FROM categories c
     JOIN services s ON s.category_id = c.id AND s.is_active = 1
     WHERE c.is_active = 1
     ORDER BY c.sort_order ASC`,
  );
  return rows;
};

/**
 * Lista todos los servicios con paginación y búsqueda (uso admin).
 * FIX: Esta función faltaba en el export original → adminController fallaba.
 */
const getAll = async ({ limit = 20, offset = 0, search = null, categoryId = null } = {}) => {
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

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT s.id, s.provider_service_id, s.name, s.description,
            s.rate, s.min_order, s.max_order, s.type,
            s.refill, s.cancel, s.is_active, s.sort_order,
            s.created_at, s.updated_at,
            c.name AS category_name, c.id AS category_id,
            p.name AS provider_name
     FROM services s
     JOIN categories c ON c.id = s.category_id
     JOIN providers p  ON p.id = s.provider_id
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

/**
 * Crea un servicio manualmente (uso admin).
 * FIX: Esta función faltaba en el export original → importServices fallaba silenciosamente.
 */
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

/**
 * Actualiza campos de un servicio (uso admin).
 * FIX: Esta función faltaba en el export original → adminController.updateService fallaba.
 */
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
 * Sincroniza servicios desde Peakerr.
 * Hace upsert por provider_service_id + provider_id.
 */
const syncFromProvider = async (services) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[provider]] = await conn.query(
      `SELECT id FROM providers WHERE status = 'active' ORDER BY id LIMIT 1`,
    );
    if (!provider) throw new Error('No hay ningún proveedor activo configurado');
    const providerId = provider.id;

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
      let [[cat]] = await conn.query(
        `SELECT id FROM categories WHERE name = ? LIMIT 1`,
        [s.category],
      );
      if (!cat) {
        const slug = s.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        await conn.query(
          `INSERT IGNORE INTO categories (name, slug, is_active) VALUES (?, ?, 1)`,
          [s.category, slug],
        );
        [[cat]] = await conn.query(
          `SELECT id FROM categories WHERE name = ? LIMIT 1`,
          [s.category],
        );
      }
      const categoryId = cat ? cat.id : fallbackCat.id;

      const [existing] = await conn.query(
        `SELECT id FROM services WHERE provider_service_id = ? AND provider_id = ? LIMIT 1`,
        [s.provider_service_id, providerId],
      );

      if (existing.length > 0) {
        await conn.query(
          `UPDATE services SET
             name = ?, description = ?, rate = ?,
             min_order = ?, max_order = ?, type = ?,
             refill = ?, cancel = ?, category_id = ?
           WHERE provider_service_id = ? AND provider_id = ?`,
          [
            s.name, s.description, s.rate,
            s.min, s.max, s.type,
            s.refill ? 1 : 0, s.cancel ? 1 : 0, categoryId,
            s.provider_service_id, providerId,
          ],
        );
      } else {
        await conn.query(
          `INSERT INTO services
             (provider_id, category_id, provider_service_id, name, description,
              rate, min_order, max_order, type, refill, cancel, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            providerId, categoryId, s.provider_service_id,
            s.name, s.description, s.rate,
            s.min, s.max, s.type,
            s.refill ? 1 : 0, s.cancel ? 1 : 0,
          ],
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

module.exports = {
  getActive,
  findAll,
  findById,
  getCategories,
  getAll,    // ← FIX: ahora exportado
  create,    // ← FIX: ahora exportado
  update,    // ← FIX: ahora exportado
  syncFromProvider,
};
