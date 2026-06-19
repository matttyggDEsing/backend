const providerModel = require('../models/providerModel');
const smm = require('../services/smmProvider');
const { successResponse, errorResponse } = require('../utils/response');

const getProviders = async (req, res, next) => {
  try {
    const providers = await providerModel.getAll();
    return successResponse(res, providers);
  } catch (err) {
    next(err);
  }
};

const syncProvider = async (req, res, next) => {
  try {
    const provider = await providerModel.findById(req.params.id);
    if (!provider) return errorResponse(res, 'Proveedor no encontrado', 404);

    const balanceData = await smm.getBalance(provider.api_url, provider.api_key);
    await providerModel.updateBalance(provider.id, parseFloat(balanceData.balance));

    return successResponse(res, { balance: balanceData.balance }, 'Balance sincronizado');
  } catch (err) {
    next(err);
  }
};

const createProvider = async (req, res, next) => {
  try {
    const { name, api_url, api_key } = req.body;
    const id = await providerModel.create({ name, api_url, api_key });
    return successResponse(res, { id }, 'Proveedor creado', 201);
  } catch (err) {
    next(err);
  }
};

module.exports = { getProviders, syncProvider, createProvider };






