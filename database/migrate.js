#!/usr/bin/env node
/**
 * database/migrate.js
 * Ejecuta schema.sql contra la base de datos configurada en .env
 * Uso: node database/migrate.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const SQL_FILE = path.join(__dirname, 'schema.sql');

const run = async () => {
  const conn = await mysql.createConnection({
    host:             process.env.DB_HOST     || 'localhost',
    port:             parseInt(process.env.DB_PORT) || 3306,
    user:             process.env.DB_USER,
    password:         process.env.DB_PASSWORD,
    database:         process.env.DB_NAME,
    multipleStatements: true,
    charset:          'utf8mb4',
  });

  try {
    console.log('[Migrate] Conectado a MySQL');
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    await conn.query(sql);
    console.log('[Migrate] ✅ Schema aplicado correctamente');
  } finally {
    await conn.end();
  }
};

run().catch((err) => {
  console.error('[Migrate] ❌ Error:', err.message);
  process.exit(1);
});






