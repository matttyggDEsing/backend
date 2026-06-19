'use strict';

const { pool } = require('../config/db');

/**
 * Crea un ticket de soporte.
 * FIX: ahora acepta orderId y lo persiste en la columna order_id.
 * Antes orderId se pasaba desde el controller pero era ignorado en la
 * desestructuración, por lo que siempre quedaba NULL aunque el usuario
 * hubiera asociado una orden al ticket.
 *
 * @returns {number} ID del nuevo ticket
 */
const create = async (userId, { subject, message, priority = 'medium', orderId = null }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ticketResult] = await conn.query(
      `INSERT INTO tickets (user_id, order_id, subject, status, priority)
       VALUES (?, ?, ?, 'open', ?)`,
      [userId, orderId || null, subject, priority],
    );
    const ticketId = ticketResult.insertId;

    await conn.query(
      `INSERT INTO ticket_messages (ticket_id, user_id, message, is_staff)
       VALUES (?, ?, ?, 0)`,
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

/**
 * Lista tickets de un usuario con paginación.
 */
const findByUser = async (userId, { limit = 20, offset = 0 } = {}) => {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM tickets WHERE user_id = ?`,
    [userId],
  );
  const [rows] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority,
            t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count,
            (SELECT MAX(tm2.created_at) FROM ticket_messages tm2 WHERE tm2.ticket_id = t.id) AS last_reply
     FROM tickets t
     WHERE t.user_id = ?
     ORDER BY t.updated_at DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return { rows, total };
};

/**
 * Busca un ticket por ID verificando que pertenece al usuario.
 */
const findByIdAndUser = async (ticketId, userId) => {
  const [rows] = await pool.query(
    `SELECT id, user_id, subject, status, priority, created_at, updated_at
     FROM tickets WHERE id = ? AND user_id = ? LIMIT 1`,
    [ticketId, userId],
  );
  return rows[0] || null;
};

/**
 * Busca un ticket por ID (uso de staff/admin).
 */
const findById = async (ticketId) => {
  const [rows] = await pool.query(
    `SELECT t.*, u.email AS user_email, u.name AS user_name
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = ? LIMIT 1`,
    [ticketId],
  );
  return rows[0] || null;
};

/**
 * Obtiene mensajes de un ticket.
 */
const getMessages = async (ticketId) => {
  const [rows] = await pool.query(
    `SELECT tm.id, tm.user_id, tm.message, tm.is_staff,
            tm.created_at, u.name AS author_name
     FROM ticket_messages tm
     LEFT JOIN users u ON u.id = tm.user_id
     WHERE tm.ticket_id = ?
     ORDER BY tm.created_at ASC`,
    [ticketId],
  );
  return rows;
};

/**
 * Agrega un mensaje a un ticket y actualiza updated_at.
 */
const addMessage = async (ticketId, userId, message, isStaff = false) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO ticket_messages (ticket_id, user_id, message, is_staff)
       VALUES (?, ?, ?, ?)`,
      [ticketId, userId, message, isStaff ? 1 : 0],
    );

    const newStatus = isStaff ? 'pending' : 'open';
    await conn.query(
      `UPDATE tickets SET status = ?, updated_at = NOW()
       WHERE id = ? AND status != 'closed'`,
      [newStatus, ticketId],
    );

    await conn.commit();
    return result.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * Cierra un ticket (usuario).
 */
const close = async (ticketId, userId) => {
  const [result] = await pool.query(
    `UPDATE tickets SET status = 'closed', updated_at = NOW()
     WHERE id = ? AND user_id = ? AND status != 'closed'`,
    [ticketId, userId],
  );
  return result.affectedRows > 0;
};

/**
 * [Admin] Cierra cualquier ticket.
 */
const closeAdmin = async (ticketId) => {
  const [result] = await pool.query(
    `UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = ?`,
    [ticketId],
  );
  return result.affectedRows > 0;
};

/**
 * [Admin] Lista todos los tickets con filtros opcionales.
 */
const getAll = async ({ status, limit = 30, offset = 0 } = {}) => {
  let where = '';
  const params = [];
  if (status) {
    where = ' WHERE t.status = ?';
    params.push(status);
  }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM tickets t${where}`,
    params,
  );

  const [rows] = await pool.query(
    `SELECT t.id, t.subject, t.status, t.priority,
            t.created_at, t.updated_at,
            u.email AS user_email, u.name AS user_name,
            (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.updated_at DESC, t.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), parseInt(offset)],
  );

  return { rows, total };
};

module.exports = {
  create,
  findByUser,
  findByIdAndUser,
  findById,
  getMessages,
  addMessage,
  close,
  closeAdmin,
  getAll,
  findAll: getAll,
};
