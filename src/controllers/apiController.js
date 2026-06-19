'use strict';

/**
 * apiController.js
 *
 * RECONSTRUIDO: este archivo venía corrupto en el export original del repo
 * (el dump de origen lo marcaba literalmente como "[Binary file]", sin
 * código real adentro), lo que hacía crashear el servidor al arrancar
 * (`require('./controllers/apiController')` desde routes/publicApi.js).
 *
 * Implementa el estándar de API que usan los paneles SMM (un solo endpoint
 * POST, parámetro `action` para elegir la operación, autenticación vía
 * parámetro `key`). Reutiliza toda la lógica de negocio que ya existe en los
 * modelos (orderModel, serviceModel, etc.) para mantenerse consistente con
 * el resto del sistema — incluye el fix de enrutar cada orden al proveedor
 * SMM correcto en vez de uno global hardcodeado.
 */

const { pool }        = require('../config/db');
const userModel        = require('../models/userModel');
const serviceModel     = require('../models/serviceModel');
const orderModel        = require('../models/orderModel');
const providerModel    = require('../models/providerModel');
const transactionModel = require('../models/transactionModel');
const smm              = require('../services/smmProvider');
const logger           = require('../utils/logger');

class ApiError extends Error {}
const apiError = (message) => new ApiError(message);

const ipOf = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

const logCall = async (userId, action, requestData, responseData, statusCode, ip) => {
  try {
    // No logueamos la api key en texto plano dentro de request_data
    const { key, ...safeRequest } = requestData || {};
    await pool.query(
      `INSERT INTO api_logs (user_id, action, request_data, response_data, ip, status_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action || 'unknown',
        JSON.stringify(safeRequest),
        JSON.stringify(responseData ?? {}),
        ip,
        statusCode,
      ],
    );
  } catch (err) {
    logger.error(`[PublicAPI] No se pudo guardar el log de la llamada: ${err.message}`);
  }
};

// ── Acciones ────────────────────────────────────────────────────────────

const actionServices = async () => {
  const services = await serviceModel.findAll({});
  return services.map((s) => ({
    service:  s.id,
    name:     s.name,
    type:     s.type,
    category: s.category,
    rate:     parseFloat(s.rate).toFixed(4),
    min:      s.min_order,
    max:      s.max_order,
    refill:   !!s.refill,
    cancel:   !!s.cancel,
  }));
};

const actionAdd = async (user, body) => {
  const serviceId = parseInt(body.service);
  const link      = (body.link || '').trim();
  const quantity  = parseInt(body.quantity);

  if (!serviceId) throw apiError('Falta el parámetro service');
  if (!link) throw apiError('Falta el parámetro link');
  if (!quantity || quantity < 1) throw apiError('Falta el parámetro quantity');

  const service = await serviceModel.findById(serviceId);
  if (!service || !service.is_active) throw apiError('Servicio no encontrado');
  if (quantity < service.min_order || quantity > service.max_order) {
    throw apiError(`La cantidad debe estar entre ${service.min_order} y ${service.max_order}`);
  }

  const charge       = parseFloat(((service.rate / 1000) * quantity).toFixed(4));
  const providerRate = parseFloat(service.provider_rate || service.rate);
  const cost         = parseFloat(((providerRate / 1000) * quantity).toFixed(4));

  const conn = await pool.getConnection();
  let orderId;
  try {
    await conn.beginTransaction();

    const [[userRow]] = await conn.query(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [user.id],
    );
    if (!userRow || parseFloat(userRow.balance) < charge) {
      await conn.rollback();
      conn.release();
      throw apiError('Saldo insuficiente');
    }
    const balanceBefore = parseFloat(userRow.balance);

    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [charge, user.id]);

    orderId = await orderModel.create(conn, {
      user_id: user.id, service_id: service.id, provider_id: service.provider_id,
      link, quantity, charge, cost,
    });

    await transactionModel.create(conn, {
      user_id: user.id, order_id: orderId, type: 'debit', amount: charge,
      balance_before: balanceBefore, balance_after: balanceBefore - charge,
      description: `Orden #${orderId} — ${service.name} (API)`,
    });

    await conn.query(
      `UPDATE users SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?`,
      [charge, user.id],
    );

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    throw err;
  } finally {
    conn.release();
  }

  // Enviar la orden al proveedor real en segundo plano, sin bloquear la
  // respuesta a la API (igual que en el endpoint REST de crear orden).
  setImmediate(async () => {
    try {
      const provider = await providerModel.findById(service.provider_id);
      const providerResponse = await smm.addOrder({
        service: service.provider_service_id,
        link, quantity,
        apiUrl: provider?.api_url,
        apiKey: provider?.api_key,
      });
      const providerOrderId = providerResponse?.order?.toString() ?? null;
      if (providerOrderId) {
        await orderModel.updateProviderOrder(orderId, providerOrderId);
      }
    } catch (err) {
      logger.error(`[PublicAPI] Falló el envío al proveedor de la orden #${orderId}: ${err.message}`);
      await pool.query(
        `UPDATE orders SET status = 'error', notes = ? WHERE id = ?`,
        [err.message?.slice(0, 500), orderId],
      );
    }
  });

  return { order: orderId };
};

