'use strict';

/**
 * src/routes/seller.js
 * Rutas del módulo vendedor.
 * Todas protegidas con auth + sellerOnly.
 * Registrar en server.js: app.use('/api/seller', sellerRoutes);
 */

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');

const auth       = require('../middleware/auth');
const sellerOnly = require('../middleware/sellerOnly');

const dashboardCtrl = require('../controllers/sellers/sellerDashboardController');
const customerCtrl  = require('../controllers/sellers/sellerCustomerController');
const saleCtrl      = require('../controllers/sellers/sellerSaleController');
const receiptCtrl   = require('../controllers/sellers/sellerReceiptController');

const { pool }                           = require('../config/db');
const { successResponse, errorResponse } = require('../utils/response');

const router = express.Router();

// ── Multer — subida de comprobantes ──────────────────────────────────────────
const VOUCHER_DIR = path.join(process.cwd(), 'uploads', 'vouchers');
if (!fs.existsSync(VOUCHER_DIR)) fs.mkdirSync(VOUCHER_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VOUCHER_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `voucher-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, name);
  },
});
const fileFilter = (_req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Formato de imagen no permitido. Usá jpg, jpeg, png o webp.'), false);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

// ── Guardia global ────────────────────────────────────────────────────────────
router.use(auth, sellerOnly);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// GET /api/seller/dashboard
router.get('/dashboard', dashboardCtrl.getDashboard);

// ── Ranking ───────────────────────────────────────────────────────────────────
// GET /api/seller/ranking
router.get('/ranking', dashboardCtrl.getRanking);

// ── Clientes ──────────────────────────────────────────────────────────────────
// GET    /api/seller/customers
router.get   ('/customers',      customerCtrl.getCustomers);
// GET    /api/seller/customers/:id
router.get   ('/customers/:id',  customerCtrl.getCustomer);
// POST   /api/seller/customers
router.post  ('/customers',      customerCtrl.createCustomer);
// PUT    /api/seller/customers/:id
router.put   ('/customers/:id',  customerCtrl.updateCustomer);
// DELETE /api/seller/customers/:id
router.delete('/customers/:id',  customerCtrl.deleteCustomer);

// ── Ventas ────────────────────────────────────────────────────────────────────
// GET  /api/seller/sales
router.get('/sales',               saleCtrl.getSales);
// GET  /api/seller/sales/:id
router.get('/sales/:id',           saleCtrl.getSale);
// POST /api/seller/sales
router.post('/sales',              saleCtrl.createSale);
// PUT  /api/seller/sales/:id
router.put('/sales/:id',           saleCtrl.updateSale);
// POST /api/seller/sales/:id/duplicate
router.post('/sales/:id/duplicate', saleCtrl.duplicateSale);
// POST /api/seller/sales/:id/voucher
router.post('/sales/:id/voucher',  upload.single('voucher'), saleCtrl.uploadVoucher);

// ── Órdenes masivas ───────────────────────────────────────────────────────────
// POST /api/seller/bulk-orders
router.post('/bulk-orders', async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { customer_id, orders, payment_method = 'efectivo', notes } = req.body;

    if (!customer_id) return errorResponse(res, 'customer_id es requerido', 400);
    if (!Array.isArray(orders) || orders.length === 0) {
      return errorResponse(res, 'Debe incluir al menos una orden', 400);
    }

    // Validar que el cliente pertenece al vendedor
    const [[customer]] = await pool.query(
      'SELECT id FROM seller_customers WHERE id = ? AND seller_id = ?',
      [customer_id, sellerId]
    );
    if (!customer) return errorResponse(res, 'Cliente no encontrado', 404);

    const conn = await pool.getConnection();
    const created = [];
    try {
      await conn.beginTransaction();

      for (const ord of orders) {
        const { service_id, quantity = 1, link = '' } = ord;
        if (!service_id) continue;

        // Obtener precio del servicio
        const [[svc]] = await conn.query(
          'SELECT id, rate FROM services WHERE id = ? AND is_active = 1 LIMIT 1',
          [service_id]
        );
        if (!svc) continue;

        const unit_price = parseFloat(svc.rate);
        const subtotal   = unit_price * parseInt(quantity);

        // Crear venta individual por cada ítem
        const [saleRes] = await conn.query(
          `INSERT INTO seller_sales (seller_id, customer_id, total, payment_method, notes, status)
           VALUES (?, ?, ?, ?, ?, 'pending')`,
          [sellerId, customer_id, subtotal, payment_method, notes || null]
        );
        const saleId = saleRes.insertId;

        await conn.query(
          `INSERT INTO seller_sale_items (sale_id, service_id, quantity, unit_price, subtotal, link)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [saleId, service_id, quantity, unit_price, subtotal, link || null]
        );

        // Actualizar stats del cliente
        await conn.query(
          `UPDATE seller_customers
           SET total_orders = total_orders + 1, total_spent = total_spent + ?, updated_at = NOW()
           WHERE id = ?`,
          [subtotal, customer_id]
        );

        created.push(saleId);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    return successResponse(res, { created, count: created.length }, `${created.length} órdenes creadas`, 201);
  } catch (err) { next(err); }
});

