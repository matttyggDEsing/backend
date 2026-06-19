'use strict';

const { errorResponse } = require('../utils/response');

/**
 * sellerOnly — middleware que permite acceso únicamente a usuarios con rol 'seller' o 'admin'.
 * Debe usarse después del middleware `auth` (que ya valida el JWT y setea req.user).
 */
const sellerOnly = (req, res, next) => {
  if (!req.user) {
    return errorResponse(res, 'No autenticado', 401);
  }
  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    return errorResponse(res, 'Acceso denegado: se requiere rol vendedor', 403);
  }
  next();
};

module.exports = sellerOnly;
