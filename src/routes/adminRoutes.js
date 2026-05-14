'use strict';

const router = require('express').Router();
const walletController = require('../controllers/walletController');
const ticketController = require('../controllers/ticketController');
const serviceController = require('../controllers/serviceController');

// ── Wallet ──────────────────────────────────────
router.get('/wallet/deposits', walletController.listDeposits);
router.post('/wallet/confirm-deposit', walletController.confirmDeposit);

// ── Tickets ──────────────────────────────────────
router.get('/tickets', ticketController.adminListTickets);
router.get('/tickets/:id', ticketController.adminGetTicket);
router.post('/tickets/:id/reply', ticketController.adminReplyToTicket);
router.patch('/tickets/:id/close', ticketController.adminCloseTicket);

// ── Services ──────────────────────────────────────
router.post('/services/sync', serviceController.syncServices);

module.exports = router;
