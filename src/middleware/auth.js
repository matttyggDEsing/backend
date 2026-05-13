const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { errorResponse } = require('../utils/response');
const env = require('../config/env');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, 'Token de autenticación requerido', 401);
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const [rows] = await pool.query(
      'SELECT id, role, email, balance, status FROM users WHERE id = ? LIMIT 1',
      [decoded.id],
    );

    if (!rows.length) {
      return errorResponse(res, 'Usuario no encontrado', 401);
    }

    const user = rows[0];

    if (user.status === 'banned') {
      return errorResponse(res, 'Cuenta suspendida. Contacta soporte.', 403);
    }

    req.user = {
      id:      user.id,
      role:    user.role,
      email:   user.email,
      balance: user.balance,
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = auth;
