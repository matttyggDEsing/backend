'use strict';

const walletModel = require('../models/walletModel');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');
const { pool } = require('../config/db');

/**
 * GET /api/wallet
 * Retorna el balance actual del usuario autenticado.
 */
const getWallet = async (req, res, next) => {
  try {
    await walletModel.ensureWallet(req.user.id);
    const balance = await walletModel.getBalance(req.user.id);
    return successResponse(res, { balance, currency: 'USD' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/wallet/transactions
 * Historial de movimientos con paginación.
 */
const getTransactions = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { rows, total } = await walletModel.getTransactions(req.user.id, { limit, offset });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/wallet/deposit
 * Crea una solicitud de depósito.
 * Body: { amount, method }
 *   method: 'crypto' | 'paypal' | 'stripe' | 'manual'
 */
const requestDeposit = async (req, res, next) => {
  try {
    const { amount, method = 'manual' } = req.body;

    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      return errorResponse(res, 'Monto inválido', 400);
    }

    const parsedAmount = parseFloat(parseFloat(amount).toFixed(2));
    if (parsedAmount < 1) {
      return errorResponse(res, 'El monto mínimo de depósito es $1.00', 400);
    }

    const ALLOWED_METHODS = ['crypto', 'paypal', 'stripe', 'manual'];
    if (!ALLOWED_METHODS.includes(method)) {
      return errorResponse(res, 'Método de pago no válido', 400);
    }

    const depositId = await walletModel.createDepositRequest(req.user.id, {
      amount: parsedAmount,
      method,
      externalRef: null,
    });

    return successResponse(
      res,
      { deposit_id: depositId, amount: parsedAmount, method, status: 'pending' },
      'Solicitud de depósito creada. Espera la confirmación.',
      201,
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/wallet/confirm-deposit
 * [Admin] Confirma un depósito manual y acredita el balance.
 * Body: { deposit_id }
 */
const confirmDeposit = async (req, res, next) => {
  try {
    const { deposit_id } = req.body;
    if (!deposit_id) return errorResponse(res, 'deposit_id requerido', 400);

    const result = await walletModel.confirmDeposit(deposit_id);
    return successResponse(res, result, 'Depósito confirmado y balance acreditado');
  } catch (err) {
    if (err.message.includes('no encontrado') || err.message.includes('ya procesado')) {
      return errorResponse(res, err.message, 404);
    }
    next(err);
  }
};

/**
 * GET /api/admin/wallet/deposits
 * [Admin] Lista solicitudes de depósito con filtro de estado.
 */
const listDeposits = async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT dr.id, dr.user_id, u.email, dr.amount, dr.method,
             dr.external_ref, dr.status, dr.created_at
      FROM deposit_requests dr
      JOIN users u ON u.id = dr.user_id
    `;
    const params = [];
    if (status) {
      sql += ' WHERE dr.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY dr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(sql, params);
    return successResponse(res, rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { getWallet, getTransactions, requestDeposit, confirmDeposit, listDeposits };
