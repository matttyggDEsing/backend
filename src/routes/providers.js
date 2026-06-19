const router = require('express').Router();
const Joi = require('joi');
const providersController = require('../controllers/providersController');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const validate = require('../middleware/validate');

const createProviderSchema = Joi.object({
  name:    Joi.string().min(2).max(100).required(),
  api_url: Joi.string().uri().max(500).required(),
  api_key: Joi.string().min(4).max(500).required(),
});

router.use(auth, adminOnly);

router.get('/',            providersController.getProviders);
router.post('/',           validate(createProviderSchema), providersController.createProvider);
router.post('/:id/sync',   providersController.syncProvider);

module.exports = router;






