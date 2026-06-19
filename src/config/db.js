const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host:               env.DB_HOST,
  port:               env.DB_PORT,
  user:               env.DB_USER,
  password:           env.DB_PASSWORD,
  database:           env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
  decimalNumbers:     true,
});

const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    logger.info('[DB] Conexión a MySQL establecida correctamente');
    conn.release();
  } catch (err) {
    logger.error('[DB] Error al conectar con MySQL:', err.message);
    throw err;
  }
};

module.exports = { pool, testConnection };






