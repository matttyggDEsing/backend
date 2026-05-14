'use strict';

const router = require('express').Router();
const ticketController = require('../controllers/ticketController');

// Rutas de usuario autenticado
router.get('/', ticketController.getTickets);
router.post('/', ticketController.createTicket);
router.get('/:id', ticketController.getTicketById);
router.post('/:id/reply', ticketController.replyToTicket);
router.patch('/:id/close', ticketController.closeTicket);

module.exports = router;
