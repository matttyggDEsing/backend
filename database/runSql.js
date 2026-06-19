#!/usr/bin/env node
/**
 * database/runSql.js
 * Ejecuta un archivo SQL arbitrario.
 * Uso: node database/runSql.js database/add_settings_table.sql
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const SQL_FILE = process.argv[2];
if (!SQL_FILE) {
  console.error('Uso: node database/runSql.js <archivo.sql>');
  process.exit(1);
}

const run = async () => {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST     || 'localhost',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER,
    password:           process.env.DB_PASSWORD,
    database:           process.env.DB_NAME,
    multipleStatements: true,
    charset:            'utf8mb4',
  });
  try {
    const sql = fs.readFileSync(path.resolve(SQL_FILE), 'utf8');
    await conn.query(sql);
    console.log(`✅ ${path.basename(SQL_FILE)} ejecutado correctamente`);
  } finally {
    await conn.end();
  }
};

run().catch((err) => { console.error('❌ Error:', err.message); process.exit(1); });
