const { errorResponse } = require('../utils/response');

/**
 * Fábrica de middleware de validación con Joi.
 * @param {import('joi').Schema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message);
      return errorResponse(res, 'Datos de entrada inválidos', 422, messages);
    }

    req[source] = value;
    next();
  };
};

module.exports = validate;






