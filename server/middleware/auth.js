import { isDbConfigured } from '../db.js';
import { verifyToken } from '../auth/jwt.js';
import { findUserById } from '../auth/users.js';

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => {
    const idx = c.indexOf('=');
    return idx === -1 ? [c.trim(), ''] : [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
  }));
}

// No bloqueante: si no hay cookie, o el token es inválido/expiró, o Postgres
// falla al buscar el usuario, simplemente no autentica y sigue — igual de
// tolerante que sessionMiddleware con la cookie demo_sid. Busca el usuario en
// cada request (en vez de confiar en un plan embebido en el JWT) para que un
// cambio de plan futuro (ej. tras un pago) se refleje sin esperar a que
// expire la sesión.
export async function authMiddleware(req, res, next) {
  if (!isDbConfigured) return next();
  try {
    const token = parseCookies(req).auth_token;
    if (!token) return next();
    const payload = verifyToken(token);
    if (!payload) return next();
    const user = await findUserById(payload.sub);
    if (!user) return next(); // usuario borrado con una sesión aún vigente
    req.userId = user.id;
    req.userEmail = user.email;
    req.userPlan = user.plan;
  } catch (err) {
    console.error('Error en authMiddleware, continuando sin autenticar:', err.message);
  }
  next();
}

// Solo bloquea cuando el despliegue es multi-tenant real (DATABASE_URL
// configurada) y la petición no trae ni usuario autenticado ni sesión demo.
// Sin DATABASE_URL, no hace nada (modo legado: APP_PASSWORD gatea toda la
// app en server/index.js, no esta ruta en concreto).
export function requireIdentity(req, res, next) {
  if (!isDbConfigured) return next();
  if (req.userId || req.sid) return next();
  return res.status(401).json({ error: 'Inicia sesión para continuar' });
}
