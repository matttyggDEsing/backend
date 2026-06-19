const router = require('express').Router();
const Joi = require('joi');
const ordersController = require('../controllers/ordersController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createOrder: createOrderLimiter } = require('../middleware/rateLimiter');

const createOrderSchema = Joi.object({
  service_id: Joi.number().integer().positive().required(),
  link:       Joi.string().max(1000).required(),
  quantity:   Joi.number().integer().positive().required(),
  comments:   Joi.string().max(50000).optional().allow(''),
});

router.use(auth);

router.get('/',         ordersController.getOrders);
router.get('/stats',    ordersController.getOrderStats);
router.get('/chart',    ordersController.getOrderChart);
router.get('/:id',      ordersController.getOrder);
router.post('/', createOrderLimiter, validate(createOrderSchema), ordersController.createOrder);

module.exports = router;
