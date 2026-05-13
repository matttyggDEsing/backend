const router = require('express').Router();
const Joi = require('joi');
const ticketsController = require('../controllers/ticketsController');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');

const createTicketSchema = Joi.object({
  subject:  Joi.string().min(3).max(500).required(),
  message:  Joi.string().min(5).max(5000).required(),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
});

const replySchema = Joi.object({
  message: Joi.string().min(1).max(5000).required(),
});

router.use(auth);

router.get('/',         ticketsController.getTickets);
router.post('/',        validate(createTicketSchema), ticketsController.createTicket);
router.get('/:id',      ticketsController.getTicketById);
router.post('/:id/reply', validate(replySchema), ticketsController.replyToTicket);

module.exports = router;
