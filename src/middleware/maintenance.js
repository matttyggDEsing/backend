const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const env = require('../config/env');

// ── Cache en memoria para no pegarle a la DB en cada request ──────────────
// Se invalida sola cada CACHE_TTL_MS. Cuando el admin guarda el toggle desde
// el panel, el cambio tarda como máximo este tiempo en propagarse.
const CACHE_TTL_MS = 5000;
let cache = { value: null, expiresAt: 0 };

async function getMaintenanceSetting() {
  const now = Date.now();
  if (cache.value !== null && now < cache.expiresAt) {
    return cache.value;
  }

  const [rows] = await pool.query(
    'SELECT value FROM settings WHERE `key` = ? LIMIT 1',
    ['maintenance_mode'],
  );

  let value = { enabled: false, message: '' };
  if (rows[0]) {
    try {
      const parsed = JSON.parse(rows[0].value);
      value = { enabled: !!parsed.enabled, message: parsed.message || '' };
    } catch (_) {
      // valor corrupto en DB → tratamos como apagado para no bloquear el sitio
    }
  }

  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

// Rutas públicas que siempre deben estar disponibles, incluso en mantenimiento
const publicPaths = ['/api/auth/login', '/api/auth/register', '/health'];

module.exports = async function maintenanceMiddleware(req, res, next) {
  try {
    // Rutas públicas siempre pasan, sin tocar la DB
    if (publicPaths.some((p) => req.path.startsWith(p))) return next();

    // ── Si hay token y es admin → siempre pasa ──────────────────
    // (chequeamos esto antes de la DB para no penalizar al admin con una
    // query extra en cada request)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), env.JWT_SECRET);
        if (decoded.role === 'admin') return next();
      } catch (_) {
        // token inválido/vencido → seguimos evaluando como visitante normal
      }
    }

    const settings = await getMaintenanceSetting();
    if (!settings.enabled) return next();

    // ── Bloquear todo lo demás ───────────────────────────────────
    return res.status(503).json({
      success: false,
      message: settings.message || 'El sitio está en mantenimiento. Volvé más tarde.',
    });
  } catch (err) {
    // Si falla la DB u otra cosa inesperada, no queremos tirar todo el sitio
    // abajo por un error en el chequeo de mantenimiento → dejamos pasar.
    return next();
  }
};



