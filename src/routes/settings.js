'use strict';

const router = require('express').Router();
const settingsController = require('../controllers/settingsController');
const auth      = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');

router.use(auth, adminOnly);

// General
router.get('/',                      settingsController.getSettings);
router.patch('/',                    settingsController.updateSettings);
router.get('/general',               settingsController.getGeneralSettings);
router.patch('/general',             settingsController.setGeneralSettings);

// Mantenimiento
router.get('/maintenance',           settingsController.getMaintenance);
router.patch('/maintenance',         settingsController.setMaintenance);

// Métodos de pago
router.get('/payment-methods',       settingsController.getPaymentMethods);
router.patch('/payment-methods',     settingsController.setPaymentMethods);

// Tasas de cambio
router.get('/exchange-rates',        settingsController.getExchangeRates);
router.patch('/exchange-rates',      settingsController.setExchangeRates);

// Proveedor SMM
router.get('/provider',              settingsController.getProviderSettings);
router.post('/provider',             settingsController.saveProviderSettings);
router.get('/provider/balance',      settingsController.getProviderBalance);

module.exports = router;






