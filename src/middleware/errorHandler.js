const logger = require('../utils/logger');
const { errorResponse } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Loguear sin exponer datos sensibles
  logger.error(`[ErrorHandler] ${req.method} ${req.path} — ${err.message}`, {
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Error de validación de Joi
  if (err.isJoi || err.name === 'ValidationError') {
    return errorResponse(res, 'Datos de entrada inválidos', 422, err.details?.map(d => d.message));
  }

  // JWT inválido / expirado
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Token inválido', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token expirado', 401);
  }

  // Error de MySQL
  if (err.code === 'ER_DUP_ENTRY') {
    return errorResponse(res, 'El recurso ya existe', 409);
  }

  // Error controlado lanzado intencionalmente
  if (err.statusCode) {
    return errorResponse(res, err.message, err.statusCode);
  }

  // Error no esperado — nunca exponer detalles en producción
  return errorResponse(
    res,
    process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    500,
  );
};

module.exports = errorHandler;






