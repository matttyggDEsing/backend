'use strict';

const router = require('express').Router();
const walletController = require('../controllers/walletController');

// Rutas de usuario autenticado
router.get('/', walletController.getWallet);
router.get('/transactions', walletController.getTransactions);
router.post('/deposit', walletController.requestDeposit);

module.exports = router;
