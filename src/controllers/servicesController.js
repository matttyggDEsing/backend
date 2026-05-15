'use strict';

const serviceModel  = require('../models/serviceModel');
const categoryModel = require('../models/categoryModel');
const { successResponse, errorResponse } = require('../utils/response');

/**
 * GET /api/services
 * Devuelve array de servicios activos (no objeto con sub-keys).
 */
const getServices = async (req, res, next) => {
  try {
    const { category } = req.query;
    let categoryId = null;

    if (category) {
      const cats = await categoryModel.getAll(true);
      const cat  = cats.find(c => c.slug === category || String(c.id) === String(category));
      if (cat) categoryId = cat.id;
    }

    const services = await serviceModel.getActive({ categoryId });
    return successResponse(res, services);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/services/:id
 */
const getServiceById = async (req, res, next) => {
  try {
    const service = await serviceModel.findById(req.params.id);
    if (!service) return errorResponse(res, 'Servicio no encontrado', 404);
    return successResponse(res, service);
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getServiceById };
