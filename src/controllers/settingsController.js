'use strict';

/**
 * settingsController.js
 *
 * Persiste configuraciones del panel en la tabla `settings` (key-value).
 * Cubre: métodos de pago, tasas de cambio, modo mantenimiento, proveedor SMM.
 */

const { pool }   = require('../config/db');
const providerModel = require('../models/providerModel');
const smm        = require('../services/smmProvider');
const { successResponse, errorResponse } = require('../utils/response');

// ─── helpers internos ──────────────────────────────────────────────────────────

const getSetting = async (key) => {
  const [rows] = await pool.query(
    'SELECT value FROM settings WHERE `key` = ? LIMIT 1',
    [key],
  );
  return rows[0] ? JSON.parse(rows[0].value) : null;
};

const setSetting = async (key, value) => {
  await pool.query(
    `INSERT INTO settings (\`key\`, value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
};

// ─── GET /api/admin/settings ───────────────────────────────────────────────────
const getSettings = async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT `key`, value FROM settings');
    const result = {};
    for (const row of rows) {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    }
    return successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/settings ────────────────────────────────────────────────
// Acepta cualquier clave del body y la persiste
const updateSettings = async (req, res, next) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return errorResponse(res, 'Body debe ser un objeto JSON', 400);
    }
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, value);
    }
    return successResponse(res, null, 'Configuración guardada');
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/maintenance ──────────────────────────────────────
const getMaintenance = async (req, res, next) => {
  try {
    const value = await getSetting('maintenance_mode');
    return successResponse(res, { enabled: value?.enabled ?? false, message: value?.message ?? '' });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/settings/maintenance ────────────────────────────────────
const setMaintenance = async (req, res, next) => {
  try {
    const { enabled, message = '' } = req.body;
    await setSetting('maintenance_mode', { enabled: !!enabled, message });
    return successResponse(res, null, `Modo mantenimiento ${enabled ? 'activado' : 'desactivado'}`);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/payment-methods ──────────────────────────────────
const getPaymentMethods = async (req, res, next) => {
  try {
    const value = await getSetting('payment_methods');
    return successResponse(res, value ?? {
      crypto: { enabled: false, address: '', network: '' },
      paypal: { enabled: false, email: '' },
      stripe: { enabled: false, public_key: '', secret_key: '' },
      manual: { enabled: true, instructions: '' },
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/settings/payment-methods ────────────────────────────────
const setPaymentMethods = async (req, res, next) => {
  try {
    await setSetting('payment_methods', req.body);
    return successResponse(res, null, 'Métodos de pago guardados');
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/exchange-rates ───────────────────────────────────
const getExchangeRates = async (req, res, next) => {
  try {
    const value = await getSetting('exchange_rates');
    return successResponse(res, value ?? { USD: 1, ARS: 1000, BRL: 5, EUR: 0.92 });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/settings/exchange-rates ─────────────────────────────────
const setExchangeRates = async (req, res, next) => {
  try {
    await setSetting('exchange_rates', req.body);
    return successResponse(res, null, 'Tasas de cambio guardadas');
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/provider ─────────────────────────────────────────
const getProviderSettings = async (req, res, next) => {
  try {
    const providers = await providerModel.getAll();
    return successResponse(res, providers);
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/admin/settings/provider ────────────────────────────────────────
const saveProviderSettings = async (req, res, next) => {
  try {
    const { id, name, api_url, api_key } = req.body;

    if (id) {
      // Actualizar existente
      await pool.query(
        'UPDATE providers SET name = ?, api_url = ?, api_key = ?, updated_at = NOW() WHERE id = ?',
        [name, api_url, api_key, id],
      );
      return successResponse(res, { id }, 'Proveedor actualizado');
    } else {
      // Crear nuevo
      const newId = await providerModel.create({ name, api_url, api_key });
      return successResponse(res, { id: newId }, 'Proveedor creado', 201);
    }
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/provider/balance?id=N ────────────────────────────
const getProviderBalance = async (req, res, next) => {
  try {
    const id = req.query.id;
    const provider = id ? await providerModel.findById(id) : (await providerModel.getAll())[0];
    if (!provider) return errorResponse(res, 'Proveedor no encontrado', 404);
    const full = await providerModel.findById(provider.id); // necesitamos api_key, getAll() no la trae
    const data = await smm.getBalance(full.api_url, full.api_key);
    return successResponse(res, { balance: data.balance, currency: data.currency ?? 'USD' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/settings/general ──────────────────────────────────────────
const getGeneralSettings = async (req, res, next) => {
  try {
    const value = await getSetting('general');
    return successResponse(res, value ?? {
      site_name: 'NexaPanel',
      site_url: '',
      support_email: '',
      currency: 'USD',
      min_deposit: 1,
      max_deposit: 10000,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/admin/settings/general ────────────────────────────────────────
const setGeneralSettings = async (req, res, next) => {
  try {
    await setSetting('general', req.body);
    return successResponse(res, null, 'Configuración general guardada');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getMaintenance,
  setMaintenance,
  getPaymentMethods,
  setPaymentMethods,
  getExchangeRates,
  setExchangeRates,
  getProviderSettings,
  saveProviderSettings,
  getProviderBalance,
  getGeneralSettings,
  setGeneralSettings,
};






