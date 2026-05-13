const { pool } = require('../config/db');

const getActive = async ({ categoryId } = {}) => {
  let where = 'WHERE s.is_active = 1';
  const params = [];
  if (categoryId) {
    where += ' AND s.category_id = ?';
    params.push(categoryId);
  }
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.description, s.rate, s.min_order, s.max_order,
            s.type, s.refill, s.cancel, s.category_id,
            c.name AS category_name, c.slug AS category_slug, c.emoji
     FROM services s
     JOIN categories c ON c.id = s.category_id
     ${where}
     ORDER BY c.sort_order ASC, s.sort_order ASC`,
    params,
  );
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.rate, s.min_order, s.max_order, s.is_active,
            s.provider_id, s.provider_service_id, s.category_id
     FROM services s WHERE s.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

const getAll = async ({ limit, offset, search, categoryId }) => {
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('s.name LIKE ?');
    params.push(`%${search}%`);
  }
  if (categoryId) {
    conditions.push('s.category_id = ?');
    params.push(categoryId);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.rate, s.min_order, s.max_order, s.type, s.is_active,
            s.refill, s.cancel, s.category_id, c.name AS category_name
     FROM services s JOIN categories c ON c.id = s.category_id
     ${where} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM services s ${where}`,
    params,
  );
  return { rows, total };
};

const create = async (data) => {
  const [result] = await pool.query(
    `INSERT INTO services
       (provider_id, category_id, provider_service_id, name, description,
        rate, min_order, max_order, type, refill, cancel)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.provider_id, data.category_id, data.provider_service_id,
      data.name, data.description, data.rate,
      data.min_order, data.max_order, data.type,
      data.refill ? 1 : 0, data.cancel ? 1 : 0,
    ],
  );
  return result.insertId;
};

const update = async (id, data) => {
  const fields = [];
  const values = [];

  const allowed = ['name', 'description', 'rate', 'min_order', 'max_order', 'is_active', 'type', 'category_id'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await pool.query(`UPDATE services SET ${fields.join(', ')} WHERE id = ?`, values);
};

module.exports = { getActive, findById, getAll, create, update };
