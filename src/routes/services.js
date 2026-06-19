'use strict';

const router = require('express').Router();
const serviceController  = require('../controllers/serviceController');   // tiene listCategories
const servicesController = require('../controllers/servicesController');  // tiene getServices paginado
const auth = require('../middleware/auth');

router.use(auth);

// IMPORTANTE: /categories debe ir ANTES de /:id para que Express no lo interprete como ID
router.get('/categories', serviceController.listCategories);   // GET /api/services/categories
router.get('/',           servicesController.getServices);     // GET /api/services
router.get('/:id',        serviceController.getService);       // GET /api/services/:id

module.exports = router;






