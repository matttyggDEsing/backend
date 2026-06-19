'use strict';

const { pool }         = require('../config/db');
const orderModel       = require('../models/orderModel');
const serviceModel     = require('../models/serviceModel');
const providerModel    = require('../models/providerModel');
const smm              = require('../services/smmProvider');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate }     = require('../utils/pagination');
const logger           = require('../utils/logger');

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

const getOrderChart = async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const [rows] = await pool.query(
      `SELECT DATE(created_at) AS date,
              COUNT(*)         AS orders,
              SUM(charge)      AS revenue
       FROM orders
       WHERE user_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [req.user.id, days],
    );

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d    = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const found   = rows.find((r) => r.date?.toISOString?.().slice(0, 10) === dateStr || r.date === dateStr);
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
    const { service_id, link, quantity, comments } = req.body;
    const userId = req.user.id;

    const service = await serviceModel.findById(service_id);
    if (!service || !service.is_active) {
      conn.release();
      return errorResponse(res, 'Servicio no disponible', 404);
    }

    // Para servicios de tipo Comments, comments es requerido
    const isCommentService = /comment/i.test(service.type ?? '');
    if (isCommentService && (!comments || !comments.toString().trim())) {
      conn.release();
      return errorResponse(res, 'Este servicio requiere que ingreses los comentarios', 400);
    }

    // Sincronizar límites min/max con el proveedor antes de validar
    try {
      const provider = await providerModel.findById(service.provider_id);
      if (provider) {
        await smm.invalidateServicesCache(provider.api_url);
        const providerServices = await Promise.race([
          smm.getServices(provider.api_url, provider.api_key),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);

        if (Array.isArray(providerServices)) {
          const ps = providerServices.find(
            (s) => String(s.service) === String(service.provider_service_id),
          );
          if (ps) {
            const provMin = parseInt(ps.min, 10);
            const provMax = parseInt(ps.max, 10);
            if (
              (!isNaN(provMin) && provMin !== service.min_order) ||
              (!isNaN(provMax) && provMax !== service.max_order)
            ) {
              await pool.query(
                'UPDATE services SET min_order = ?, max_order = ?, updated_at = NOW() WHERE id = ?',
                [
                  isNaN(provMin) ? service.min_order : provMin,
                  isNaN(provMax) ? service.max_order : provMax,
                  service.id,
                ],
              );
              if (!isNaN(provMin)) service.min_order = provMin;
              if (!isNaN(provMax)) service.max_order = provMax;
              logger.info(`[Orders] Servicio #${service.id} actualizado: min=${service.min_order}, max=${service.max_order}`);
            }
          }
        }
      }
    } catch (syncErr) {
      // No bloquear la orden si el sync falla (timeout, red caída, etc.)
      logger.warn(`[Orders] No se pudo sincronizar límites del servicio #${service.id}: ${syncErr.message}`);
    }

    // Validar cantidad contra los límites actualizados
    if (quantity < service.min_order || quantity > service.max_order) {
      conn.release();
      return errorResponse(
        res,
        `La cantidad debe estar entre ${service.min_order} y ${service.max_order}`,
        400,
      );
    }

    const charge = parseFloat(((service.rate / 1000) * quantity).toFixed(4));

    // FIX: provider_rate puede no existir si la migración migration_provider_rate.sql
    // no fue ejecutada todavía. En ese caso caemos a rate (precio usuario) como costo,
    // lo cual es incorrecto para el margen pero no bloquea la orden.
    // Si provider_rate es 0 (valor por defecto de la columna) también usamos rate.
    const rawProviderRate = parseFloat(service.provider_rate);
    const providerRate    = (!isNaN(rawProviderRate) && rawProviderRate > 0)
      ? rawProviderRate
      : parseFloat(service.rate);
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

    // Enviar la orden al proveedor en segundo plano
    setImmediate(async () => {
      try {
        const provider = await providerModel.findById(service.provider_id);

        // FIX PRINCIPAL: se pasan apiUrl y apiKey separados del resto de los params.
        // smmProvider.addOrder({ apiUrl, apiKey, ...orderParams }) hace spread de todo
        // lo demás, así que comments, runs, interval, etc. llegan intactos al proveedor.
        const orderParams = {
          service:  service.provider_service_id,
          link,
          quantity,
          apiUrl:   provider?.api_url,
          apiKey:   provider?.api_key,
        };

        if (isCommentService && comments) {
          orderParams.comments = comments.toString().trim();
        }

        const providerResponse = await smm.addOrder(orderParams);
        const providerOrderId  = providerResponse?.order?.toString() ?? null;

        if (providerOrderId) {
          await pool.query(
            `UPDATE orders SET provider_order_id = ?, status = 'active' WHERE id = ?`,
            [providerOrderId, orderId],
          );
        }
      } catch (provErr) {
        logger.error(`[Orders] Provider order failed for order #${orderId}: ${provErr.message}`);

        // Reembolso automático si el proveedor rechaza la orden
        try {
          await pool.query(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [charge, userId],
          );
          await pool.query(
            `INSERT INTO transactions
               (user_id, order_id, type, amount, balance_before, balance_after, description, status)
             VALUES (?, ?, 'credit', ?, ?, ?, ?, 'completed')`,
            [
              userId, orderId, charge,
              balanceBefore - charge,
              balanceBefore,
              `Reembolso automático — Orden #${orderId} rechazada por el proveedor`,
            ],
          );
          logger.info(`[Orders] Reembolso de $${charge} aplicado al usuario #${userId} (orden #${orderId})`);
        } catch (refundErr) {
          logger.error(`[Orders] CRÍTICO: no se pudo reembolsar orden #${orderId}: ${refundErr.message}`);
        }

        await pool.query(
          `UPDATE orders SET status = 'error', notes = ? WHERE id = ?`,
          [`Rechazada por el proveedor: ${provErr.message?.slice(0, 480)}`, orderId],
        );
      }
    });

    const order = await orderModel.findById(orderId);
    return successResponse(res, order, 'Orden creada exitosamente', 201);

  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
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
