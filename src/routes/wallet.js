const router = require('express').Router();
const Joi = require('joi');
const walletController = require('../controllers/walletController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const addFundsSchema = Joi.object({
  amount:    Joi.number().positive().precision(4).max(10000).required(),
  method:    Joi.string().max(100).optional(),
  reference: Joi.string().max(255).optional(),
});

router.use(auth);

router.get('/balance',       walletController.getBalance);
router.get('/transactions',  walletController.getTransactions);
router.post('/add-funds', validate(addFundsSchema), walletController.addFunds);

module.exports = router;
