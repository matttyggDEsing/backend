const { pool } = require('../config/db');

const log = async ({ user_id, action, request_data, response_data, ip, status_code }) => {
  await pool.query(
    `INSERT INTO api_logs (user_id, action, request_data, response_data, ip, status_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      action,
      JSON.stringify(request_data),
      JSON.stringify(response_data),
      ip,
      status_code,
    ],
  ).catch(() => {}); // Fire and forget — no bloquear la respuesta
};

module.exports = { log };
