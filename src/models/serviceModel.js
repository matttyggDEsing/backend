'use strict';

const { pool } = require('../config/db');

/**
 * Retorna todos los servicios activos (visibles para el usuario).
 */
const findAll = async ({ category } = {}) => {
  let sql = `
    SELECT
      id, provider_service_id, name, category, type,
      rate_usd, rate_markup, min_qty, max_qty,
      refill, cancel_enabled, description, active
    FROM services
    WHERE active = 1
  `;
  const params = [];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY category, name';
  const [rows] = await pool.query(sql, params);
  return rows;
};

/**
 * Busca un servicio por ID interno.
 */
const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT * FROM services WHERE id = ? AND active = 1 LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

/**
 * Obtiene las categorías únicas disponibles.
 */
const getCategories = async () => {
  const [rows] = await pool.query(
    `SELECT DISTINCT category FROM services WHERE active = 1 ORDER BY category`,
  );
  return rows.map((r) => r.category);
};

/**
 * Sincroniza servicios del proveedor con la base de datos.
 * - Inserta nuevos servicios.
 * - Actualiza rate y disponibilidad de los existentes.
 */
const syncFromProvider = async (services) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const s of services) {
      const [existing] = await conn.query(
        `SELECT id FROM services WHERE provider_service_id = ? LIMIT 1`,
        [s.provider_service_id],
      );

      if (existing.length > 0) {
        // Actualizar rate y límites, mantener markup personalizado del admin
        await conn.query(
          `UPDATE services SET
             name = ?, category = ?, type = ?, rate_usd = ?,
             min_qty = ?, max_qty = ?, refill = ?, cancel_enabled = ?
           WHERE provider_service_id = ?`,
          [
            s.name, s.category, s.type, s.rate,
            s.min, s.max, s.refill ? 1 : 0, s.cancel ? 1 : 0,
            s.provider_service_id,
          ],
        );
      } else {
        // Insertar nuevo servicio con markup por defecto del 20%
        await conn.query(
          `INSERT INTO services
             (provider_service_id, name, category, type, rate_usd, rate_markup,
              min_qty, max_qty, refill, cancel_enabled, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.provider_service_id, s.name, s.category, s.type,
            s.rate, parseFloat((s.rate * 1.2).toFixed(6)),
            s.min, s.max, s.refill ? 1 : 0, s.cancel ? 1 : 0,
            s.description,
          ],
        );
      }
    }

    await conn.commit();
    return { synced: services.length };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { findAll, findById, getCategories, syncFromProvider };
