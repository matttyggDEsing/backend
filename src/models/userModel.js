'use strict';

const { pool } = require('../config/db');

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, balance, api_key, status,
            email_verified, total_spent, total_orders, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

const findByEmail = async (email) => {
  const [rows] = await pool.query(
    `SELECT id, name, email, password, role, balance, api_key, status,
            email_verified, total_spent, total_orders, created_at
     FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  return rows[0] || null;
};

const findByApiKey = async (apiKey) => {
  const [rows] = await pool.query(
    `SELECT id, name, email, role, balance, api_key, status
     FROM users WHERE api_key = ? LIMIT 1`,
    [apiKey],
  );
  return rows[0] || null;
};

const create = async ({ name, email, password, apiKey }) => {
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, api_key, role, balance, status)
     VALUES (?, ?, ?, ?, 'user', 0.0000, 'active')`,
    [name, email, password, apiKey],
  );
  return result.insertId;
};

const update = async (id, data) => {
  const allowed = ['name', 'email', 'password'];
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
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    values,
  );
};

/**
 * Actualiza el rol de un usuario.
 * FIX: función nueva requerida por adminController.updateUserRole
 * @param {number} id
 * @param {'user'|'staff'|'admin'} role
 */
const updateRole = async (id, role) => {
  const VALID_ROLES = ['user', 'staff', 'admin'];
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Rol inválido: ${role}. Valores permitidos: ${VALID_ROLES.join(', ')}`);
  }
  await pool.query(
    `UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?`,
    [role, id],
  );
};

/**
 * Actualiza el estado de un usuario (banear/desbanear).
 */
const updateStatus = async (id, status) => {
  const VALID_STATUSES = ['active', 'banned', 'pending'];
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Estado inválido: ${status}`);
  }
  await pool.query(
    `UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id],
  );
};

/**
 * Ajusta el balance de un usuario (suma o resta).
 * @param {object} conn  - Conexión MySQL activa (para transacciones)
 * @param {number} userId
 * @param {number} amount - Positivo = crédito, negativo = débito
 */
const adjustBalance = async (conn, userId, amount) => {
  await conn.query(
    `UPDATE users SET
       balance       = balance + ?,
       total_spent   = CASE WHEN ? < 0 THEN total_spent + ABS(?) ELSE total_spent END,
       total_orders  = CASE WHEN ? < 0 THEN total_orders + 1      ELSE total_orders  END,
       updated_at    = NOW()
     WHERE id = ?`,
    [amount, amount, amount, amount, userId],
  );
};

/**
 * Lista usuarios con paginación y búsqueda (uso admin).
 */
const findAll = async ({ limit = 20, offset = 0, search = null, status = null } = {}) => {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT id, name, email, role, balance, status,
            total_spent, total_orders, created_at, updated_at
     FROM users
     ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)],
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users ${where}`,
    params,
  );

  return { rows, total };
};

module.exports = {
  findById,
  findByEmail,
  findByApiKey,
  create,
  update,
  updateRole,    // ← nuevo
  updateStatus,  // ← nuevo
  adjustBalance,
  findAll,
};






