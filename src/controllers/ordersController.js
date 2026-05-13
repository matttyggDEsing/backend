const { pool } = require('../config/db');
const orderModel = require('../models/orderModel');
const serviceModel = require('../models/serviceModel');
const transactionModel = require('../models/transactionModel');
const smm = require('../services/smmProvider');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');
const logger = require('../utils/logger');

const getOrders = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { status } = req.query;

    const { rows, total } = await orderModel.findByUser(req.user.id, { limit, offset, status });
    return paginatedResponse(res, rows, { ...pagination, total, totalPages: Math.ceil(total / pagination.perPage) });
  } catch (err) {
    next(err);
  }
};

const getOrderStats = async (req, res, next) => {
  try {
    const stats = await orderModel.getStatsByUser(req.user.id);
    return successResponse(res, stats);
  } catch (err) {
    next(err);
  }
};

const createOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { service_id, link, quantity } = req.body;
    const userId = req.user.id;

    // 1. Validar servicio
    const service = await serviceModel.findById(service_id);
    if (!service || !service.is_active) {
      return errorResponse(res, 'Servicio no disponible', 404);
    }

    // 2. Validar cantidad
    if (quantity < service.min_order || quantity > service.max_order) {
      return errorResponse(
        res,
        `La cantidad debe estar entre ${service.min_order} y ${service.max_order}`,
        400,
      );
    }

    // 3. Calcular precio
    const charge = parseFloat(((service.rate / 1000) * quantity).toFixed(4));

    // 4. Verificar balance
    const [[userRow]] = await conn.query(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );
    if (!userRow || parseFloat(userRow.balance) < charge) {
      conn.release();
      return errorResponse(res, 'Saldo insuficiente', 402);
    }

    const balanceBefore = parseFloat(userRow.balance);

    // 5. Transacción MySQL
    await conn.beginTransaction();

    await conn.query(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [charge, userId],
    );

    const orderId = await orderModel.create(conn, {
      user_id:     userId,
      service_id,
      provider_id: service.provider_id,
      link,
      quantity,
      charge,
      cost:        0, // se actualiza cuando el proveedor confirma
    });

    await transactionModel.create(conn, {
      user_id:        userId,
      order_id:       orderId,
      type:           'debit',
      amount:         charge,
      balance_before: balanceBefore,
      balance_after:  balanceBefore - charge,
      description:    `Orden #${orderId} — ${service.name}`,
    });

    await conn.commit();
    conn.release();

    // 6. Enviar al proveedor (async, fuera de la tx)
    setImmediate(async () => {
      try {
        const smmResult = await smm.addOrder({
          service: service.provider_service_id,
          link,
          quantity,
        });

        await orderModel.updateProviderOrder(orderId, String(smmResult.order));
        logger.info(`[Orders] Orden #${orderId} enviada al proveedor: ${smmResult.order}`);
      } catch (smmErr) {
        logger.error(`[Orders] Fallo proveedor para orden #${orderId}: ${smmErr.message}`);
        // Cancelar y reembolsar
        const refundConn = await pool.getConnection();
        try {
          await refundConn.beginTransaction();
          await orderModel.cancelWithRefund(refundConn, orderId);
          await refundConn.query(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [charge, userId],
          );
          await transactionModel.create(refundConn, {
            user_id:        userId,
            order_id:       orderId,
            type:           'credit',
            amount:         charge,
            balance_before: balanceBefore - charge,
            balance_after:  balanceBefore,
            description:    `Reembolso orden #${orderId} — error proveedor`,
          });
          await refundConn.commit();
        } catch (refundErr) {
          await refundConn.rollback();
          logger.error(`[Orders] Error en reembolso #${orderId}: ${refundErr.message}`);
        } finally {
          refundConn.release();
        }
      }
    });

    const order = await orderModel.findById(orderId);
    return successResponse(res, order, 'Orden creada exitosamente', 201);
  } catch (err) {
    await conn.rollback().catch(() => {});
    conn.release();
    next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order) return errorResponse(res, 'Orden no encontrada', 404);
    // Verificar ownership
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return errorResponse(res, 'No autorizado', 403);
    }
    return successResponse(res, order);
  } catch (err) {
    next(err);
  }
};

module.exports = { getOrders, getOrderStats, createOrder, getOrderById };
