'use strict';

/**
 * ordersController.js — VERSIÓN CORREGIDA
 *
 * BUGS ORIGINALES:
 *   1. Connection leak: si el servicio no se encontraba (línea ~1300)
 *      o si la cantidad era inválida (línea ~1309), la función hacía
 *      `return errorResponse(...)` SIN llamar conn.release() → la conexión
 *      quedaba abierta y el pool se agotaba eventualmente.
 *
 *   2. La misma fuga podía ocurrir si fallaba la validación de cantidad.
 *
 * FIX: todas las salidas anticipadas (early returns) llaman conn.release()
 * antes de devolver la respuesta.
 */

const { pool }           = require('../config/db');
const orderModel         = require('../models/orderModel');
const serviceModel       = require('../models/serviceModel');
const transactionModel   = require('../models/transactionModel');
const smm                = require('../services/smmProvider');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate }       = require('../utils/pagination');
const logger             = require('../utils/logger');

const getOrders = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { status } = req.query;
    const { rows, total } = await orderModel.findByUser(req.user.id, { limit, offset, status });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
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
      conn.release(); // FIX: era return sin release → leak de conexión
      return errorResponse(res, 'Servicio no disponible', 404);
    }

    // 2. Validar cantidad
    if (quantity < service.min_order || quantity > service.max_order) {
      conn.release(); // FIX: era return sin release → leak de conexión
      return errorResponse(
        res,
        `La cantidad debe estar entre ${service.min_order} y ${service.max_order}`,
        400,
      );
    }

    // 3. Calcular precio
    const charge = parseFloat(((service.rate / 1000) * quantity).toFixed(4));

    // 4. Verificar balance (dentro de transacción)
    await conn.beginTransaction();

    const [[userRow]] = await conn.query(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );

    if (!userRow || parseFloat(userRow.balance) < charge) {
      await conn.rollback();
      conn.release();
      return errorResponse(res, 'Saldo insuficiente', 402);
    }

    const balanceBefore = parseFloat(userRow.balance);

    // 5. Debitar balance
    await conn.query(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [charge, userId],
    );

    // 6. Crear orden en DB con status pending
    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (user_id, service_id, provider_id, link, quantity, charge, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, service.id, service.provider_id, link, quantity, charge],
    );
    const orderId = orderResult.insertId;

    // 7. Registrar transacción
    await conn.query(
      `INSERT INTO transactions
         (user_id, order_id, type, amount, balance_before, balance_after, description, status)
       VALUES (?, ?, 'debit', ?, ?, ?, ?, 'completed')`,
      [
        userId, orderId, charge,
        balanceBefore, balanceBefore - charge,
        `Orden #${orderId} — ${service.name}`,
      ],
    );

    // 8. Actualizar contadores del usuario
    await conn.query(
      `UPDATE users
       SET total_orders = total_orders + 1,
           total_spent  = total_spent  + ?
       WHERE id = ?`,
      [charge, userId],
    );

    await conn.commit();
    conn.release();

    // 9. Enviar al proveedor (fuera de la transacción DB para no bloquearla)
    setImmediate(async () => {
      try {
        const providerResponse = await smm.addOrder({
          service:  service.provider_service_id,
          link,
          quantity,
        });
        const providerOrderId = providerResponse?.order?.toString() ?? null;
        if (providerOrderId) {
          await pool.query(
            `UPDATE orders SET provider_order_id = ?, status = 'active' WHERE id = ?`,
            [providerOrderId, orderId],
          );
        }
      } catch (provErr) {
        logger.error(`Provider order failed for order #${orderId}: ${provErr.message}`);
        await pool.query(
          `UPDATE orders SET status = 'error', notes = ? WHERE id = ?`,
          [provErr.message?.slice(0, 500), orderId],
        );
      }
    });

    const order = await orderModel.findById(orderId);
    return successResponse(res, order, 'Orden creada exitosamente', 201);

  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) { /* ya committed o sin transaction */ }
    conn.release();
    next(err);
  }
};

const getOrder = async (req, res, next) => {
  try {
    const order = await orderModel.findById(req.params.id);
    if (!order || order.user_id !== req.user.id) {
      return errorResponse(res, 'Orden no encontrada', 404);
    }
    return successResponse(res, order);
  } catch (err) {
    next(err);
  }
};

module.exports = { getOrders, getOrderStats, createOrder, getOrder };
