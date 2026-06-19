'use strict';

const axios = require('axios');
const { redis } = require('../config/redis');
const logger = require('../utils/logger');
const env = require('../config/env');

const CACHE_TTL = 30 * 60; // 30 minutos

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
      const err = new Error(`Proveedor SMM: ${response.data.error}`);
      err.isProviderApiError = true;
      throw err;
    }

    return response.data;
  } catch (err) {
    if (!err.isProviderApiError && attempt < MAX_ATTEMPTS) {
      const delay = Math.pow(2, attempt) * 500;
      logger.warn(`[SMM] Intento ${attempt} fallido (${url}). Reintentando en ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
      return request(params, { apiUrl, apiKey, attempt: attempt + 1 });
    }
    logger.error(`[SMM] Error tras ${attempt} intento(s) (${url}): ${err.message}`);
    throw err;
  }
};

/**
 * Obtener lista de servicios del proveedor (con cache Redis 30min).
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
 * Invalidar cache de servicios de un proveedor.
 */
const invalidateServicesCache = async (apiUrl) => {
  const { url } = resolveCreds(apiUrl);
  const cacheKey = `smm:services:${url}`;
  try {
    await redis.del(cacheKey);
    logger.info(`[SMM] Cache de servicios invalidada para ${url}`);
  } catch (err) {
    logger.warn(`[SMM] No se pudo invalidar cache de servicios: ${err.message}`);
  }
};

/**
 * FIX PRINCIPAL: Crear una orden en el proveedor.
 *
 * Antes: desestructuraba { service, link, quantity, apiUrl, apiKey } y
 * solo pasaba esos 3 campos al proveedor — cualquier campo extra
 * (comments, runs, interval, usernames, hashtags, username, media,
 * min, max, posts, delay, expiry, answer_number, etc.) se descartaba
 * silenciosamente y el proveedor rechazaba la orden.
 *
 * Ahora: separa solo las credenciales (apiUrl, apiKey) y pasa el resto
 * de los parámetros intactos al proveedor mediante spread.
 */
const addOrder = async ({ apiUrl, apiKey, ...orderParams }) => {
  logger.info(`[SMM] Enviando orden al proveedor: service=${orderParams.service}, link=${orderParams.link}, qty=${orderParams.quantity}`);
  return request({ action: 'add', ...orderParams }, { apiUrl, apiKey });
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

module.exports = {
  getServices,
  invalidateServicesCache,
  addOrder,
  getStatus,
  getMultipleStatus,
  getBalance,
  refillOrder,
};
