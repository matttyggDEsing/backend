const userModel = require('../models/userModel');
const serviceModel = require('../models/serviceModel');
const orderModel = require('../models/orderModel');
const transactionModel = require('../models/transactionModel');
const apiLogModel = require('../models/apiKeyModel');
const { pool } = require('../config/db');
const smm = require('../services/smmProvider');
const logger = require('../utils/logger');

const respond = (res, data, statusCode = 200) => {
  res.status(statusCode).json(data);
};

const error = (res, message, statusCode = 400) => {
  res.status(statusCode).json({ error: message });
};

const publicApi = async (req, res) => {
  const ip = req.ip;
  const { key, action } = req.body;

  if (!key) return error(res, 'API key requerida', 401);
  if (!action) return error(res, 'Acción requerida', 400);

  const user = await userModel.findByApiKey(key);
  if (!user) return error(res, 'API key inválida', 401);
  if (user.status === 'banned') return error(res, 'Cuenta suspendida', 403);

  let responseData = {};
  let statusCode = 200;

  try {
    switch (action) {
      case 'services': {
        const services = await serviceModel.getActive();
        responseData = services.map((s) => ({
          service:     s.id,
          name:        s.name,
          type:        s.type,
          rate:        s.rate,
          min:         s.min_order,
          max:         s.max_order,
          refill:      !!s.refill,
          cancel:      !!s.cancel,
          category:    s.category_name,
        }));
        break;
      }

      case 'add': {
        const { service: serviceId, link, quantity } = req.body;
        if (!serviceId || !link || !quantity) {
          return error(res, 'service, link y quantity son requeridos');
        }

        const service = await serviceModel.findById(serviceId);
        if (!service || !service.is_active) return error(res, 'Servicio no disponible');

        const qty = parseInt(quantity);
        if (qty < service.min_order || qty > service.max_order) {
          return error(res, `Cantidad debe estar entre ${service.min_order} y ${service.max_order}`);
        }

        const charge = parseFloat(((service.rate / 1000) * qty).toFixed(4));

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [[userRow]] = await conn.query(
            'SELECT balance FROM users WHERE id = ? FOR UPDATE', [user.id],
          );

          if (parseFloat(userRow.balance) < charge) {
            await conn.rollback();
            conn.release();
            return error(res, 'Saldo insuficiente');
          }

          const balanceBefore = parseFloat(userRow.balance);
          await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [charge, user.id]);

          const orderId = await orderModel.create(conn, {
            user_id: user.id, service_id: service.id,
            provider_id: service.provider_id, link, quantity: qty,
            charge, cost: 0,
          });

          await transactionModel.create(conn, {
            user_id: user.id, order_id: orderId, type: 'debit',
            amount: charge, balance_before: balanceBefore,
            balance_after: balanceBefore - charge,
            description: `API order #${orderId}`,
          });

          await conn.commit();
          conn.release();

          // Enviar al proveedor SMM async
          setImmediate(async () => {
            try {
              const smmResult = await smm.addOrder({
                service: service.provider_service_id, link, quantity: qty,
              });
              await orderModel.updateProviderOrder(orderId, String(smmResult.order));
            } catch (_) {}
          });

          responseData = { order: orderId };
          statusCode = 201;
        } catch (e) {
          await conn.rollback().catch(() => {});
          conn.release();
          throw e;
        }
        break;
      }

      case 'status': {
        const { order: orderId, orders: orderIds } = req.body;

        if (orderIds) {
          const ids = orderIds.split(',').map((id) => parseInt(id.trim()));
          const results = {};
          for (const id of ids) {
            const o = await orderModel.findById(id);
            if (o && o.user_id === user.id) {
              results[id] = {
                charge:      o.charge,
                start_count: o.start_count,
                status:      o.status,
                remains:     o.remains,
                currency:    'USD',
              };
            }
          }
          responseData = results;
        } else if (orderId) {
          const o = await orderModel.findById(orderId);
          if (!o || o.user_id !== user.id) return error(res, 'Orden no encontrada', 404);
          responseData = {
            charge:      o.charge,
            start_count: o.start_count,
            status:      o.status,
            remains:     o.remains,
            currency:    'USD',
          };
        } else {
          return error(res, 'order o orders requerido');
        }
        break;
      }

      case 'balance': {
        responseData = { balance: String(user.balance), currency: 'USD' };
        break;
      }

      default:
        return error(res, 'Acción no reconocida', 400);
    }
  } catch (err) {
    logger.error(`[PublicAPI] Error: ${err.message}`);
    statusCode = 500;
    responseData = { error: 'Error interno' };
  }

  // Log del request
  await apiLogModel.log({
    user_id: user.id,
    action,
    request_data: { ...req.body, key: '[REDACTED]' },
    response_data: responseData,
    ip,
    status_code: statusCode,
  });

  return respond(res, responseData, statusCode);
};

module.exports = { publicApi };
