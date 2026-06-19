const { pool } = require('../config/db');

const getAll = async () => {
  const [rows] = await pool.query(
    `SELECT id, name, api_url, status, balance, last_sync, created_at FROM providers ORDER BY id`,
  );
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, name, api_url, api_key, status FROM providers WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

const create = async ({ name, api_url, api_key }) => {
  const [result] = await pool.query(
    `INSERT INTO providers (name, api_url, api_key) VALUES (?, ?, ?)`,
    [name, api_url, api_key],
  );
  return result.insertId;
};

const updateBalance = async (id, balance) => {
  await pool.query(
    `UPDATE providers SET balance = ?, last_sync = NOW() WHERE id = ?`,
    [balance, id],
  );
};

const updateStatus = async (id, status) => {
  await pool.query(`UPDATE providers SET status = ? WHERE id = ?`, [status, id]);
};

module.exports = { getAll, findById, create, updateBalance, updateStatus };






