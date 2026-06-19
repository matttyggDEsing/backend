'use strict';

const router = require('express').Router();
const Joi    = require('joi');
const ticketController = require('../controllers/ticketController');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');

const createTicketSchema = Joi.object({
  subject:  Joi.string().min(3).max(500).required(),
  message:  Joi.string().min(5).max(5000).required(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  order_id: Joi.number().integer().positive().allow(null).optional(),
});

const replySchema = Joi.object({
  message: Joi.string().min(1).max(5000).required(),
});

router.use(auth);

router.get('/',              ticketController.getTickets);
router.post('/',             validate(createTicketSchema), ticketController.createTicket);
router.get('/:id',           ticketController.getTicketById);
router.post('/:id/reply',    validate(replySchema), ticketController.replyToTicket);

// FIX: el frontend llama POST /:id/close pero la ruta original era PATCH.
// Registramos ambos métodos para no tener que cambiar el frontend.
router.post('/:id/close',    ticketController.closeTicket);
router.patch('/:id/close',   ticketController.closeTicket);

module.exports = router;
