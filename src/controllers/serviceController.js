'use strict';

const serviceModel = require('../models/serviceModel');
const smmService = require('../services/smmService');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * GET /api/services
 * Lista los servicios activos. Expone el rate tal cual (precio de venta).
 */
const listServices = async (req, res, next) => {
  try {
    const { category } = req.query;
    const services = await serviceModel.findAll({ category });

    const output = services.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      type: s.type,
      rate: parseFloat(s.rate),
      min: s.min_order,
      max: s.max_order,
      refill: !!s.refill,
      cancel: !!s.cancel,
      description: s.description,
    }));

    return successResponse(res, output);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/services/categories
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
      rate: parseFloat(service.rate),
      min: service.min_order,
      max: service.max_order,
      refill: !!service.refill,
      cancel: !!service.cancel,
      description: service.description,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/admin/services/sync
 * Sincroniza servicios desde Peakerr.
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
