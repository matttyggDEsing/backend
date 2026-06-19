require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const hpp     = require('hpp');
const morgan  = require('morgan');
const path    = require('path');

const env            = require('./src/config/env');
const { testConnection: testDB } = require('./src/config/db');
const { testConnection: testRedis } = require('./src/config/redis');
const logger         = require('./src/utils/logger');
const { general }    = require('./src/middleware/rateLimiter');
const errorHandler   = require('./src/middleware/errorHandler');
const orderProcessor = require('./src/services/orderProcessor');

// ── Rutas ──────────────────────────────────────────────────────────────────
const authRoutes      = require('./src/routes/auth');
const ordersRoutes    = require('./src/routes/orders');
const servicesRoutes  = require('./src/routes/services');
const walletRoutes    = require('./src/routes/wallet');
const ticketsRoutes   = require('./src/routes/tickets');
const providersRoutes = require('./src/routes/providers');
const adminRoutes     = require('./src/routes/admin');
const publicApiRoutes = require('./src/routes/publicApi');
const sellerRoutes    = require('./src/routes/seller');   // ← NUEVO

const app = express();

// ── Seguridad ──────────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin:      env.FRONTEND_URL,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use(hpp());
app.use(general);

// ── Parsing ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Archivos estáticos — comprobantes de vendedores ────────────────────────
// Los archivos subidos por multer quedan en /uploads/vouchers/
// y se sirven en /uploads/vouchers/<filename>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Logging HTTP ───────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// ── Mantenimiento ──────────────────────────────────────────────────────────
app.use(require('./src/middleware/maintenance'));

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/orders',    ordersRoutes);
app.use('/api/services',  servicesRoutes);
app.use('/api/wallet',    walletRoutes);
app.use('/api/tickets',   ticketsRoutes);
app.use('/api/providers', providersRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/v2',        publicApiRoutes);
app.use('/api/settings',       require('./src/routes/settings'));
app.use('/api/admin/settings', require('./src/routes/settings'));
app.use('/api/api-key',        require('./src/routes/apiKey'));
app.use('/api/seller',         sellerRoutes);   // ← NUEVO

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Ruta no encontrada' });
});

// ── Error Handler Global ───────────────────────────────────────────────────
app.use(errorHandler);

// ── Inicio ─────────────────────────────────────────────────────────────────
const start = async () => {
  await testDB();
  await testRedis();

  orderProcessor.start();

  app.listen(env.PORT, () => {
    logger.info(`🚀 NexaPanel backend corriendo en puerto ${env.PORT} [${env.NODE_ENV}]`);
  });
};

start().catch((err) => {
  logger.error('Error al iniciar el servidor:', err.message);
  process.exit(1);
});

module.exports = app;
