'use strict';

const { pool }           = require('../config/db');
const orderModel         = require('../models/orderModel');
const serviceModel       = require('../models/serviceModel');
const providerModel      = require('../models/providerModel');
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

/**
 * GET /api/orders/chart?range=7d|30d|90d
 * Devuelve órdenes agrupadas por día para el gráfico del dashboard.
 */
const getOrderChart = async (req, res, next) => {
  try {
    const range = req.query.range || '7d';
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;

    const [rows] = await pool.query(
      `SELECT
         DATE(created_at)            AS date,
         COUNT(*)                    AS orders,
         COALESCE(SUM(charge), 0)    AS revenue
       FROM orders
       WHERE user_id = ?
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [req.user.id, days]
    );

    // Rellenar días sin órdenes con ceros para que el gráfico sea continuo
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found = rows.find((r) => r.date?.toISOString?.().slice(0, 10) === dateStr || r.date === dateStr);
      result.push({
        date:    dateStr,
        orders:  found ? Number(found.orders)  : 0,
        revenue: found ? Number(found.revenue) : 0,
      });
    }

    return successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

const createOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { service_id, link, quantity } = req.body;
    const userId = req.user.id;

    const service = await serviceModel.findById(service_id);
    if (!service || !service.is_active) {
      conn.release();
      return errorResponse(res, 'Servicio no disponible', 404);
    }

    if (quantity < service.min_order || quantity > service.max_order) {
      conn.release();
      return errorResponse(
        res,
        `La cantidad debe estar entre ${service.min_order} y ${service.max_order}`,
        400,
      );
    }

    const charge = parseFloat(((service.rate / 1000) * quantity).toFixed(4));
    const providerRate = parseFloat(service.provider_rate || service.rate);
    const cost = parseFloat(((providerRate / 1000) * quantity).toFixed(4));

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

    await conn.query(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [charge, userId],
    );

    const [orderResult] = await conn.query(
      `INSERT INTO orders
         (user_id, service_id, provider_id, link, quantity, charge, cost, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, service.id, service.provider_id, link, quantity, charge, cost],
    );
    const orderId = orderResult.insertId;

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

    await conn.query(
      `UPDATE users
       SET total_orders = total_orders + 1,
           total_spent  = total_spent  + ?
       WHERE id = ?`,
      [charge, userId],
    );

    await conn.commit();
    conn.release();

    setImmediate(async () => {
      try {
        // FIX: antes se llamaba a smm.addOrder sin pasar las credenciales del
        // proveedor real del servicio (service.provider_id) — siempre pegaba
        // contra el proveedor global de .env, sin importar a cuál proveedor
        // pertenecía el servicio comprado.
        const provider = await providerModel.findById(service.provider_id);
        const providerResponse = await smm.addOrder({
          service:  service.provider_service_id,
          link,
          quantity,
          apiUrl: provider?.api_url,
          apiKey: provider?.api_key,
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
    } catch (_) {}
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

module.exports = { getOrders, getOrderStats, getOrderChart, createOrder, getOrder };





