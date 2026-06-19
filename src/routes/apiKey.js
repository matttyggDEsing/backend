'use strict';

const router = require('express').Router();
const apiKeyController = require('../controllers/apiKeyController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/',             apiKeyController.getApiKey);
router.post('/regenerate',  apiKeyController.regenerateApiKey);
router.get('/stats',        apiKeyController.getStats);
router.get('/logs',         apiKeyController.getLogs);

module.exports = router;






