'use strict';

const { pool }         = require('../config/db');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate }     = require('../utils/pagination');
const logger           = require('../utils/logger');

/* ─────────────────────────────────────────────────────────────
   GET /api/wallet  y  GET /api/wallet/balance  → saldo real
──────────────────────────────────────────────────────────────── */
const getWallet = async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT balance FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
    );
    if (!user) return errorResponse(res, 'Usuario no encontrado', 404);
    return successResponse(res, {
      balance:  parseFloat(user.balance),
      currency: 'USD',
    });
  } catch (err) {
    next(err);
  }
};

// Alias explícito para que GET /api/wallet/balance también funcione
const getBalance = getWallet;

/* ─────────────────────────────────────────────────────────────
   GET /api/wallet/transactions  → historial
──────────────────────────────────────────────────────────────── */
const getTransactions = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { type } = req.query;

    const conditions = ['t.user_id = ?'];
    const params     = [req.user.id];

    if (type === 'credit' || type === 'debit') {
      conditions.push('t.type = ?');
      params.push(type);
    }

    const where = conditions.join(' AND ');

    const [rows] = await pool.query(
      `SELECT t.id, t.type, t.amount, t.balance_before, t.balance_after,
              t.description, t.method, t.reference, t.status, t.created_at,
              o.link AS order_link
       FROM transactions t
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions t WHERE ${where}`,
      params,
    );

    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/wallet/deposit  → solicitar depósito (pending)
──────────────────────────────────────────────────────────────── */
const requestDeposit = async (req, res, next) => {
  try {
    const { amount, method = 'manual' } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) < 1) {
      return errorResponse(res, 'El monto mínimo de depósito es $1.00', 400);
    }

    const VALID_METHODS = ['crypto', 'paypal', 'stripe', 'manual'];
    if (!VALID_METHODS.includes(method)) {
      return errorResponse(res, `Método inválido. Usa: ${VALID_METHODS.join(', ')}`, 400);
    }

    const [result] = await pool.query(
      `INSERT INTO deposit_requests (user_id, amount, method, status)
       VALUES (?, ?, ?, 'pending')`,
      [req.user.id, parseFloat(amount), method],
    );

    logger.info(`Deposit request #${result.insertId} by user ${req.user.id} for $${amount}`);

    return successResponse(
      res,
      { id: result.insertId, amount: parseFloat(amount), method, status: 'pending' },
      'Solicitud de depósito creada. Un administrador la procesará en breve.',
      201,
    );
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   GET /api/wallet/deposits  → historial de depósitos del usuario
──────────────────────────────────────────────────────────────── */
const getDeposits = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);

    const [rows] = await pool.query(
      `SELECT id, amount, method, status, created_at, updated_at
       FROM deposit_requests
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM deposit_requests WHERE user_id = ?',
      [req.user.id],
    );

    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getWallet, getBalance, getTransactions, requestDeposit, getDeposits };
