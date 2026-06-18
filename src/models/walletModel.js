'use strict';

const { pool } = require('../config/db');

/**
 * Retorna el balance actual del usuario.
 */
const getBalance = async (userId) => {
  const [rows] = await pool.query(
    `SELECT balance FROM wallets WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows[0] ? parseFloat(rows[0].balance) : 0;
};

/**
 * Asegura que el usuario tenga una wallet (upsert).
 */
const ensureWallet = async (userId) => {
  await pool.query(
    `INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)`,
    [userId],
  );
};

/**
 * Obtiene historial de transacciones del usuario con paginación.
 */
const getTransactions = async (userId, { limit = 20, offset = 0 } = {}) => {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM wallet_transactions WHERE user_id = ?`,
    [userId],
  );
  const [rows] = await pool.query(
    `SELECT id, type, amount, balance_after, description, status, reference_id, created_at
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return { rows, total };
};

/**
 * Acredita o debita fondos de manera atómica con registro de transacción.
 * @param {Object} conn - Conexión MySQL con transacción activa
 * @param {Object} opts
 * @param {number}  opts.userId
 * @param {'credit'|'debit'} opts.type
 * @param {number}  opts.amount - siempre positivo
 * @param {string}  opts.description
 * @param {string}  [opts.status='completed']
 * @param {number}  [opts.referenceId] - ID de orden o pago relacionado
 * @returns {{ newBalance: number, transactionId: number }}
 */
const applyTransaction = async (conn, { userId, type, amount, description, status = 'completed', referenceId = null }) => {
  const operator = type === 'credit' ? '+' : '-';

  // Bloquear fila de wallet para evitar condición de carrera
  const [walletRows] = await conn.query(
    `SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE`,
    [userId],
  );

  if (!walletRows.length) {
    throw new Error('Wallet no encontrada para el usuario');
  }

  const currentBalance = parseFloat(walletRows[0].balance);

  if (type === 'debit' && currentBalance < amount) {
    throw new Error('Saldo insuficiente');
  }

  const newBalance = parseFloat((currentBalance + (type === 'credit' ? amount : -amount)).toFixed(6));

  await conn.query(
    `UPDATE wallets SET balance = ? WHERE user_id = ?`,
    [newBalance, userId],
  );

  const [result] = await conn.query(
    `INSERT INTO wallet_transactions
       (user_id, type, amount, balance_after, description, status, reference_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, amount, newBalance, description, status, referenceId],
  );

  return { newBalance, transactionId: result.insertId };
};

/**
 * Registra una solicitud de depósito (pendiente hasta confirmar pago).
 */
const createDepositRequest = async (userId, { amount, method, externalRef }) => {
  const [result] = await pool.query(
    `INSERT INTO deposit_requests (user_id, amount, method, external_ref, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [userId, amount, method, externalRef],
  );
  return result.insertId;
};

/**
 * Confirma un depósito y acredita el balance (usado por webhooks o admin).
 */
const confirmDeposit = async (depositId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[deposit]] = await conn.query(
      `SELECT * FROM deposit_requests WHERE id = ? AND status = 'pending' FOR UPDATE`,
      [depositId],
    );
    if (!deposit) throw new Error('Depósito no encontrado o ya procesado');

    await conn.query(
      `UPDATE deposit_requests SET status = 'completed' WHERE id = ?`,
      [depositId],
    );

    const { newBalance, transactionId } = await applyTransaction(conn, {
      userId: deposit.user_id,
      type: 'credit',
      amount: parseFloat(deposit.amount),
      description: `Depósito confirmado (${deposit.method})`,
      referenceId: depositId,
    });

    await conn.commit();
    return { newBalance, transactionId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  getBalance,
  ensureWallet,
  getTransactions,
  applyTransaction,
  createDepositRequest,
  confirmDeposit,
};



