import { query } from '../db.js';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// Lanza un Error con .code = 'EMAIL_TAKEN' si el email ya existe (violación
// de unicidad de Postgres, 23505) — el caller (POST /api/auth/register)
// lo traduce a un 409 en vez de dejarlo caer como 500 genérico.
export async function createUser(email, passwordHash) {
  try {
    const { rows } = await query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, plan, created_at',
      [normalizeEmail(email), passwordHash]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      const e = new Error('Ese email ya está registrado');
      e.code = 'EMAIL_TAKEN';
      throw e;
    }
    throw err;
  }
}

export async function findUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await query('SELECT id, email, plan, created_at FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

// Usada por el scheduler para recorrer los posts programados de todos los usuarios.
export async function listUserIds() {
  const { rows } = await query('SELECT id FROM users');
  return rows.map(r => r.id);
}

// El token de acceso NUNCA se selecciona junto al resto del perfil (findUserById)
// para que no pueda terminar filtrándose por accidente al frontend en /api/auth/me
// o similares — solo estas funciones dedicadas lo tocan.
export async function saveInstagramAccount(userId, { instagramUserId, username, accessToken, expiresAt }) {
  await query(
    `UPDATE users
     SET instagram_user_id = $1, instagram_username = $2, instagram_access_token = $3, instagram_token_expires_at = $4
     WHERE id = $5`,
    [instagramUserId, username, accessToken, expiresAt, userId]
  );
}

export async function getInstagramAccount(userId) {
  const { rows } = await query(
    'SELECT instagram_user_id, instagram_username, instagram_access_token, instagram_token_expires_at FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

export async function clearInstagramAccount(userId) {
  await query(
    `UPDATE users
     SET instagram_user_id = NULL, instagram_username = NULL, instagram_access_token = NULL, instagram_token_expires_at = NULL
     WHERE id = $1`,
    [userId]
  );
}
