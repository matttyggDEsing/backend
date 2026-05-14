'use strict';

const { pool } = require('../config/db');

/**
 * Retorna servicios activos.
 * Usado por servicesController (getActive) y serviceController (findAll).
 * Tu tabla real: id, provider_id, category_id, provider_service_id,
 *                name, description, rate, min_order, max_order,
 *                type, refill, cancel, is_active, sort_order
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

// Alias para compatibilidad con serviceController que llama findAll({ category })
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
 * Sincroniza servicios desde Peakerr.
 * Busca el provider_id del proveedor activo y usa category_id = 1 como fallback
 * (el admin puede reasignar categorías después desde el panel).
 */
const syncFromProvider = async (services) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Obtener el primer provider activo
    const [[provider]] = await conn.query(
      `SELECT id FROM providers WHERE status = 'active' ORDER BY id LIMIT 1`,
    );
    if (!provider) throw new Error('No hay ningún proveedor activo configurado');
    const providerId = provider.id;

    // Obtener o crear categoría "Sin categoría" como fallback
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
      // Intentar hacer match de categoría por nombre
      let [[cat]] = await conn.query(
        `SELECT id FROM categories WHERE name = ? LIMIT 1`,
        [s.category],
      );
      if (!cat) {
        // Crear categoría nueva automáticamente
        const slug = s.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const [ins] = await conn.query(
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

module.exports = { getActive, findAll, findById, getCategories, syncFromProvider };
