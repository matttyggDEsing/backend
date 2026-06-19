const { pool } = require('../config/db');

const create = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO transactions
       (user_id, order_id, type, amount, balance_before, balance_after, description, method, reference, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.user_id,
      data.order_id || null,
      data.type,
      data.amount,
      data.balance_before,
      data.balance_after,
      data.description,
      data.method || null,
      data.reference || null,
      data.status || 'completed',
    ],
  );
  return result.insertId;
};

const findByUser = async (userId, { limit, offset }) => {
  const [rows] = await pool.query(
    `SELECT id, type, amount, balance_before, balance_after, description,
            method, reference, status, created_at
     FROM transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM transactions WHERE user_id = ?',
    [userId],
  );
  return { rows, total };
};

module.exports = { create, findByUser };






