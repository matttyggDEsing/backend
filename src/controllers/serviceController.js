'use strict';

const serviceModel = require('../models/serviceModel');
const smmService = require('../services/smmService');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * GET /api/services
 * Lista los servicios activos con rate de venta (markup incluido).
 */
const listServices = async (req, res, next) => {
  try {
    const { category } = req.query;
    const services = await serviceModel.findAll({ category });

    // Exponer rate_markup (precio de venta) en lugar del costo interno
    const output = services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      type: s.type,
      rate: s.rate_markup,          // precio por 1000 en USD al usuario
      min: s.min_qty,
      max: s.max_qty,
      refill: !!s.refill,
      cancel: !!s.cancel_enabled,
      description: s.description,
    }));

    return successResponse(res, output);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/services/categories
 * Devuelve categorías únicas de servicios activos.
 */
const listCategories = async (req, res, next) => {
  try {
    const categories = await serviceModel.getCategories();
    return successResponse(res, categories);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/services/:id
 * Detalle de un servicio.
 */
const getService = async (req, res, next) => {
  try {
    const service = await serviceModel.findById(req.params.id);
    if (!service) return errorResponse(res, 'Servicio no encontrado', 404);

    return successResponse(res, {
      id: service.id,
      name: service.name,
      category: service.category,
      type: service.type,
      rate: service.rate_markup,
      min: service.min_qty,
      max: service.max_qty,
      refill: !!service.refill,
      cancel: !!service.cancel_enabled,
      description: service.description,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/services/sync
 * [Admin] Sincroniza servicios desde el proveedor Peakerr.
 */
const syncServices = async (req, res, next) => {
  try {
    logger.info('[ServiceController] Starting sync with provider...');
    const providerServices = await smmService.fetchServices();
    const result = await serviceModel.syncFromProvider(providerServices);
    logger.info(`[ServiceController] Sync complete: ${result.synced} services`);
    return successResponse(res, result, `Sincronización exitosa: ${result.synced} servicios`);
  } catch (err) {
    logger.error(`[ServiceController] Sync failed: ${err.message}`);
    next(err);
  }
};

module.exports = { listServices, listCategories, getService, syncServices };
