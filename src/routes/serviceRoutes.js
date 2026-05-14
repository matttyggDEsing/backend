'use strict';

const router = require('express').Router();
const serviceController = require('../controllers/serviceController');

// Rutas públicas (requieren auth de usuario, no admin)
router.get('/', serviceController.listServices);
router.get('/categories', serviceController.listCategories);
router.get('/:id', serviceController.getService);

module.exports = router;
