const router = require('express').Router();
const apiController = require('../controllers/apiController');
const { publicApi: publicApiLimiter } = require('../middleware/rateLimiter');

// POST /api/v2 — estándar SMM Panel v2
router.post('/', publicApiLimiter, apiController.publicApi);

module.exports = router;






