'use strict';

const { pool } = require('../config/db');

/**
 * Crea una orden. Acepta tanto una conexión de transacción (conn)
 * como el pool directo.
 */
const create = async (conn, { user_id, service_id, provider_id, link, quantity, charge, cost }) => {
  const db = conn || pool;
  const [result] = await db.query(
    `INSERT INTO orders
       (user_id, service_id, provider_id, link, quantity, charge, cost, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [user_id, service_id, provider_id, link, quantity, charge, cost],
  );
  return result.insertId;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT o.id, o.user_id, o.service_id, o.provider_id,
            o.provider_order_id, o.link, o.quantity, o.start_count, o.remains,
            o.charge, o.cost, o.profit, o.status, o.notes,
            o.created_at, o.updated_at,
            s.name AS service_name
     FROM orders o
     JOIN services s ON s.id = o.service_id
     WHERE o.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] || null;
};

const findByUser = async (userId, { limit, offset, status }) => {
  const conditions = ['o.user_id = ?'];
  const params = [userId];
  if (status) {
    conditions.push('o.status = ?');
    params.push(status);
  }
  const where = 'WHERE ' + conditions.join(' AND ');

  const [rows] = await pool.query(
    `SELECT o.id, o.service_id, o.link, o.quantity, o.start_count, o.remains,
            o.charge, o.status, o.created_at, o.updated_at,
            s.name AS service_name
     FROM orders o
     JOIN services s ON s.id = o.service_id
     ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o ${where}`,
    params,
  );
  return { rows, total };
};

const getStatsByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
       SUM(charge) AS total_spent
     FROM orders WHERE user_id = ?`,
    [userId],
  );
  return rows[0];
};

const updateProviderOrder = async (id, providerOrderId) => {
  await pool.query(
    `UPDATE orders SET provider_order_id = ?, status = 'active', updated_at = NOW()
     WHERE id = ?`,
    [providerOrderId, id],
  );
};

/**
 * FIX: `profit` es una columna GENERATED ALWAYS AS (charge - cost) STORED en el schema.
 * MySQL no permite escribir directamente en columnas generadas — intentarlo lanza
 * "Error Code: 3105. The value specified for generated column 'profit' in table 'orders'
 * is not allowed."
 *
 * Antes se construía el SET dinámicamente e incluía `profit = ?` cuando se pasaba
 * el campo, lo que hacía crashear silenciosamente el orderProcessor en cada ciclo
 * de polling para órdenes completadas.
 *
 * Ahora `profit` se omite del UPDATE siempre — MySQL lo recalcula solo al actualizar
 * `charge` o `cost`, que son las columnas fuente. Si necesitás forzar un recálculo,
 * hacé un UPDATE de cost o charge y profit se actualiza automáticamente.
 */
const updateStatus = async (id, status, { startCount, remains } = {}) => {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const values = [status];

  if (startCount !== undefined) {
    fields.push('start_count = ?');
    values.push(startCount);
  }
  if (remains !== undefined) {
    fields.push('remains = ?');
    values.push(remains);
  }

  // NOTA: `profit` NO se incluye — es columna generada, MySQL la calcula sola.

  values.push(id);
  await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = ?`, values);
};

const getPendingOrders = async () => {
  const [rows] = await pool.query(
    `SELECT o.id, o.provider_order_id, o.provider_id, o.user_id, o.charge, o.cost
     FROM orders o
     WHERE o.status IN ('pending', 'active', 'processing')
       AND o.provider_order_id IS NOT NULL`,
  );
  return rows;
};

/**
 * Cancela una orden con reembolso al usuario.
 * Solo se puede cancelar si todavía no fue enviada al proveedor (status pending/error).
 */
const cancelWithRefund = async (conn, orderId, userId = null) => {
  const [[order]] = await conn.query(
    `SELECT id, user_id, charge, status FROM orders WHERE id = ? FOR UPDATE`,
    [orderId],
  );
  if (!order) throw new Error('Orden no encontrada');
  if (userId && order.user_id !== userId) throw new Error('Orden no encontrada');
  if (!['pending', 'error'].includes(order.status)) {
    throw new Error('La orden ya fue enviada al proveedor y no se puede cancelar');
  }

  await conn.query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [orderId],
  );

  const [[userRow]] = await conn.query(
    'SELECT balance FROM users WHERE id = ? FOR UPDATE',
    [order.user_id],
  );
  const balanceBefore = parseFloat(userRow.balance);
  const refundAmount  = parseFloat(order.charge);

  await conn.query(
    'UPDATE users SET balance = balance + ? WHERE id = ?',
    [refundAmount, order.user_id],
  );

  await conn.query(
    `INSERT INTO transactions
       (user_id, order_id, type, amount, balance_before, balance_after, description, status)
     VALUES (?, ?, 'credit', ?, ?, ?, ?, 'completed')`,
    [
      order.user_id, orderId, refundAmount,
      balanceBefore, balanceBefore + refundAmount,
      `Reembolso por cancelación de orden #${orderId}`,
    ],
  );

  return refundAmount;
};

const getAll = async ({ limit, offset, status, userId }) => {
  const conditions = [];
  const params = [];
  if (status) { conditions.push('o.status = ?'); params.push(status); }
  if (userId) { conditions.push('o.user_id = ?'); params.push(userId); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows] = await pool.query(
    `SELECT o.id, o.user_id, o.service_id, o.link, o.quantity,
            o.charge, o.cost, o.profit, o.status, o.created_at,
            s.name AS service_name, u.email AS user_email
     FROM orders o
     JOIN services s ON s.id = o.service_id
     JOIN users u ON u.id = o.user_id
     ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o ${where}`,
    params,
  );
  return { rows, total };
};

module.exports = {
  create,
  findById,
  findByUser,
  getStatsByUser,
  updateProviderOrder,
  updateStatus,
  getPendingOrders,
  cancelWithRefund,
  getAll,
};
