/**
 * Retorna offset, limit y el objeto pagination para la respuesta.
 * @param {object} query  req.query
 * @param {number} total  total de registros
 */
const paginate = (query, total) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.perPage || query.per_page) || 20));
  const offset = (page - 1) * perPage;
  const totalPages = Math.ceil(total / perPage);

  return {
    limit: perPage,
    offset,
    pagination: { page, perPage, total, totalPages },
  };
};

module.exports = { paginate };






