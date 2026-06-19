'use strict';

const { pool }    = require('../../config/db');
const path        = require('path');
const fs          = require('fs');
const { successResponse, errorResponse, paginatedResponse } = require('../../utils/response');
const { paginate } = require('../../utils/pagination');

// ── Listar ventas del vendedor ─────────────────────────────────────────────
const getSales = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { status, customer_id, date_from, date_to, payment_method } = req.query;

    let where = 'WHERE ss.seller_id = ?';
    const params = [sellerId];

    if (status)          { where += ' AND ss.status = ?';          params.push(status); }
    if (customer_id)     { where += ' AND ss.customer_id = ?';     params.push(customer_id); }
    if (payment_method)  { where += ' AND ss.payment_method = ?';  params.push(payment_method); }
    if (date_from)       { where += ' AND DATE(ss.created_at) >= ?'; params.push(date_from); }
    if (date_to)         { where += ' AND DATE(ss.created_at) <= ?'; params.push(date_to); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM seller_sales ss ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT ss.*,
              sc.first_name, sc.last_name, sc.email AS customer_email, sc.whatsapp
       FROM seller_sales ss
       JOIN seller_customers sc ON sc.id = ss.customer_id
       ${where}
       ORDER BY ss.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return paginatedResponse(res, rows, {
      ...pagination, total, totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) { next(err); }
};

// ── Obtener una venta con sus ítems ───────────────────────────────────────
const getSale = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const [[sale]] = await pool.query(
      `SELECT ss.*,
              sc.first_name, sc.last_name, sc.email AS customer_email, sc.whatsapp
       FROM seller_sales ss
       JOIN seller_customers sc ON sc.id = ss.customer_id
       WHERE ss.id = ? AND ss.seller_id = ?`,
      [req.params.id, sellerId]
    );
    if (!sale) return errorResponse(res, 'Venta no encontrada', 404);

    const [items] = await pool.query(
      `SELECT ssi.*, s.name AS service_name, s.rate AS service_rate
       FROM seller_sale_items ssi
       JOIN services s ON s.id = ssi.service_id
       WHERE ssi.sale_id = ?`,
      [sale.id]
    );

    return successResponse(res, { ...sale, items });
  } catch (err) { next(err); }
};

// ── Crear venta con ítems ─────────────────────────────────────────────────
const createSale = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const sellerId = req.user.id;
    const { customer_id, items, payment_method, notes } = req.body;

    if (!customer_id || !Array.isArray(items) || items.length === 0) {
      conn.release();
      return errorResponse(res, 'customer_id e items son requeridos', 400);
    }

    // Verificar que el cliente pertenece al vendedor
    const [[customer]] = await conn.query(
      'SELECT id FROM seller_customers WHERE id = ? AND seller_id = ?',
      [customer_id, sellerId]
    );
    if (!customer) { conn.release(); return errorResponse(res, 'Cliente no encontrado', 404); }

    await conn.beginTransaction();

    // Calcular total
    let total = 0;
    const enrichedItems = [];
    for (const item of items) {
      const [[svc]] = await conn.query('SELECT id, rate FROM services WHERE id = ? AND is_active = 1', [item.service_id]);
      if (!svc) throw new Error(`Servicio ${item.service_id} no encontrado o inactivo`);
      const qty      = parseInt(item.quantity) || 1;
      const price    = parseFloat(item.unit_price) || parseFloat(svc.rate);
      const subtotal = price * qty;
      total += subtotal;
      enrichedItems.push({ service_id: svc.id, quantity: qty, unit_price: price, subtotal, link: item.link || null });
    }

    // Insertar venta
    const [saleResult] = await conn.query(
      `INSERT INTO seller_sales (seller_id, customer_id, total, payment_method, status, notes)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [sellerId, customer_id, total, payment_method || 'efectivo', notes || null]
    );
    const saleId = saleResult.insertId;

    // Insertar ítems
    for (const item of enrichedItems) {
      await conn.query(
        `INSERT INTO seller_sale_items (sale_id, service_id, quantity, unit_price, subtotal, link)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [saleId, item.service_id, item.quantity, item.unit_price, item.subtotal, item.link]
      );
    }

    // Actualizar stats del cliente
    await conn.query(
      `UPDATE seller_customers SET total_spent = total_spent + ?, total_orders = total_orders + 1, updated_at = NOW()
       WHERE id = ?`,
      [total, customer_id]
    );

    await conn.commit();
    conn.release();

    return successResponse(res, { id: saleId, total }, 'Venta creada', 201);
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    next(err);
  }
};

// ── Actualizar estado y notas de una venta ────────────────────────────────
const updateSale = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { status, notes, payment_method } = req.body;

    const [[sale]] = await pool.query(
      'SELECT id FROM seller_sales WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!sale) return errorResponse(res, 'Venta no encontrada', 404);

    const fields = [];
    const values = [];
    if (status)         { fields.push('status = ?');         values.push(status); }
    if (notes !== undefined) { fields.push('notes = ?');     values.push(notes); }
    if (payment_method) { fields.push('payment_method = ?'); values.push(payment_method); }

    if (!fields.length) return errorResponse(res, 'No hay campos para actualizar', 400);
    fields.push('updated_at = NOW()');
    values.push(req.params.id, sellerId);

    await pool.query(
      `UPDATE seller_sales SET ${fields.join(', ')} WHERE id = ? AND seller_id = ?`,
      values
    );

    return successResponse(res, null, 'Venta actualizada');
  } catch (err) { next(err); }
};

// ── Duplicar venta ────────────────────────────────────────────────────────
const duplicateSale = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const sellerId = req.user.id;

    const [[sale]] = await conn.query(
      'SELECT * FROM seller_sales WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!sale) { conn.release(); return errorResponse(res, 'Venta no encontrada', 404); }

    const [items] = await conn.query(
      'SELECT * FROM seller_sale_items WHERE sale_id = ?',
      [sale.id]
    );

    await conn.beginTransaction();

    const [newSale] = await conn.query(
      `INSERT INTO seller_sales (seller_id, customer_id, total, payment_method, status, notes)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [sellerId, sale.customer_id, sale.total, sale.payment_method, sale.notes]
    );

    for (const item of items) {
      await conn.query(
        `INSERT INTO seller_sale_items (sale_id, service_id, quantity, unit_price, subtotal, link)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newSale.insertId, item.service_id, item.quantity, item.unit_price, item.subtotal, item.link]
      );
    }

    await conn.commit();
    conn.release();

    return successResponse(res, { id: newSale.insertId }, 'Venta duplicada', 201);
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    next(err);
  }
};

// ── Subida de comprobante ─────────────────────────────────────────────────
const uploadVoucher = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const [[sale]] = await pool.query(
      'SELECT id FROM seller_sales WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!sale) return errorResponse(res, 'Venta no encontrada', 404);

    if (!req.file) return errorResponse(res, 'No se recibió ningún archivo', 400);

    const voucher_path = `/uploads/vouchers/${req.file.filename}`;
    await pool.query(
      'UPDATE seller_sales SET voucher_path = ?, updated_at = NOW() WHERE id = ?',
      [voucher_path, req.params.id]
    );

    return successResponse(res, { voucher_path }, 'Comprobante subido');
  } catch (err) { next(err); }
};

module.exports = { getSales, getSale, createSale, updateSale, duplicateSale, uploadVoucher };
