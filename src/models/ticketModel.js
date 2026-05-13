const { pool } = require('../config/db');

const create = async (userId, { subject, message, priority = 'medium' }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ticketResult] = await conn.query(
      `INSERT INTO tickets (user_id, subject, priority) VALUES (?, ?, ?)`,
      [userId, subject, priority],
    );
    const ticketId = ticketResult.insertId;

    await conn.query(
      `INSERT INTO ticket_messages (ticket_id, user_id, from_admin, message) VALUES (?, ?, 0, ?)`,
      [ticketId, userId, message],
    );

    await conn.commit();
    return ticketId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const findByUser = async (userId, { limit, offset }) => {
  const [rows] = await pool.query(
    `SELECT id, subject, status, priority, created_at, updated_at
     FROM tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM tickets WHERE user_id = ?',
    [userId],
  );
  return { rows, total };
};

const findByIdAndUser = async (id, userId) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at
     FROM tickets t WHERE t.id = ? AND t.user_id = ? LIMIT 1`,
    [id, userId],
  );
  return rows[0] || null;
};

const getMessages = async (ticketId) => {
  const [rows] = await pool.query(
    `SELECT id, from_admin, message, created_at FROM ticket_messages
     WHERE ticket_id = ? ORDER BY created_at ASC`,
    [ticketId],
  );
  return rows;
};

const addMessage = async (ticketId, userId, message, fromAdmin = false) => {
  await pool.query(
    `INSERT INTO ticket_messages (ticket_id, user_id, from_admin, message) VALUES (?, ?, ?, ?)`,
    [ticketId, userId, fromAdmin ? 1 : 0, message],
  );
  await pool.query(
    `UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?`,
    [fromAdmin ? 'pending' : 'open', ticketId],
  );
};

const getAll = async ({ limit, offset, status }) => {
  let where = '';
  const params = [];
  if (status) { where = 'WHERE t.status = ?'; params.push(status); }

  const [rows] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority, t.created_at, t.updated_at,
            u.email AS user_email, u.name AS user_name
     FROM tickets t JOIN users u ON u.id = t.user_id
     ${where} ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM tickets t ${where}`,
    params,
  );
  return { rows, total };
};

module.exports = { create, findByUser, findByIdAndUser, getMessages, addMessage, getAll };
