const router = require('express').Router();
const servicesController = require('../controllers/servicesController');

router.get('/',    servicesController.getServices);
router.get('/:id', servicesController.getServiceById);

module.exports = router;
