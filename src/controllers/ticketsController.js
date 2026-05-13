const ticketModel = require('../models/ticketModel');
const { successResponse, errorResponse, paginatedResponse } = require('../utils/response');
const { paginate } = require('../utils/pagination');

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

const createTicket = async (req, res, next) => {
  try {
    const { subject, message, priority } = req.body;
    const ticketId = await ticketModel.create(req.user.id, { subject, message, priority });
    const messages = await ticketModel.getMessages(ticketId);
    return successResponse(
      res,
      { id: ticketId, subject, status: 'open', priority, messages },
      'Ticket creado',
      201,
    );
  } catch (err) {
    next(err);
  }
};

const replyToTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const ticket = await ticketModel.findByIdAndUser(id, req.user.id);
    if (!ticket) return errorResponse(res, 'Ticket no encontrado', 404);
    if (ticket.status === 'closed') return errorResponse(res, 'El ticket está cerrado', 400);

    await ticketModel.addMessage(id, req.user.id, message, false);
    const messages = await ticketModel.getMessages(id);
    return successResponse(res, { ticket, messages });
  } catch (err) {
    next(err);
  }
};

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

module.exports = { getTickets, createTicket, replyToTicket, getTicketById };
