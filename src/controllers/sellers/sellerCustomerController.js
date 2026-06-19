'use strict';

const { pool }    = require('../../config/db');
const { successResponse, errorResponse, paginatedResponse } = require('../../utils/response');
const { paginate } = require('../../utils/pagination');

// ── Listar clientes del vendedor autenticado ───────────────────────────────
const getCustomers = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { search } = req.query;

    let where = 'WHERE seller_id = ?';
    const params = [sellerId];

    if (search) {
      where += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR whatsapp LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM seller_customers ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT * FROM seller_customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) { next(err); }
};

// ── Obtener un cliente por ID ──────────────────────────────────────────────
const getCustomer = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const [[row]] = await pool.query(
      'SELECT * FROM seller_customers WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!row) return errorResponse(res, 'Cliente no encontrado', 404);
    return successResponse(res, row);
  } catch (err) { next(err); }
};

// ── Crear cliente ──────────────────────────────────────────────────────────
const createCustomer = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { first_name, last_name, email, whatsapp, instagram, facebook, notes } = req.body;

    if (!first_name || !last_name) {
      return errorResponse(res, 'Nombre y apellido son requeridos', 400);
    }

    const [result] = await pool.query(
      `INSERT INTO seller_customers (seller_id, first_name, last_name, email, whatsapp, instagram, facebook, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sellerId, first_name, last_name, email || null, whatsapp || null, instagram || null, facebook || null, notes || null]
    );

    return successResponse(res, { id: result.insertId }, 'Cliente creado', 201);
  } catch (err) { next(err); }
};

// ── Actualizar cliente ─────────────────────────────────────────────────────
const updateCustomer = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const { first_name, last_name, email, whatsapp, instagram, facebook, notes } = req.body;

    const [[existing]] = await pool.query(
      'SELECT id FROM seller_customers WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!existing) return errorResponse(res, 'Cliente no encontrado', 404);

    await pool.query(
      `UPDATE seller_customers
       SET first_name = ?, last_name = ?, email = ?, whatsapp = ?, instagram = ?, facebook = ?, notes = ?, updated_at = NOW()
       WHERE id = ? AND seller_id = ?`,
      [first_name, last_name, email || null, whatsapp || null, instagram || null, facebook || null, notes || null, req.params.id, sellerId]
    );

    return successResponse(res, null, 'Cliente actualizado');
  } catch (err) { next(err); }
};

// ── Eliminar cliente ───────────────────────────────────────────────────────
const deleteCustomer = async (req, res, next) => {
  try {
    const sellerId = req.user.id;
    const [[existing]] = await pool.query(
      'SELECT id FROM seller_customers WHERE id = ? AND seller_id = ?',
      [req.params.id, sellerId]
    );
    if (!existing) return errorResponse(res, 'Cliente no encontrado', 404);

    await pool.query('DELETE FROM seller_customers WHERE id = ? AND seller_id = ?', [req.params.id, sellerId]);
    return successResponse(res, null, 'Cliente eliminado');
  } catch (err) { next(err); }
};

module.exports = { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer };
