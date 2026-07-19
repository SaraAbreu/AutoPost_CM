#!/usr/bin/env node
// Ejecuta las migraciones SQL en server/migrations/ contra DATABASE_URL, en
// orden por nombre de archivo. Sin framework de migraciones (una sola tabla
// por ahora no lo justifica) — cada .sql usa CREATE TABLE IF NOT EXISTS, así
// que correr este script varias veces es seguro.
//
// Uso:
//   npm run migrate

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'server', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en .env — no hay nada que migrar.');
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.log('No hay migraciones en server/migrations/.');
    return;
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`Aplicando ${file}...`);
      await pool.query(sql);
    }
    console.log('✅ Migraciones aplicadas.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Error migrando:', err.message);
  process.exit(1);
});
