const Joi = require('joi');
require('dotenv').config();

const envSchema = Joi.object({
  NODE_ENV:              Joi.string().valid('development', 'production', 'test').default('development'),
  PORT:                  Joi.number().default(5000),
  FRONTEND_URL:          Joi.string().uri().default('http://localhost:3000'),

  JWT_SECRET:            Joi.string().min(32).required(),
  JWT_EXPIRES_IN:        Joi.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN:Joi.string().default('30d'),

  DB_HOST:               Joi.string().required(),
  DB_PORT:               Joi.number().default(3306),
  DB_USER:               Joi.string().required(),
  DB_PASSWORD:           Joi.string().required(),
  DB_NAME:               Joi.string().required(),

  REDIS_URL:             Joi.string().default('redis://localhost:6379'),

  SMM_PROVIDER_URL:      Joi.string().uri().optional().allow(''),
  SMM_PROVIDER_KEY:      Joi.string().optional().allow(''),

  MAIL_HOST:             Joi.string().optional().allow(''),
  MAIL_PORT:             Joi.number().default(587),
  MAIL_USER:             Joi.string().optional().allow(''),
  MAIL_PASS:             Joi.string().optional().allow(''),
  MAIL_FROM:             Joi.string().optional().allow(''),

  STRIPE_SECRET_KEY:     Joi.string().optional().allow(''),
  PAYPAL_CLIENT_ID:      Joi.string().optional().allow(''),
  PAYPAL_CLIENT_SECRET:  Joi.string().optional().allow(''),
}).unknown(true);

const { error, value } = envSchema.validate(process.env);

if (error) {
  throw new Error(`[ENV] Variable de entorno inválida: ${error.message}`);
}

module.exports = value;



