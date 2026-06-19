const { pool } = require('../config/db');

const getAll = async (onlyActive = false) => {
  const where = onlyActive ? 'WHERE is_active = 1' : '';
  const [rows] = await pool.query(
    `SELECT id, name, slug, emoji, description, is_active, sort_order FROM categories ${where} ORDER BY sort_order ASC`,
  );
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM categories WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
};

module.exports = { getAll, findById };






