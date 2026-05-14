'use strict';

const { pool } = require('../config/db');

/**
 * Crea un ticket de soporte.
 * @returns {number} ID del nuevo ticket
 */
const create = async (userId, { subject, message, priority = 'medium', orderId = null }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ticketResult] = await conn.query(
      `INSERT INTO tickets (user_id, subject, status, priority, order_id)
       VALUES (?, ?, 'open', ?, ?)`,
      [userId, subject, priority, orderId],
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
    `SELECT t.id, t.subject, t.status, t.priority, t.order_id,
            t.created_at, t.updated_at,
            (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count,
            (SELECT MAX(tm2.created_at) FROM ticket_messages tm2 WHERE tm2.ticket_id = t.id) AS last_reply
     FROM tickets t
     WHERE t.user_id = ?
     ORDER BY t.updated_at DESC
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
    `SELECT id, user_id, subject, status, priority, order_id, created_at, updated_at
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

    // Reabre el ticket si el staff responde (si estaba en espera del usuario) y viceversa
    const newStatus = isStaff ? 'answered' : 'open';
    await conn.query(
      `UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ? AND status != 'closed'`,
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
 * Cierra un ticket.
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
const findAll = async ({ status, limit = 30, offset = 0 } = {}) => {
  let sql = `
    SELECT t.id, t.subject, t.status, t.priority, t.order_id,
           t.created_at, t.updated_at,
           u.email AS user_email, u.name AS user_name,
           (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id) AS message_count
    FROM tickets t
    JOIN users u ON u.id = t.user_id
  `;
  const params = [];
  if (status) {
    sql += ' WHERE t.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY t.updated_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM tickets${status ? ' WHERE status = ?' : ''}`,
    status ? [status] : [],
  );
  const [rows] = await pool.query(sql, params);
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
  findAll,
};
