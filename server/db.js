// Conexión a Postgres (Neon u otro), solo para la tabla `users` — el resto de
// datos (perfil, voz, historial, programados) siguen viviendo en Redis/archivo
// como hasta ahora, namespaced por usuario. Ver server/index.js: getTenant().
import pg from 'pg';

export const isDbConfigured = !!process.env.DATABASE_URL;

// Neon exige SSL; no asumimos que el connection string ya trae sslmode=require.
export const pool = isDbConfigured
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

export function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL no está configurada');
  return pool.query(text, params);
}
