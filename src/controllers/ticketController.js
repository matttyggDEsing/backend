'use strict';

const ticketModel = require('../models/ticketModel');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

// ──────────────────────────────────────────────
// Rutas de usuario
// ──────────────────────────────────────────────

/**
 * GET /api/tickets
 * Lista los tickets del usuario autenticado.
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
 * Detalle de un ticket con sus mensajes.
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
 * Crea un nuevo ticket.
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

    const ticketId = await ticketModel.create(req.user.id, {
      subject: subject.trim(),
      message: message.trim(),
      priority,
      orderId: order_id || null,
    });

    const messages = await ticketModel.getMessages(ticketId);

    return successResponse(
      res,
      { id: ticketId, subject, status: 'open', priority, messages },
      'Ticket creado exitosamente',
      201,
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/tickets/:id/reply
 * El usuario responde a su ticket.
 * Body: { message }
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
 * PATCH /api/tickets/:id/close
 * El usuario cierra su ticket.
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

/**
 * GET /api/admin/tickets
 * Lista todos los tickets (con filtro opcional de status).
 */
const adminListTickets = async (req, res, next) => {
  try {
    const { status, limit = 30, offset = 0 } = req.query;
    const { rows, total } = await ticketModel.findAll({ status, limit: parseInt(limit), offset: parseInt(offset) });
    return successResponse(res, { tickets: rows, total });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/admin/tickets/:id
 * Detalle completo de cualquier ticket.
 */
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

/**
 * POST /api/admin/tickets/:id/reply
 * El staff/admin responde un ticket.
 * Body: { message }
 */
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

    return successResponse(res, { ticket: { ...ticket, status: 'answered' }, messages });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/admin/tickets/:id/close
 * El admin cierra cualquier ticket.
 */
const adminCloseTicket = async (req, res, next) => {
  try {
    const closed = await ticketModel.closeAdmin(req.params.id);
    if (!closed) return errorResponse(res, 'Ticket no encontrado', 404);
    return successResponse(res, { status: 'closed' }, 'Ticket cerrado por administrador');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTickets,
  getTicketById,
  createTicket,
  replyToTicket,
  closeTicket,
  adminListTickets,
  adminGetTicket,
  adminReplyToTicket,
  adminCloseTicket,
};



