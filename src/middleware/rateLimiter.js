const rateLimit = require('express-rate-limit');
const { errorResponse } = require('../utils/response');

const handler = (req, res) =>
  errorResponse(res, 'Demasiadas solicitudes. Intenta de nuevo más tarde.', 429);

// General: 200 req/min por IP
const general = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Login: 10 req / 15 min por IP
const login = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Register: 5 req / hora por IP
const register = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Crear orden: 30 req/min por usuario (usa user.id si está autenticado)
const createOrder = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req.user ? `user_${req.user.id}` : req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// API pública /api/v2: 60 req/min por API key
const publicApi = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.body?.key || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { general, login, register, createOrder, publicApi };






