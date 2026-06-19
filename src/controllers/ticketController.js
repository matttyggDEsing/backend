'use strict';

const ticketModel = require('../models/ticketModel');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

// ──────────────────────────────────────────────
// Rutas de usuario
// ──────────────────────────────────────────────

/**
 * GET /api/tickets
 */
const getTickets = async (req, res, next) => {
  try {
    const { limit, offset, pagination } = paginate(req.query, 0);
    const { rows, total } = await ticketModel.findByUser(req.user.id, { limit, offset });
    return paginatedResponse(res, rows, {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.perPage),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/tickets/:id
 */
const getTicketById = async (req, res, next) => {
  try {
    const ticket = await ticketModel.findByIdAndUser(req.params.id, req.user.id);
    if (!ticket) return errorResponse(res, 'Ticket no encontrado', 404);
    const messages = await ticketModel.getMessages(ticket.id);
    return successResponse(res, { ...ticket, messages });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets
 * Body: { subject, message, priority?, order_id? }
 */
const createTicket = async (req, res, next) => {
  try {
    const { subject, message, priority = 'medium', order_id = null } = req.body;

    if (!subject || !subject.trim()) return errorResponse(res, 'El asunto es requerido', 400);
    if (!message || !message.trim()) return errorResponse(res, 'El mensaje es requerido', 400);

    const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
    if (!VALID_PRIORITIES.includes(priority)) {
      return errorResponse(res, 'Prioridad inválida. Usa: low, medium, high, urgent', 400);
    }

    // FIX: se pasa orderId al modelo (antes se ignoraba)
    const ticketId = await ticketModel.create(req.user.id, {
      subject:  subject.trim(),
      message:  message.trim(),
      priority,
      orderId:  order_id || null,
    });

    const messages = await ticketModel.getMessages(ticketId);

    return successResponse(
      res,
      { id: ticketId, subject: subject.trim(), status: 'open', priority, messages },
      'Ticket creado exitosamente',
      201,
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets/:id/reply
 */
const replyToTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) return errorResponse(res, 'El mensaje no puede estar vacío', 400);

    const ticket = await ticketModel.findByIdAndUser(id, req.user.id);
    if (!ticket) return errorResponse(res, 'Ticket no encontrado', 404);
    if (ticket.status === 'closed') return errorResponse(res, 'El ticket está cerrado y no acepta respuestas', 400);

    await ticketModel.addMessage(id, req.user.id, message.trim(), false);
    const messages = await ticketModel.getMessages(id);

    return successResponse(res, { ticket: { ...ticket, status: 'open' }, messages });
  } catch (err) {
    next(err);
  }
};

/**
 * FIX: el frontend llama POST /tickets/:id/close pero la ruta original era PATCH.
 * Ahora el router registra AMBOS métodos (POST y PATCH) apuntando a este handler,
 * así funciona tanto desde el frontend existente como desde integraciones que usen PATCH.
 * Ver tickets.js para el registro doble de ruta.
 */
const closeTicket = async (req, res, next) => {
  try {
    const closed = await ticketModel.close(req.params.id, req.user.id);
    if (!closed) return errorResponse(res, 'Ticket no encontrado o ya está cerrado', 404);
    return successResponse(res, { status: 'closed' }, 'Ticket cerrado');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// Rutas de admin
// ──────────────────────────────────────────────

const adminListTickets = async (req, res, next) => {
  try {
    const { status, limit = 30, offset = 0 } = req.query;
    const { rows, total } = await ticketModel.findAll({
      status,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    return successResponse(res, { tickets: rows, total });
  } catch (err) {
    next(err);
  }
};

const adminGetTicket = async (req, res, next) => {
  try {
    const ticket = await ticketModel.findById(req.params.id);
    if (!ticket) return errorResponse(res, 'Ticket no encontrado', 404);
    const messages = await ticketModel.getMessages(ticket.id);
    return successResponse(res, { ...ticket, messages });
  } catch (err) {
    next(err);
  }
};

const adminReplyToTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) return errorResponse(res, 'El mensaje no puede estar vacío', 400);

    const ticket = await ticketModel.findById(id);
    if (!ticket) return errorResponse(res, 'Ticket no encontrado', 404);
    if (ticket.status === 'closed') return errorResponse(res, 'El ticket está cerrado', 400);

    await ticketModel.addMessage(id, req.user.id, message.trim(), true);
    const messages = await ticketModel.getMessages(id);

    return successResponse(res, { ticket: { ...ticket, status: 'pending' }, messages });
  } catch (err) {
    next(err);
  }
};

const adminCloseTicket = async (req, res, next) => {
  try {
    const closed = await ticketModel.closeAdmin(req.params.id);
    if (!closed) return errorResponse(res, 'Ticket no encontrado', 404);
    return successResponse(res, { status: 'closed' }, 'Ticket cerrado por administrador');
  } catch (err) {
    next(err);
  }
};

// Alias requeridos por adminController.js
const adminGetTicketMessages = async (req, res, next) => {
  try {
    const messages = await ticketModel.getMessages(req.params.id);
    return successResponse(res, messages);
  } catch (err) {
    next(err);
  }
};
const adminReplyTicket = adminReplyToTicket;

module.exports = {
  // Usuario
  getTickets,
  getTicketById,
  createTicket,
  replyToTicket,
  closeTicket,
  // Admin
  adminListTickets,
  adminGetTicket,
  adminGetTicketMessages,
  adminReplyTicket,
  adminReplyToTicket,
  adminCloseTicket,
};
