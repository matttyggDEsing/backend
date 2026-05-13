const { pool } = require('../config/db');
const userModel = require('../models/userModel');
const orderModel = require('../models/orderModel');
const ticketModel = require('../models/ticketModel');
const serviceModel = require('../models/serviceModel');
const smm = require('../services/smmProvider');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

// ── Stats ──────────────────────────────────────────────────────────────────────
const getStats = async (req, res, next) => {
  try {
    const [[users]] = await pool.query(
      `SELECT COUNT(*) AS total_users,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users
       FROM users`
    );
    const [[orders]] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(charge), 0) AS total_revenue,
              COALESCE(SUM(profit), 0) AS total_profit,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders
       FROM orders`
    );
    const [[tickets]] = await pool.query(
      `SELECT COUNT(*) AS total_tickets,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_tickets
       FROM tickets`
    );
    return successResponse(res, { users, orders, tickets });
  } catch (err) {
    next(err);
  }
};

// ── Users ──────────────────────────────────────────────────────────────────────
const getUsers = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { search } = req.query;
    const { rows, total } = await userModel.getAll({ limit, offset, search });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'banned', 'pending'];
    if (!allowed.includes(status)) return errorResponse(res, 'Estado inválido', 400);
    await userModel.updateStatus(req.params.id, status);
    return successResponse(res, null, 'Estado actualizado');
  } catch (err) {
    next(err);
  }
};

const adminAddFunds = async (req, res, next) => {
  try {
    const { amount } = req.body;
    await userModel.addFunds(req.params.id, parseFloat(amount));
    return successResponse(res, null, 'Fondos añadidos');
  } catch (err) {
    next(err);
  }
};

// ── Orders ─────────────────────────────────────────────────────────────────────
const getOrders = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { status, userId } = req.query;
    const { rows, total } = await orderModel.getAll({ limit, offset, status, userId });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

// ── Tickets ────────────────────────────────────────────────────────────────────
const getTickets = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { status } = req.query;
    const { rows, total } = await ticketModel.getAll({ limit, offset, status });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

const adminReplyTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    await ticketModel.addMessage(id, req.user.id, message, true);
    return successResponse(res, null, 'Respuesta enviada');
  } catch (err) {
    next(err);
  }
};

const adminGetTicketMessages = async (req, res, next) => {
  try {
    const messages = await ticketModel.getMessages(req.params.id);
    return successResponse(res, messages);
  } catch (err) {
    next(err);
  }
};

// ── Services CRUD ──────────────────────────────────────────────────────────────
const getAllServices = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { search, category_id } = req.query;
    const { rows, total } = await serviceModel.getAll({
      limit,
      offset,
      search,
      categoryId: category_id ? parseInt(category_id) : null,
    });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

const createService = async (req, res, next) => {
  try {
    const {
      provider_id, category_id, provider_service_id = 0,
      name, description = '', rate, min_order, max_order,
      type = 'Default', refill = false, cancel = false,
    } = req.body;
    const id = await serviceModel.create({
      provider_id, category_id, provider_service_id,
      name, description, rate: parseFloat(rate),
      min_order: parseInt(min_order), max_order: parseInt(max_order),
      type, refill, cancel,
    });
    return successResponse(res, { id }, 'Servicio creado', 201);
  } catch (err) {
    next(err);
  }
};

const updateService = async (req, res, next) => {
  try {
    await serviceModel.update(req.params.id, req.body);
    return successResponse(res, null, 'Servicio actualizado');
  } catch (err) {
    next(err);
  }
};

const deleteService = async (req, res, next) => {
  try {
    await pool.query('DELETE FROM services WHERE id = ?', [req.params.id]);
    return successResponse(res, null, 'Servicio eliminado');
  } catch (err) {
    next(err);
  }
};

const importServices = async (req, res, next) => {
  try {
    const { provider_id, category_id } = req.body;
    const smmServices = await smm.getServices();

    let imported = 0;
    for (const svc of smmServices) {
      try {
        await serviceModel.create({
          provider_id,
          category_id,
          provider_service_id: svc.service,
          name:        svc.name,
          description: svc.description || '',
          rate:        parseFloat(svc.rate),
          min_order:   parseInt(svc.min),
          max_order:   parseInt(svc.max),
          type:        svc.type || 'Default',
          refill:      svc.refill || false,
          cancel:      svc.cancel || false,
        });
        imported++;
      } catch (_) {}
    }

    return successResponse(res, { imported }, `${imported} servicios importados`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getUsers, updateUserStatus, adminAddFunds,
  getOrders,
  getTickets, adminReplyTicket, adminGetTicketMessages,
  getAllServices, createService, updateService, deleteService, importServices,
};