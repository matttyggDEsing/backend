const { pool } = require('../config/db');

const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, balance, api_key, status, email_verified, total_spent, total_orders, created_at FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] || null;
};

const findByEmail = async (email) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, password, role, balance, api_key, status, email_verified FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  return rows[0] || null;
};

const findByApiKey = async (apiKey) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, role, balance, status FROM users WHERE api_key = ? LIMIT 1',
    [apiKey],
  );
  return rows[0] || null;
};

const create = async ({ name, email, password, apiKey }) => {
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password, api_key) VALUES (?, ?, ?, ?)',
    [name, email, password, apiKey],
  );
  return result.insertId;
};

const updateBalance = async (conn, userId, amount) => {
  await conn.query(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [amount, userId],
  );
};

const getAll = async ({ limit, offset, search }) => {
  let where = '';
  const params = [];
  if (search) {
    where = 'WHERE name LIKE ? OR email LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }
  const [rows] = await pool.query(
    `SELECT id, name, email, role, balance, status, total_orders, total_spent, created_at
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users ${where}`,
    params,
  );
  return { rows, total };
};

const updateStatus = async (userId, status) => {
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
};

const addFunds = async (userId, amount) => {
  await pool.query(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [amount, userId],
  );
};

module.exports = { findById, findByEmail, findByApiKey, create, updateBalance, getAll, updateStatus, addFunds };
