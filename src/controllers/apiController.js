'use strict';

/**
 * apiController.js — VERSIÓN CORREGIDA
 *
 * BUG ORIGINAL: línea ~1009 usaba s.category_name pero serviceModel.getActive()
 * devuelve el alias `category` (sin _name). Resultado: category: undefined en
 * todas las respuestas de la API pública.
 */

const serviceModel       = require('../models/serviceModel');
const orderModel         = require('../models/orderModel');
const userModel          = require('../models/userModel');
const transactionModel   = require('../models/transactionModel');
const smm                = require('../services/smmProvider');
const { pool }           = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');
const logger             = require('../utils/logger');

/* ─────────────────────────────────────────────────────────────
   POST /api/v2   (estándar SMM Panel v2)
──────────────────────────────────────────────────────────────── */
const publicApi = async (req, res, next) => {
  try {
    const { key, action } = req.body;

    if (!key) return res.json({ error: 'API key requerida' });

    // Autenticar por api_key
    const user = await userModel.findByApiKey(key);
    if (!user) return res.json({ error: 'API key inválida' });
    if (user.status === 'banned') return res.json({ error: 'Cuenta suspendida' });

    switch (action) {
      // ── Listar servicios ────────────────────────────────────
      case 'services': {
        const services = await serviceModel.getActive();

        // FIX: era s.category_name, debe ser s.category
        return res.json(
          services.map((s) => ({
            service:   s.id,
            name:      s.name,
            type:      s.type,
            rate:      parseFloat(s.rate).toFixed(2),
            min:       s.min_order,
            max:       s.max_order,
            category:  s.category,      // ← FIX (antes: s.category_name → undefined)
            refill:    Boolean(s.refill),
            cancel:    Boolean(s.cancel),
            dripfeed:  false,
          })),
        );
      }

      // ── Crear orden ─────────────────────────────────────────
      case 'add': {
        const { service, link, quantity } = req.body;

        if (!service || !link || !quantity) {
          return res.json({ error: 'Parámetros requeridos: service, link, quantity' });
        }

        const svc = await serviceModel.findById(parseInt(service));
        if (!svc) return res.json({ error: 'Servicio no encontrado' });

        const qty = parseInt(quantity);
        if (qty < svc.min_order || qty > svc.max_order) {
          return res.json({
            error: `La cantidad debe estar entre ${svc.min_order} y ${svc.max_order}`,
          });
        }

        const charge = parseFloat(((svc.rate / 1000) * qty).toFixed(4));

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [[userRow]] = await conn.query(
            'SELECT balance FROM users WHERE id = ? FOR UPDATE',
            [user.id],
          );

          if (!userRow || parseFloat(userRow.balance) < charge) {
            await conn.rollback();
            conn.release();
            return res.json({ error: 'Saldo insuficiente' });
          }

          const balanceBefore = parseFloat(userRow.balance);

          await conn.query(
            'UPDATE users SET balance = balance - ? WHERE id = ?',
            [charge, user.id],
          );

          // Enviar al proveedor
          let providerOrderId = null;
          try {
            const providerResponse = await smm.addOrder({
              service: svc.provider_service_id,
              link,
              quantity: qty,
            });
            providerOrderId = providerResponse?.order?.toString() ?? null;
          } catch (provErr) {
            logger.warn(`Provider order failed for user ${user.id}: ${provErr.message}`);
          }

          const [orderResult] = await conn.query(
            `INSERT INTO orders
               (user_id, service_id, provider_id, provider_order_id, link, quantity, charge, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [user.id, svc.id, svc.provider_id, providerOrderId, link, qty, charge],
          );

          await conn.query(
            `INSERT INTO transactions
               (user_id, order_id, type, amount, balance_before, balance_after, description, status)
             VALUES (?, ?, 'debit', ?, ?, ?, ?, 'completed')`,
            [
              user.id,
              orderResult.insertId,
              charge,
              balanceBefore,
              balanceBefore - charge,
              `Orden #${orderResult.insertId} — ${svc.name}`,
            ],
          );

          await conn.query(
            `UPDATE users SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?`,
            [charge, user.id],
          );

          await conn.commit();

          return res.json({ order: orderResult.insertId });
        } catch (txErr) {
          await conn.rollback();
          throw txErr;
        } finally {
          conn.release();
        }
      }

      // ── Estado de una orden ──────────────────────────────────
      case 'status': {
        const { order } = req.body;
        if (!order) return res.json({ error: 'Parámetro requerido: order' });

        const [rows] = await pool.query(
          `SELECT status, charge, remains, start_count FROM orders
           WHERE id = ? AND user_id = ? LIMIT 1`,
          [parseInt(order), user.id],
        );
        if (!rows[0]) return res.json({ error: 'Orden no encontrada' });

        const o = rows[0];
        return res.json({
          charge:      parseFloat(o.charge).toFixed(4),
          start_count: o.start_count ?? 0,
          remains:     o.remains ?? 0,
          status:      o.status,
          currency:    'USD',
        });
      }

      // ── Estado de múltiples órdenes ──────────────────────────
      case 'status_multi': {
        const { orders } = req.body;
        if (!orders) return res.json({ error: 'Parámetro requerido: orders' });

        const ids = String(orders).split(',').map(Number).filter(Boolean);
        if (!ids.length) return res.json({ error: 'Lista de órdenes inválida' });

        const placeholders = ids.map(() => '?').join(',');
        const [rows] = await pool.query(
          `SELECT id, status, charge, remains, start_count FROM orders
           WHERE id IN (${placeholders}) AND user_id = ?`,
          [...ids, user.id],
        );

        const result = {};
        for (const o of rows) {
          result[o.id] = {
            charge:      parseFloat(o.charge).toFixed(4),
            start_count: o.start_count ?? 0,
            remains:     o.remains ?? 0,
            status:      o.status,
            currency:    'USD',
          };
        }
        return res.json(result);
      }

      // ── Balance del usuario ──────────────────────────────────
      case 'balance': {
        const [[freshUser]] = await pool.query(
          'SELECT balance FROM users WHERE id = ? LIMIT 1',
          [user.id],
        );
        return res.json({
          balance:  parseFloat(freshUser.balance).toFixed(4),
          currency: 'USD',
        });
      }

      default:
        return res.json({ error: `Acción no reconocida: ${action}` });
    }
  } catch (err) {
    logger.error('publicApi error:', err);
    return res.json({ error: 'Error interno del servidor' });
  }
};

module.exports = { publicApi };
