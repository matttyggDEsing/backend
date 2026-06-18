const axios = require('axios');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');
const env = require('../config/env');

const CACHE_TTL = 30 * 60; // 30 minutos

// FIX: el panel soporta múltiples proveedores SMM (tabla `providers`, cada uno
// con su propio api_url/api_key), pero antes este módulo siempre pegaba contra
// las credenciales globales de .env (SMM_PROVIDER_URL/SMM_PROVIDER_KEY) sin
// importar qué proveedor se le pasara. Resultado: sync, balance, creación de
// orden y polling de estado terminaban hablando con un único proveedor "fantasma"
// para TODOS los proveedores configurados.
//
// Ahora cada función acepta opcionalmente { apiUrl, apiKey } del proveedor en
// cuestión. Si no se pasan, cae al proveedor global de .env (compatibilidad
// hacia atrás con instalaciones de un solo proveedor).

const resolveCreds = (apiUrl, apiKey) => ({
  url: apiUrl || env.SMM_PROVIDER_URL,
  key: apiKey || env.SMM_PROVIDER_KEY,
});

/**
 * POST al proveedor SMM con form-urlencoded y retry exponencial.
 */
const request = async (params, { apiUrl, apiKey, attempt = 1 } = {}) => {
  const MAX_ATTEMPTS = 3;
  const { url, key } = resolveCreds(apiUrl, apiKey);

  if (!url || !key) {
    throw new Error('Proveedor SMM sin configurar (falta api_url/api_key)');
  }

  try {
    const body = new URLSearchParams({ key, ...params });

    const response = await axios.post(url, body.toString(), {
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
      logger.warn(`[SMM] Intento ${attempt} fallido (${url}). Reintentando en ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return request(params, { apiUrl, apiKey, attempt: attempt + 1 });
    }
    logger.error(`[SMM] Error tras ${MAX_ATTEMPTS} intentos (${url}): ${err.message}`);
    throw err;
  }
};

/**
 * Obtener lista de servicios del proveedor (con cache Redis 30min).
 * Cache por proveedor: antes usaba una sola key global, así que sincronizar
 * el proveedor B podía devolver el catálogo cacheado del proveedor A.
 */
const getServices = async (apiUrl, apiKey) => {
  const { url } = resolveCreds(apiUrl, apiKey);
  const cacheKey = `smm:services:${url}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const data = await request({ action: 'services' }, { apiUrl, apiKey });

  try {
    await redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL);
  } catch (_) {}

  return data;
};

/**
 * Crear una orden en el proveedor.
 */
const addOrder = async ({ service, link, quantity, apiUrl, apiKey }) => {
  return request({ action: 'add', service, link, quantity }, { apiUrl, apiKey });
};

/**
 * Ver estado de una orden.
 */
const getStatus = async (orderId, apiUrl, apiKey) => {
  return request({ action: 'status', order: orderId }, { apiUrl, apiKey });
};

/**
 * Ver estado de múltiples órdenes (IDs separados por coma).
 */
const getMultipleStatus = async (orderIds, apiUrl, apiKey) => {
  return request({ action: 'status', orders: orderIds.join(',') }, { apiUrl, apiKey });
};

/**
 * Balance del proveedor.
 */
const getBalance = async (apiUrl, apiKey) => {
  return request({ action: 'balance' }, { apiUrl, apiKey });
};

/**
 * Refill de una orden.
 */
const refillOrder = async (orderId, apiUrl, apiKey) => {
  return request({ action: 'refill', order: orderId }, { apiUrl, apiKey });
};

module.exports = { getServices, addOrder, getStatus, getMultipleStatus, getBalance, refillOrder };
