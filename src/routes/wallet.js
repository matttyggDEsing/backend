'use strict';

const router = require('express').Router();
const Joi    = require('joi');
const walletController = require('../controllers/walletController');
const auth     = require('../middleware/auth');
const validate = require('../middleware/validate');

const depositSchema = Joi.object({
  amount: Joi.number().positive().precision(4).max(10000).required(),
  method: Joi.string().valid('crypto', 'paypal', 'stripe', 'manual').default('manual'),
});

router.use(auth);

router.get('/balance',       walletController.getBalance);       // GET /api/wallet/balance
router.get('/',              walletController.getWallet);        // GET /api/wallet
router.get('/transactions',  walletController.getTransactions);  // GET /api/wallet/transactions
router.get('/deposits',      walletController.getDeposits);      // GET /api/wallet/deposits
router.post('/deposit',      validate(depositSchema), walletController.requestDeposit); // POST /api/wallet/deposit
router.post('/add-funds',    validate(depositSchema), walletController.requestDeposit); // alias

module.exports = router;
