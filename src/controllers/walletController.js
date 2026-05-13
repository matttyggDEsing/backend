const { pool } = require('../config/db');
const userModel = require('../models/userModel');
const transactionModel = require('../models/transactionModel');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

const getBalance = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id);
    return successResponse(res, { balance: user.balance });
  } catch (err) {
    next(err);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { rows, total } = await transactionModel.findByUser(req.user.id, { limit, offset });
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
 * Añadir fondos (admin/manual — integración de pagos a implementar).
 * En producción esto se conectaría a Stripe/PayPal webhook.
 */
const addFunds = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { amount, method = 'manual', reference } = req.body;
    const userId = req.user.id;

    await conn.beginTransaction();

    const [[userRow]] = await conn.query(
      'SELECT balance FROM users WHERE id = ? FOR UPDATE',
      [userId],
    );

    const balanceBefore = parseFloat(userRow.balance);
    const parsedAmount = parseFloat(amount);

    await conn.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [parsedAmount, userId],
    );

    await transactionModel.create(conn, {
      user_id:        userId,
      order_id:       null,
      type:           'credit',
      amount:         parsedAmount,
      balance_before: balanceBefore,
      balance_after:  balanceBefore + parsedAmount,
      description:    `Recarga de fondos vía ${method}`,
      method,
      reference:      reference || null,
      status:         'completed',
    });

    await conn.commit();
    const updatedUser = await userModel.findById(userId);
    return successResponse(res, { balance: updatedUser.balance }, 'Fondos añadidos correctamente');
  } catch (err) {
    await conn.rollback().catch(() => {});
    next(err);
  } finally {
    conn.release();
  }
};

module.exports = { getBalance, getTransactions, addFunds };
