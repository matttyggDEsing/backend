const router = require('express').Router();
const Joi = require('joi');
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const validate = require('../middleware/validate');

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'banned', 'pending').required(),
});

const addFundsSchema = Joi.object({
  amount: Joi.number().positive().required(),
});

const importServicesSchema = Joi.object({
  provider_id: Joi.number().integer().positive().required(),
  category_id: Joi.number().integer().positive().required(),
});

const replySchema = Joi.object({
  message: Joi.string().min(1).max(5000).required(),
});

const createServiceSchema = Joi.object({
  provider_id:          Joi.number().integer().positive().required(),
  category_id:          Joi.number().integer().positive().required(),
  provider_service_id:  Joi.number().integer().min(0).default(0),
  name:                 Joi.string().min(2).max(500).required(),
  description:          Joi.string().max(2000).allow('').default(''),
  rate:                 Joi.number().positive().required(),
  min_order:            Joi.number().integer().positive().required(),
  max_order:            Joi.number().integer().positive().required(),
  type:                 Joi.string().max(100).default('Default'),
  refill:               Joi.boolean().default(false),
  cancel:               Joi.boolean().default(false),
});

const updateServiceSchema = Joi.object({
  name:       Joi.string().min(2).max(500),
  description:Joi.string().max(2000).allow(''),
  rate:       Joi.number().positive(),
  min_order:  Joi.number().integer().positive(),
  max_order:  Joi.number().integer().positive(),
  is_active:  Joi.number().valid(0, 1),
  type:       Joi.string().max(100),
  category_id:Joi.number().integer().positive(),
});

router.use(auth, adminOnly);

// Stats
router.get('/stats', adminController.getStats);

// Users
router.get('/users',                        adminController.getUsers);
router.patch('/users/:id/status',           validate(updateStatusSchema), adminController.updateUserStatus);
router.post('/users/:id/add-funds',         validate(addFundsSchema),     adminController.adminAddFunds);

// Orders
router.get('/orders',                       adminController.getOrders);

// Tickets
router.get('/tickets',                      adminController.getTickets);
router.get('/tickets/:id/messages',         adminController.adminGetTicketMessages);
router.post('/tickets/:id/reply',           validate(replySchema), adminController.adminReplyTicket);

// Services CRUD
router.get('/services',                     adminController.getAllServices);
router.post('/services',                    validate(createServiceSchema), adminController.createService);
router.patch('/services/:id',               validate(updateServiceSchema), adminController.updateService);
router.delete('/services/:id',              adminController.deleteService);
router.post('/services/import',             validate(importServicesSchema), adminController.importServices);

module.exports = router;