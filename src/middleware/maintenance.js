const fs  = require('fs');
const path = require('path');
const jwt  = require('jsonwebtoken');

const SETTINGS_FILE = path.join(__dirname, '../../data/settings.json');

module.exports = function maintenanceMiddleware(req, res, next) {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return next();
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (!settings.maintenance_mode) return next();

    // ── Si hay token y es admin → siempre pasa ──────────────────
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        if (decoded.role === 'admin') return next();
      } catch (_) {}
    }

    // ── Rutas públicas que siempre deben estar disponibles ───────
    const publicPaths = ['/api/auth/login', '/api/auth/register', '/health'];
    if (publicPaths.some(p => req.path.startsWith(p))) return next();

    // ── Bloquear todo lo demás ───────────────────────────────────
    return res.status(503).json({
      success: false,
      message: settings.maintenance_message || 'El sitio está en mantenimiento. Volvé más tarde.',
    });

  } catch (_) {
    return next();
  }
};