// ── Recibos ───────────────────────────────────────────────────────────────────
// GET  /api/seller/receipts
router.get('/receipts',      receiptCtrl.getReceipts);
// GET  /api/seller/receipts/:id
router.get('/receipts/:id',  receiptCtrl.getReceipt);
// POST /api/seller/receipts
router.post('/receipts',     receiptCtrl.createReceipt);

// ── Calculadora (stateless — sin persistencia) ────────────────────────────────
// POST /api/seller/calculator
router.post('/calculator', (req, res) => {
  const { cost, markup, quantity = 1 } = req.body;

  const c = parseFloat(cost);
  const m = parseFloat(markup);
  const q = parseInt(quantity);

  if (isNaN(c) || c <= 0)  return errorResponse(res, 'Costo inválido', 400);
  if (isNaN(m) || m < 0)   return errorResponse(res, 'Markup inválido', 400);
  if (isNaN(q) || q <= 0)  return errorResponse(res, 'Cantidad inválida', 400);

  const totalCost       = c * q;
  const suggestedPrice  = c * (1 + m / 100);
  const totalPrice      = suggestedPrice * q;
  const profit          = totalPrice - totalCost;
  const margin          = totalCost > 0 ? (profit / totalPrice) * 100 : 0;

  return successResponse(res, {
    cost_per_unit:   parseFloat(c.toFixed(4)),
    markup_pct:      parseFloat(m.toFixed(2)),
    quantity:        q,
    total_cost:      parseFloat(totalCost.toFixed(4)),
    suggested_price: parseFloat(suggestedPrice.toFixed(4)),
    total_price:     parseFloat(totalPrice.toFixed(4)),
    profit:          parseFloat(profit.toFixed(4)),
    margin_pct:      parseFloat(margin.toFixed(2)),
  });
});

// ── Métodos de pago (solo lectura — configurados por el admin) ────────────────
// GET /api/seller/payment-methods
router.get('/payment-methods', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      "SELECT value FROM settings WHERE `key` = 'payment_methods' LIMIT 1"
    );
    const methods = row ? JSON.parse(row.value) : {};
    return successResponse(res, methods);
  } catch (err) { next(err); }
});

// ── Servicios disponibles (para armar el carrito en Nueva Venta) ──────────────
// GET /api/seller/services
router.get('/services', async (req, res, next) => {
  try {
    const { search, category_id, page = 1, perPage = 50 } = req.query;
    const limit  = Math.min(100, Math.max(1, parseInt(perPage) || 50));
    const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

    const conditions = ['s.is_active = 1'];
    const params     = [];

    if (category_id) { conditions.push('s.category_id = ?'); params.push(parseInt(category_id)); }
    if (search)      { conditions.push('s.name LIKE ?');      params.push(`%${search}%`);         }

    const where = 'WHERE ' + conditions.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM services s ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.rate, s.min_order, s.max_order, s.type,
              c.name AS category_name, c.id AS category_id
       FROM services s
       JOIN categories c ON c.id = s.category_id
       ${where}
       ORDER BY c.sort_order ASC, s.sort_order ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success:    true,
      data:       rows,
      pagination: {
        page:       parseInt(page),
        perPage:    limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) { next(err); }
});

// ── Categorías disponibles ────────────────────────────────────────────────────
// GET /api/seller/categories
router.get('/categories', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, slug, emoji FROM categories WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    return successResponse(res, rows);
  } catch (err) { next(err); }
});

module.exports = router;