const STATUS_LABEL = {
  pending: 'Pending', processing: 'Processing', active: 'In progress',
  completed: 'Completed', partial: 'Partial', cancelled: 'Canceled', error: 'Canceled',
};

const formatStatus = (o) => ({
  charge:       parseFloat(o.charge).toFixed(4),
  start_count:  o.start_count ?? 0,
  status:       STATUS_LABEL[o.status] || o.status,
  remains:      o.remains ?? 0,
  currency:     'USD',
});

const actionStatus = async (user, body) => {
  // Soporta tanto `order` (uno solo) como `orders` (varios separados por coma)
  if (body.orders) {
    const ids = String(body.orders).split(',').map((s) => parseInt(s.trim())).filter(Boolean);
    const result = {};
    for (const id of ids) {
      const order = await orderModel.findById(id);
      result[id] = (!order || order.user_id !== user.id)
        ? { error: 'Incorrect order ID' }
        : formatStatus(order);
    }
    return result;
  }

  const orderId = parseInt(body.order);
  if (!orderId) throw apiError('Falta el parámetro order');
  const order = await orderModel.findById(orderId);
  if (!order || order.user_id !== user.id) throw apiError('Orden no encontrada');
  return formatStatus(order);
};

const actionBalance = async (user) => {
  const fresh = await userModel.findById(user.id);
  return { balance: parseFloat(fresh.balance).toFixed(4), currency: 'USD' };
};

const actionRefill = async (user, body) => {
  const orderId = parseInt(body.order);
  if (!orderId) throw apiError('Falta el parámetro order');

  const order = await orderModel.findById(orderId);
  if (!order || order.user_id !== user.id) throw apiError('Orden no encontrada');
  if (!order.provider_order_id) throw apiError('La orden todavía no fue enviada al proveedor');

  const provider = await providerModel.findById(order.provider_id);
  const result = await smm.refillOrder(order.provider_order_id, provider?.api_url, provider?.api_key);
  return { refill: result?.refill ?? order.id };
};

const actionCancel = async (user, body) => {
  const ids = body.orders
    ? String(body.orders).split(',').map((s) => parseInt(s.trim())).filter(Boolean)
    : [parseInt(body.order)].filter(Boolean);

  if (!ids.length) throw apiError('Falta el parámetro order');

  const results = [];
  for (const id of ids) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await orderModel.cancelWithRefund(conn, id, user.id);
      await conn.commit();
      results.push({ order: id, cancel: '1' });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      results.push({ order: id, cancel: '0', error: err.message });
    } finally {
      conn.release();
    }
  }
  return body.orders ? results : results[0];
};

// ── Endpoint único: POST /api/v2  { key, action, ... } ───────────────────
const publicApi = async (req, res) => {
  const ip     = ipOf(req);
  const body   = req.body || {};
  const action = body.action;

  if (!body.key) {
    return res.status(200).json({ error: 'Falta el parámetro key' });
  }

  const user = await userModel.findByApiKey(body.key);
  if (!user) {
    await logCall(null, action, body, { error: 'Invalid API key' }, 401, ip);
    return res.status(200).json({ error: 'API key inválida' });
  }
  if (user.status !== 'active') {
    await logCall(user.id, action, body, { error: 'Account not active' }, 403, ip);
    return res.status(200).json({ error: 'Cuenta no activa' });
  }

  let response;
  let statusCode = 200;
  try {
    switch (action) {
      case 'services': response = await actionServices(); break;
      case 'add':      response = await actionAdd(user, body); break;
      case 'status':   response = await actionStatus(user, body); break;
      case 'balance':  response = await actionBalance(user); break;
      case 'refill':   response = await actionRefill(user, body); break;
      case 'cancel':   response = await actionCancel(user, body); break;
      default:
        response = { error: 'Acción inválida. Usa: services, add, status, balance, refill, cancel' };
    }
  } catch (err) {
    response = { error: err.message || 'Error interno' };
    if (!(err instanceof ApiError)) {
      statusCode = 500;
      logger.error(`[PublicAPI] action=${action} user=${user.id}: ${err.message}`);
    }
  }

  await logCall(user.id, action, body, response, statusCode, ip);
  return res.status(statusCode).json(response);
};

module.exports = { publicApi };



