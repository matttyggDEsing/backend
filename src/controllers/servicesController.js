const serviceModel = require('../models/serviceModel');
const categoryModel = require('../models/categoryModel');
const { successResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');
const { paginatedResponse } = require('../utils/response');

const getServices = async (req, res, next) => {
  try {
    const { category } = req.query;
    let categoryId = null;

    if (category) {
      const cats = await categoryModel.getAll(true);
      const cat = cats.find((c) => c.slug === category || String(c.id) === String(category));
      if (cat) categoryId = cat.id;
    }

    const services = await serviceModel.getActive({ categoryId });
    const categories = await categoryModel.getAll(true);

    return successResponse(res, { services, categories });
  } catch (err) {
    next(err);
  }
};

const getServiceById = async (req, res, next) => {
  try {
    const { errorResponse } = require('../utils/response');
    const service = await serviceModel.findById(req.params.id);
    if (!service) return errorResponse(res, 'Servicio no encontrado', 404);
    return successResponse(res, service);
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getServiceById };
