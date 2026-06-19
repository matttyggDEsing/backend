const { errorResponse } = require('../utils/response');

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return errorResponse(res, 'Acceso restringido a administradores', 403);
  }
  next();
};

module.exports = adminOnly;






