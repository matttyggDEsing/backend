const router = require('express').Router();
const Joi = require('joi');
const ordersController = require('../controllers/ordersController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createOrder: createOrderLimiter } = require('../middleware/rateLimiter');

const createOrderSchema = Joi.object({
  service_id: Joi.number().integer().positive().required(),
  link:       Joi.string().uri().max(1000).required(),
  quantity:   Joi.number().integer().positive().required(),
});

router.use(auth);

router.get('/',         ordersController.getOrders);
router.get('/stats',    ordersController.getOrderStats);
router.get('/:id',      ordersController.getOrderById);
router.post('/', createOrderLimiter, validate(createOrderSchema), ordersController.createOrder);

module.exports = router;
