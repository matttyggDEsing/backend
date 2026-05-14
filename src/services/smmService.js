'use strict';

const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const SMM_URL = env.SMM_PROVIDER_URL || 'https://peakerr.com/api/v2';
const SMM_KEY = env.SMM_PROVIDER_KEY;

/**
 * Realiza una llamada a la API del proveedor SMM (Peakerr).
 */
const smmRequest = async (params) => {
  const form = new URLSearchParams({ key: SMM_KEY, ...params });
  const { data } = await axios.post(SMM_URL, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  if (data.error) throw new Error(data.error);
  return data;
};

/**
 * Obtiene todos los servicios disponibles del proveedor.
 * @returns {Array} Lista de servicios con id, name, category, rate, min, max
 */
const fetchServices = async () => {
  logger.info('[SMM] Fetching services from provider...');
  const data = await smmRequest({ action: 'services' });
  // Normalizar campos del proveedor al esquema interno
  return data.map((s) => ({
    provider_service_id: s.service,
    name: s.name,
    category: s.category,
    type: s.type || 'Default',
    rate: parseFloat(s.rate),       // precio por 1000 unidades en USD del proveedor
    min: parseInt(s.min, 10),
    max: parseInt(s.max, 10),
    refill: s.refill === true || s.refill === 'true',
    cancel: s.cancel === true || s.cancel === 'true',
    description: s.description || null,
  }));
};

/**
 * Crea una orden en el proveedor SMM.
 * @param {Object} opts - { service, link, quantity }
 * @returns {Object} { order: number }
 */
const createOrder = async ({ service, link, quantity }) => {
  logger.info(`[SMM] Creating order: service=${service}, link=${link}, qty=${quantity}`);
  const data = await smmRequest({ action: 'add', service, link, quantity });
  return { provider_order_id: data.order };
};

/**
 * Consulta el estado de una orden en el proveedor.
 * @param {number|string} orderId - ID de orden del proveedor
 * @returns {Object} { status, charge, start_count, remains }
 */
const getOrderStatus = async (orderId) => {
  const data = await smmRequest({ action: 'status', order: orderId });
  return {
    status: data.status,
    charge: parseFloat(data.charge || 0),
    start_count: parseInt(data.start_count || 0, 10),
    remains: parseInt(data.remains || 0, 10),
  };
};

/**
 * Consulta el balance de la cuenta del proveedor.
 * @returns {{ balance: string, currency: string }}
 */
const getProviderBalance = async () => {
  const data = await smmRequest({ action: 'balance' });
  return { balance: data.balance, currency: data.currency };
};

module.exports = { fetchServices, createOrder, getOrderStatus, getProviderBalance };
