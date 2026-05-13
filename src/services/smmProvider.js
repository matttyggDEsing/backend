const axios = require('axios');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');
const env = require('../config/env');

const CACHE_KEY = 'smm:services';
const CACHE_TTL = 30 * 60; // 30 minutos

/**
 * POST al proveedor SMM con form-urlencoded y retry exponencial.
 */
const request = async (params, attempt = 1) => {
  const MAX_ATTEMPTS = 3;
  try {
    const body = new URLSearchParams({
      key: env.SMM_PROVIDER_KEY,
      ...params,
    });

    const response = await axios.post(env.SMM_PROVIDER_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    if (response.data?.error) {
      throw new Error(`Proveedor SMM: ${response.data.error}`);
    }

    return response.data;
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      const delay = Math.pow(2, attempt) * 500;
      logger.warn(`[SMM] Intento ${attempt} fallido. Reintentando en ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return request(params, attempt + 1);
    }
    logger.error(`[SMM] Error tras ${MAX_ATTEMPTS} intentos: ${err.message}`);
    throw err;
  }
};

/**
 * Obtener lista de servicios del proveedor (con cache Redis 30min).
 */
const getServices = async () => {
  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const data = await request({ action: 'services' });

  try {
    await redis.set(CACHE_KEY, JSON.stringify(data), 'EX', CACHE_TTL);
  } catch (_) {}

  return data;
};

/**
 * Crear una orden en el proveedor.
 */
const addOrder = async ({ service, link, quantity }) => {
  return request({ action: 'add', service, link, quantity });
};

/**
 * Ver estado de una orden.
 */
const getStatus = async (orderId) => {
  return request({ action: 'status', order: orderId });
};

/**
 * Ver estado de múltiples órdenes (IDs separados por coma).
 */
const getMultipleStatus = async (orderIds) => {
  return request({ action: 'status', orders: orderIds.join(',') });
};

/**
 * Balance del proveedor.
 */
const getBalance = async () => {
  return request({ action: 'balance' });
};

/**
 * Refill de una orden.
 */
const refillOrder = async (orderId) => {
  return request({ action: 'refill', order: orderId });
};

module.exports = { getServices, addOrder, getStatus, getMultipleStatus, getBalance, refillOrder };
