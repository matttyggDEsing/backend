'use strict';

const { pool } = require('../config/db');
const { generateApiKey } = require('../utils/crypto');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

// GET /api/api-key — retorna la api key del usuario autenticado
const getApiKey = async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT api_key, created_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
    );
    if (!user) return errorResponse(res, 'Usuario no encontrado', 404);
    return successResponse(res, { api_key: user.api_key });
  } catch (err) {
    next(err);
  }
};

// POST /api/api-key/regenerate — genera una nueva api key
const regenerateApiKey = async (req, res, next) => {
  try {
    const newKey = generateApiKey();
    await pool.query(
      'UPDATE users SET api_key = ?, updated_at = NOW() WHERE id = ?',
      [newKey, req.user.id],
    );
    return successResponse(res, { api_key: newKey }, 'API key regenerada');
  } catch (err) {
    next(err);
  }
};

// GET /api/api-key/stats — estadísticas de uso
const getStats = async (req, res, next) => {
  try {
    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*) AS total_requests,
         SUM(CASE WHEN status_code < 300 THEN 1 ELSE 0 END) AS successful,
         SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors
       FROM api_logs WHERE user_id = ?`,
      [req.user.id],
    );
    return successResponse(res, stats ?? { total_requests: 0, successful: 0, errors: 0 });
  } catch (err) {
    next(err);
  }
};

// GET /api/api-key/logs — historial de llamadas a la API pública
const getLogs = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const [rows] = await pool.query(
      `SELECT id, action, status_code, ip, created_at
       FROM api_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset],
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM api_logs WHERE user_id = ?',
      [req.user.id],
    );
    return paginatedResponse(res, rows, { ...pagination, total, totalPages: Math.ceil(total / pagination.perPage) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getApiKey, regenerateApiKey, getStats, getLogs };






