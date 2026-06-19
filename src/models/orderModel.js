const { pool } = require('../config/db');

const create = async (conn, data) => {
  const [result] = await conn.query(
    `INSERT INTO orders
       (user_id, service_id, provider_id, link, quantity, charge, cost, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      data.user_id, data.service_id, data.provider_id,
      data.link, data.quantity, data.charge, data.cost,
    ],
  );
  return result.insertId;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    `SELECT o.id, o.user_id, o.service_id, o.provider_id, o.provider_order_id,
            o.link, o.quantity, o.start_count, o.remains,
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
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
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

const updateStatus = async (id, status, { startCount, remains, profit } = {}) => {
  const fields = ['status = ?', 'updated_at = NOW()'];
  const values = [status];
  if (startCount !== undefined) { fields.push('start_count = ?'); values.push(startCount); }
  if (remains !== undefined) { fields.push('remains = ?'); values.push(remains); }
  if (profit !== undefined) { fields.push('profit = ?'); values.push(profit); }
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

// FIX: esta función se llamaba "cancelWithRefund" pero nunca devolvía nada al
// usuario — solo cambiaba el status. Tampoco validaba dueño ni estado de la
// orden (podías "cancelar" una orden ya completada). Ahora sí reembolsa el
// `charge` real, valida que la orden sea del usuario y que esté en un estado
// seguro para cancelar (todavía no se envió al proveedor o falló el envío).
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

  const [[userRow]] = await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [order.user_id]);
  const balanceBefore = parseFloat(userRow.balance);
  const refundAmount  = parseFloat(order.charge);

  await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [refundAmount, order.user_id]);

  await conn.query(
    `INSERT INTO transactions (user_id, order_id, type, amount, balance_before, balance_after, description, status)
     VALUES (?, ?, 'credit', ?, ?, ?, ?, 'completed')`,
    [order.user_id, orderId, refundAmount, balanceBefore, balanceBefore + refundAmount,
     `Reembolso por cancelación de orden #${orderId}`],
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
  create, findById, findByUser, getStatsByUser,
  updateProviderOrder, updateStatus, getPendingOrders,
  cancelWithRefund, getAll,
};






