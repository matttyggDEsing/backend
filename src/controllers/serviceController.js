'use strict';

const serviceModel = require('../models/serviceModel');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

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

module.exports = { listCategories, getService };






