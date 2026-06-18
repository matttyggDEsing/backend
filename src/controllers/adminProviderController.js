'use strict';

/**
 * adminController.js — PARCHE (funciones nuevas y corregidas)
 *
 * Agrega a tu adminController.js existente estas funciones al final,
 * antes del module.exports, y agrega los nombres al module.exports.
 *
 * NUEVAS FUNCIONES:
 *   - updateUserRole      → PATCH /api/admin/users/:id/role
 *   - getProviders        → GET  /api/admin/providers
 *   - createProvider      → POST /api/admin/providers
 *   - updateProvider      → PUT  /api/admin/providers/:id
 *   - deleteProvider      → DELETE /api/admin/providers/:id
 *   - syncProvider        → POST /api/admin/providers/:id/sync
 *   - getProviderBalance  → GET  /api/admin/providers/:id/balance
 *
 * ESTOS REEMPLAZAN los endpoints de /api/providers que el frontend
 * ya estaba llamando como /api/admin/providers (paths incorrectos).
 */

const { pool }         = require('../config/db');
const userModel        = require('../models/userModel');
const serviceModel     = require('../models/serviceModel');
const smmProvider      = require('../services/smmProvider');
const { successResponse, errorResponse } = require('../utils/response');
const { paginate }     = require('../utils/pagination');
const logger           = require('../utils/logger');

/* ─────────────────────────────────────────────────────────────
   PATCH /api/admin/users/:id/role
   Body: { role: 'user' | 'staff' | 'admin' }
──────────────────────────────────────────────────────────────── */
const updateUserRole = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    const { role } = req.body;

    const VALID_ROLES = ['user', 'staff', 'admin'];
    if (!VALID_ROLES.includes(role)) {
      return errorResponse(
        res,
        `Rol inválido. Valores permitidos: ${VALID_ROLES.join(', ')}`,
        400,
      );
    }

    // No puede quitarse el admin a sí mismo
    if (targetId === req.user.id && role !== 'admin') {
      return errorResponse(res, 'No puedes cambiar tu propio rol de admin', 403);
    }

    const target = await userModel.findById(targetId);
    if (!target) return errorResponse(res, 'Usuario no encontrado', 404);

    await userModel.updateRole(targetId, role);

    logger.info(`Admin ${req.user.id} changed role of user ${targetId} to '${role}'`);

    return successResponse(res, { id: targetId, role }, `Rol actualizado a '${role}'`);
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/providers
──────────────────────────────────────────────────────────────── */
const getProviders = async (req, res, next) => {
  try {
    const [providers] = await pool.query(
      `SELECT id, name, api_url, balance, status, last_sync, created_at
       FROM providers ORDER BY id ASC`,
    );
    return successResponse(res, providers);
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/providers
──────────────────────────────────────────────────────────────── */
const createProvider = async (req, res, next) => {
  try {
    const { name, api_url, api_key } = req.body;

    if (!name || !api_url || !api_key) {
      return errorResponse(res, 'name, api_url y api_key son requeridos', 400);
    }

    const [result] = await pool.query(
      `INSERT INTO providers (name, api_url, api_key, status) VALUES (?, ?, ?, 'active')`,
      [name.trim(), api_url.trim(), api_key.trim()],
    );

    const [[provider]] = await pool.query(
      `SELECT id, name, api_url, balance, status, last_sync FROM providers WHERE id = ?`,
      [result.insertId],
    );

    logger.info(`Admin ${req.user.id} created provider #${result.insertId}`);
    return successResponse(res, provider, 'Proveedor creado', 201);
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   PUT /api/admin/providers/:id
──────────────────────────────────────────────────────────────── */
const updateProvider = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { name, api_url, api_key, status } = req.body;

    const fields = [];
    const values = [];

    if (name)    { fields.push('name = ?');    values.push(name.trim()); }
    if (api_url) { fields.push('api_url = ?'); values.push(api_url.trim()); }
    if (api_key && api_key.trim()) {
      fields.push('api_key = ?');
      values.push(api_key.trim());
    }
    if (status) {
      const VALID = ['active', 'inactive', 'error'];
      if (!VALID.includes(status)) {
        return errorResponse(res, `Estado inválido: ${status}`, 400);
      }
      fields.push('status = ?');
      values.push(status);
    }

    if (!fields.length) return errorResponse(res, 'No hay campos para actualizar', 400);

    values.push(id);
    await pool.query(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`, values);

    return successResponse(res, { id }, 'Proveedor actualizado');
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   DELETE /api/admin/providers/:id
──────────────────────────────────────────────────────────────── */
const deleteProvider = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    // Desactivar servicios del proveedor antes de eliminar
    await pool.query(
      `UPDATE services SET is_active = 0 WHERE provider_id = ?`,
      [id],
    );
    await pool.query(`DELETE FROM providers WHERE id = ?`, [id]);

    logger.info(`Admin ${req.user.id} deleted provider #${id}`);
    return successResponse(res, { id }, 'Proveedor eliminado y servicios desactivados');
  } catch (err) {
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/admin/providers/:id/sync
──────────────────────────────────────────────────────────────── */
const syncProvider = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const [[provider]] = await pool.query(
      `SELECT id, name, api_url, api_key FROM providers WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!provider) return errorResponse(res, 'Proveedor no encontrado', 404);

    // Fetch de la API del proveedor
    const rawServices = await smmProvider.getServices(provider.api_url, provider.api_key);

    if (!Array.isArray(rawServices) || rawServices.length === 0) {
      return errorResponse(res, 'El proveedor no devolvió servicios', 502);
    }

    // Normalizar al formato que espera syncFromProvider
    const normalized = rawServices.map((s) => ({
      provider_service_id: parseInt(s.service),
      name:                s.name,
      description:         s.description ?? '',
      category:            s.category ?? 'General',
      type:                s.type ?? 'Default',
      rate:                parseFloat(s.rate),
      min:                 parseInt(s.min),
      max:                 parseInt(s.max),
      refill:              Boolean(s.refill),
      cancel:              Boolean(s.cancel),
    }));

    const { synced } = await serviceModel.syncFromProvider(normalized, id);

    // Actualizar last_sync
    await pool.query(
      `UPDATE providers SET last_sync = NOW(), status = 'active' WHERE id = ?`,
      [id],
    );

    logger.info(`Provider #${id} synced: ${synced} services`);
    return successResponse(res, { synced }, `${synced} servicios sincronizados`);
  } catch (err) {
    await pool.query(
      `UPDATE providers SET status = 'error' WHERE id = ?`,
      [parseInt(req.params.id)],
    ).catch(() => {});
    next(err);
  }
};

/* ─────────────────────────────────────────────────────────────
   GET /api/admin/providers/:id/balance
   BUG FIX: este endpoint no existía → el frontend recibía 404
──────────────────────────────────────────────────────────────── */
const getProviderBalance = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const [[provider]] = await pool.query(
      `SELECT id, api_url, api_key FROM providers WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!provider) return errorResponse(res, 'Proveedor no encontrado', 404);

    const balanceData = await smmProvider.getBalance(provider.api_url, provider.api_key);
    const balance = parseFloat(balanceData?.balance ?? 0);

    // Guardar en DB para mostrarlo en la lista
    await pool.query(
      `UPDATE providers SET balance = ?, updated_at = NOW() WHERE id = ?`,
      [balance, id],
    );

    return successResponse(res, { balance, currency: balanceData?.currency ?? 'USD' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  updateUserRole,
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  syncProvider,
  getProviderBalance,
};


