'use strict';

const router = require('express').Router();
const Joi    = require('joi');
const adminController = require('../controllers/adminController');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const validate  = require('../middleware/validate');

// ── Schemas ────────────────────────────────────────────────────────────────────
const updateStatusSchema = Joi.object({
  status: Joi.string().valid('active', 'banned', 'pending').required(),
});
const addFundsSchema = Joi.object({
  amount: Joi.number().positive().required(),
});
const importServicesSchema = Joi.object({
  provider_id:     Joi.number().integer().positive().required(),
  category_id:     Joi.number().integer().positive().required(),
  category_filter: Joi.string().allow('').default(''),
});
const replySchema = Joi.object({
  message: Joi.string().min(1).max(5000).required(),
});
const createServiceSchema = Joi.object({
  provider_id:         Joi.number().integer().positive().required(),
  category_id:         Joi.number().integer().positive().required(),
  provider_service_id: Joi.number().integer().min(0).default(0),
  name:                Joi.string().min(2).max(500).required(),
  description:         Joi.string().max(2000).allow('').default(''),
  rate:                Joi.number().positive().required(),
  min_order:           Joi.number().integer().positive().required(),
  max_order:           Joi.number().integer().positive().required(),
  type:                Joi.string().max(100).default('Default'),
  refill:              Joi.boolean().default(false),
  cancel:              Joi.boolean().default(false),
});
const updateServiceSchema = Joi.object({
  name:        Joi.string().min(2).max(500),
  description: Joi.string().max(2000).allow(''),
  rate:        Joi.number().positive(),
  min_order:   Joi.number().integer().positive(),
  max_order:   Joi.number().integer().positive(),
  is_active:   Joi.number().valid(0, 1),
  type:        Joi.string().max(100),
  category_id: Joi.number().integer().positive(),
});
const providerSchema = Joi.object({
  name:    Joi.string().min(2).max(100).required(),
  api_url: Joi.string().uri().max(500).required(),
  api_key: Joi.string().min(4).max(500).allow('').default(''),
});

router.use(auth, adminOnly);

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/stats',            adminController.getStats);
router.get('/chart',            adminController.getChart);
router.get('/orders/recent',    adminController.getRecentOrders);

// ── Users ──────────────────────────────────────────────────────────────────────
router.get('/users',                                              adminController.getUsers);
router.patch('/users/:id/status', validate(updateStatusSchema),  adminController.updateUserStatus);
router.post('/users/:id/add-funds', validate(addFundsSchema),    adminController.adminAddFunds);
router.delete('/users/:id',               adminController.deleteUser);
router.patch('/users/:id/role',            adminController.updateUserRole);
router.post('/users/:id/balance',   validate(addFundsSchema),    adminController.adminAddFunds); // alias frontend

// ── Orders ─────────────────────────────────────────────────────────────────────
router.get('/orders',           adminController.getOrders);

// ── Tickets ────────────────────────────────────────────────────────────────────
router.get('/tickets',                      adminController.getTickets);
router.get('/tickets/:id/messages',         adminController.adminGetTicketMessages);
router.post('/tickets/:id/reply', validate(replySchema), adminController.adminReplyTicket);

// ── Providers ──────────────────────────────────────────────────────────────────
router.get('/providers',                    adminController.getProviders);
router.post('/providers', validate(providerSchema), adminController.createProvider);
router.put('/providers/:id', validate(providerSchema), adminController.updateProvider);   // ← FIX: faltaba
router.delete('/providers/:id',             adminController.deleteProvider);              // ← FIX: faltaba
router.post('/providers/:id/sync',          adminController.syncProvider);
router.get('/providers/:id/balance',        adminController.getProviderBalance);          // ← FIX: faltaba

// ── Services ───────────────────────────────────────────────────────────────────
router.get('/services/provider-categories', adminController.getProviderCategories);
router.post('/services/import', validate(importServicesSchema), adminController.importServices);
router.post('/services/sync',               adminController.syncServices);
router.get('/services',                     adminController.getAllServices);
router.post('/services', validate(createServiceSchema), adminController.createService);
router.patch('/services/:id', validate(updateServiceSchema), adminController.updateService);
router.delete('/services/:id',              adminController.deleteService);
router.post('/services/apply-markup', adminController.applyMarkup);

router.get('/deposits',              adminController.getDeposits);
router.post('/deposits/:id/approve', adminController.approveDeposit);
router.post('/deposits/:id/reject',  adminController.rejectDeposit);

// NOTA: las rutas de /settings (incluye modo mantenimiento) viven en
// src/routes/settings.js, montadas en server.js como '/api/admin/settings'.
// Antes acá había un alias '/settings' que tapaba esas rutas por orden de
// registro en Express y dejaba el sistema de la tabla `settings` como código
// muerto — por eso el toggle de mantenimiento del panel nunca surtía efecto
// donde correspondía. Se quitó para que quede una sola fuente de verdad.

module.exports = router;



