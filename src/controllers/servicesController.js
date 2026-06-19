'use strict';

const serviceModel  = require('../models/serviceModel');
const categoryModel = require('../models/categoryModel');
const { paginatedResponse, errorResponse } = require('../utils/response');

/**
 * GET /api/services
 * Devuelve servicios activos paginados.
 * Query params: category (slug), page (default 1), perPage (default 50, max 100)
 */
const getServices = async (req, res, next) => {
  try {
    const { category, page = 1, perPage = 50 } = req.query;
    const limit  = Math.min(100, Math.max(1, parseInt(perPage) || 50));
    const offset = (Math.max(1, parseInt(page) || 1) - 1) * limit;

    let categoryId = null;
    if (category) {
      const cats = await categoryModel.getAll(true);
      const cat  = cats.find(c => c.slug === category || String(c.id) === String(category));
      if (cat) categoryId = cat.id;
    }

    const { rows, total } = await serviceModel.getActive({ categoryId, limit, offset });
    const totalPages = Math.ceil(total / limit);

    return paginatedResponse(res, rows, {
      page:      parseInt(page),
      perPage:   limit,
      total,
      totalPages,
    });
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
    return res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getServiceById };
