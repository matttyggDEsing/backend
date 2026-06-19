/**
 * Envía una respuesta de éxito.
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} [message]
 * @param {number} [statusCode=200]
 */
const successResponse = (res, data = null, message = null, statusCode = 200) => {
  const body = { success: true };
  if (data !== null && data !== undefined) body.data = data;
  if (message) body.message = message;
  return res.status(statusCode).json(body);
};

/**
 * Envía una respuesta de éxito con paginación.
 */
const paginatedResponse = (res, data, pagination) => {
  return res.status(200).json({
    success: true,
    data,
    pagination,
  });
};

/**
 * Envía una respuesta de error.
 * @param {import('express').Response} res
 * @param {string} message
 * @param {number} [statusCode=400]
 * @param {Array} [errors]
 */
const errorResponse = (res, message, statusCode = 400, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

module.exports = { successResponse, paginatedResponse, errorResponse };




