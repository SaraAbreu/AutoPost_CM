import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { Redis } from '@upstash/redis';
import { getModule, listModules } from './modules/index.js';
import { generateImage } from './services/imageGen.js';
import { notifyTrialRequest } from './services/email.js';
import bcrypt from 'bcryptjs';
import { isDbConfigured } from './db.js';
import { createUser, findUserByEmail, listUserIds, saveInstagramAccount, getInstagramAccount, clearInstagramAccount } from './auth/users.js';
import { signToken, verifyToken } from './auth/jwt.js';
import { authMiddleware, requireIdentity } from './middleware/auth.js';
import { isInstagramOAuthConfigured, getAuthorizeUrl, completeInstagramLogin } from './auth/instagram.js';

// Persistencia: si hay credenciales de Upstash, los datos "de verdad" (perfil,
// voz aprendida, reseñas, leads) viven en Redis y sobreviven a cualquier
// redeploy/reinicio, sea cual sea el hosting. Sin credenciales (ej. desarrollo
// local sin cuenta creada), cada función cae automáticamente en el archivo
// local de siempre — no hace falta Redis para seguir trabajando en local.
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

const __file = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__file, 'profile.json');
// profile.json está en .gitignore a propósito (no queremos subir datos reales
// de un cliente a git). Eso significa que un despliegue nuevo (Railway, etc.)
// arranca sin ese archivo. profile.default.json SÍ se commitea — es un perfil
// de ejemplo neutro (KNT Tattoo, ficticio) para que una demo pública no se vea
// vacía/rota el primer día. profile.json, si existe, siempre gana.
const DEFAULT_PROFILE_PATH = path.join(__file, 'profile.default.json');
const VOICE_PATH   = path.join(__file, 'voice.json');

// Carpeta donde dejamos temporalmente la imagen de un post mientras Meta la
// descarga para publicarla (Meta exige una URL pública, no acepta base64).
// Se sirve como estática más abajo y cada archivo se autoborra a los pocos minutos.
const TMP_UPLOADS_DIR = path.join(__file, 'tmp-uploads');
fs.mkdirSync(TMP_UPLOADS_DIR, { recursive: true });

// ─── Demo pública: límite diario + aislamiento por sesión (opcional) ────────
// Si defines DEMO_DAILY_LIMIT (ej. "3"), esta instancia se considera una demo
// pública abierta a cualquiera, y pasan dos cosas a la vez:
//   1. Cada IP solo puede generar ese número de veces al día (protege la
//      cuota gratuita de Groq/Pollinations).
//   2. Cada visitante (identificado por una cookie anónima, sin login) tiene
//      SU PROPIO perfil de marca, historial y voz aprendida en memoria — así
//      nadie pisa lo que está probando otra persona en la misma URL.
// Sin DEMO_DAILY_LIMIT (un despliegue de cliente real, ej. Objetiva Broker),
// todo sigue exactamente como antes: un único perfil/historial compartido
// guardado en disco, que es lo correcto para un solo negocio real.
const DEMO_DAILY_LIMIT = parseInt(process.env.DEMO_DAILY_LIMIT, 10) || 0;
const DEMO_MODE = DEMO_DAILY_LIMIT > 0;
const demoUsage = new Map();        // "ip|YYYY-MM-DD" -> nº de usos ese día
const sessionProfiles = new Map();  // sid -> perfil de esa sesión
const sessionVoices = new Map();    // sid -> { examples, patterns, lastAnalyzed }
const sessionHistories = new Map(); // sid -> historial de esa sesión
const sessionScheduled = new Map(); // sid -> posts programados de esa sesión (solo demo)

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(header.split(';').map(c => {
    const idx = c.indexOf('=');
    return idx === -1 ? [c.trim(), ''] : [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
  }));
}

// Asigna a cada visitante una cookie anónima (demo_sid) para darle su propio
// espacio aislado. Solo actúa si DEMO_MODE está activo — en un despliegue de
// cliente real no hace nada (req.sid queda null y todo usa el disco compartido).
function sessionMiddleware(req, res, next) {
  if (!DEMO_MODE) { req.sid = null; return next(); }
  const cookies = parseCookies(req);
  let sid = cookies.demo_sid;
  if (!sid) {
    sid = crypto.randomUUID();
    res.setHeader('Set-Cookie', `demo_sid=${sid}; Max-Age=${30 * 24 * 3600}; Path=/; HttpOnly; SameSite=Lax`);
  }
  req.sid = sid;
  next();
}

function demoLimitGuard(req, res, next) {
  if (!DEMO_MODE) return next(); // sin límite configurado, comportamiento normal
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}|${today}`;
  const used = demoUsage.get(key) || 0;
  if (used >= DEMO_DAILY_LIMIT) {
    return res.status(429).json({
      error: `Has usado tus ${DEMO_DAILY_LIMIT} generaciones gratis de hoy. Pide tu prueba completa para seguir sin límite.`,
      limitReached: true,
      limit: DEMO_DAILY_LIMIT
    });
  }
  demoUsage.set(key, used + 1);
  next();
}

// Tres identidades posibles por request, en este orden de prioridad: usuario
// autenticado (persistente, aislado) > sesión demo (memoria, efímera) >
// "shared" (modo legado de cliente único sin cuentas, dataset compartido).
// Comprobamos userId ANTES que sid a propósito: si un usuario logueado
// conserva una cookie demo_sid residual, no debe perder acceso a sus datos
// reales por eso.
function getTenant(req) {
  if (req.userId) return { type: 'user', id: req.userId };
  if (req.sid) return { type: 'demo', id: req.sid };
  return { type: 'shared' };
}

function userDataPath(userId, filename) {
  return path.join(__file, 'data', 'users', String(userId), filename);
}

function writeUserFile(userId, filename, data) {
  const p = userDataPath(userId, filename);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// tenant.type === 'demo' -> perfil/voz/historial propios de esa sesión, en
// memoria (aceptable perderlos al reiniciar, es solo una demo). tenant.type
// === 'user' -> dato persistente y aislado por usuario: Redis (namespaced) si
// hay credenciales, si no un archivo propio en server/data/users/<id>/.
// tenant.type === 'shared' -> dato persistente compartido de siempre: Redis
// si hay credenciales, si no el fichero local de siempre (fallback dev).
async function loadProfile(tenant) {
  if (tenant.type === 'demo') {
    if (!sessionProfiles.has(tenant.id)) {
      let base = {};
      try { base = JSON.parse(fs.readFileSync(DEFAULT_PROFILE_PATH, 'utf8')); } catch {}
      sessionProfiles.set(tenant.id, { ...base });
    }
    return sessionProfiles.get(tenant.id);
  }
  if (tenant.type === 'user') {
    if (redis) {
      try {
        const data = await redis.get(`profile:user:${tenant.id}`);
        if (data) return data;
      } catch (err) { console.error('Redis error (loadProfile user), usando fallback local:', err.message); }
    }
    try { return JSON.parse(fs.readFileSync(userDataPath(tenant.id, 'profile.json'), 'utf8')); }
    catch { return {}; }
  }
  if (redis) {
    try {
      const data = await redis.get('profile');
      if (data) return data;
    } catch (err) { console.error('Redis error (loadProfile), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')); }
  catch {
    try { return JSON.parse(fs.readFileSync(DEFAULT_PROFILE_PATH, 'utf8')); }
    catch { return {}; }
  }
}

async function saveProfile(tenant, data) {
  if (tenant.type === 'demo') { sessionProfiles.set(tenant.id, data); return; }
  if (tenant.type === 'user') {
    if (redis) {
      try { await redis.set(`profile:user:${tenant.id}`, data); return; }
      catch (err) { console.error('Redis error (saveProfile user), usando fallback local:', err.message); }
    }
    writeUserFile(tenant.id, 'profile.json', data);
    return;
  }
  if (redis) {
    try { await redis.set('profile', data); return; }
    catch (err) { console.error('Redis error (saveProfile), usando fallback local:', err.message); }
  }
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function loadVoice(tenant) {
  if (tenant.type === 'demo') {
    if (!sessionVoices.has(tenant.id)) sessionVoices.set(tenant.id, { examples: [], patterns: null });
    return sessionVoices.get(tenant.id);
  }
  if (tenant.type === 'user') {
    if (redis) {
      try {
        const data = await redis.get(`voice:user:${tenant.id}`);
        if (data) return data;
      } catch (err) { console.error('Redis error (loadVoice user), usando fallback local:', err.message); }
    }
    try { return JSON.parse(fs.readFileSync(userDataPath(tenant.id, 'voice.json'), 'utf8')); }
    catch { return { examples: [], patterns: null }; }
  }
  if (redis) {
    try {
      const data = await redis.get('voice');
      if (data) return data;
    } catch (err) { console.error('Redis error (loadVoice), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(VOICE_PATH, 'utf8')); }
  catch { return { examples: [], patterns: null }; }
}

async function saveVoice(tenant, data) {
  if (tenant.type === 'demo') { sessionVoices.set(tenant.id, data); return; }
  if (tenant.type === 'user') {
    if (redis) {
      try { await redis.set(`voice:user:${tenant.id}`, data); return; }
      catch (err) { console.error('Redis error (saveVoice user), usando fallback local:', err.message); }
    }
    writeUserFile(tenant.id, 'voice.json', data);
    return;
  }
  if (redis) {
    try { await redis.set('voice', data); return; }
    catch (err) { console.error('Redis error (saveVoice), usando fallback local:', err.message); }
  }
  fs.writeFileSync(VOICE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function getHistory(tenant) {
  if (tenant.type === 'demo') {
    if (!sessionHistories.has(tenant.id)) sessionHistories.set(tenant.id, []);
    return sessionHistories.get(tenant.id);
  }
  if (tenant.type === 'shared') return history; // en memoria, como hoy — nunca se persiste
  // tenant.type === 'user' — persistente, namespaced por usuario
  if (redis) {
    try {
      const data = await redis.get(`history:user:${tenant.id}`);
      if (data) return data;
    } catch (err) { console.error('Redis error (getHistory user), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(userDataPath(tenant.id, 'history.json'), 'utf8')); }
  catch { return []; }
}

// Companion de getHistory(): para 'demo'/'shared' la mutación en memoria ya
// es visible (misma referencia), no hace falta guardar nada — solo 'user'
// necesita persistir explícitamente. Cada entrada lleva su imagen en base64
// inline, así que capamos a las últimas 50 para no reventar el límite de
// tamaño de request de Upstash Free.
async function saveHistory(tenant, list) {
  if (tenant.type !== 'user') return;
  const capped = list.slice(0, 50);
  if (redis) {
    try { await redis.set(`history:user:${tenant.id}`, capped); return; }
    catch (err) { console.error('Redis error (saveHistory user), usando fallback local:', err.message); }
  }
  writeUserFile(tenant.id, 'history.json', capped);
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// La cuenta de Groq tiene un límite de tokens-por-minuto (TPM) para
// qwen/qwen3.6-27b. "Semana completa" con varias fotos distintas puede
// agotarlo si se piden varias imágenes casi a la vez (cada imagen consume
// bastantes tokens de visión). Este helper reintenta automáticamente cuando
// Groq responde 429 rate_limit_exceeded, esperando el tiempo que el propio
// error de Groq sugiere (viene en su mensaje, ej. "Please try again in 14.96s").
async function callGroq(payload, retries = 2) {
  try {
    return await axios.post(GROQ_URL, payload, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    const groqError = err.response?.data?.error;
    if (retries > 0 && groqError?.code === 'rate_limit_exceeded') {
      const match = groqError.message?.match(/try again in ([\d.]+)s/);
      const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 500 : 5000;
      console.warn(`Rate limit de Groq alcanzado, reintentando en ${(waitMs / 1000).toFixed(1)}s... (quedan ${retries} intentos)`);
      await new Promise(r => setTimeout(r, waitMs));
      return callGroq(payload, retries - 1);
    }
    throw err;
  }
}

async function analyzeVoice(examples) {
  const pairs = examples.map((e, i) =>
    `--- Par ${i + 1} ---\nOriginal IA:\n${e.original}\n\nEditado por el usuario:\n${e.final}`
  ).join('\n\n');

  const response = await callGroq({
    model: 'qwen/qwen3.6-27b',
    reasoning_effort: 'none',
    messages: [{
      role: 'user',
      content: `Analiza estos ${examples.length} pares de captions de Instagram (versión IA vs versión editada por el usuario) e identifica los patrones de estilo y preferencias del usuario.

${pairs}

Responde SOLO con una lista numerada de 4-5 patrones concisos y específicos en español. Ejemplos de buenas respuestas: "Prefiere frases de máximo 10 palabras", "Siempre incluye el número de teléfono en el CTA", "Evita los signos de exclamación", "Usa tuteo informal". Sin introducción ni conclusión.`
    }],
    max_tokens: 300
  });

  return response.data.choices[0].message.content.trim();
}

function profileContext(p) {
  if (!p || !p.nombre) return '';
  const lines = [
    `Empresa: ${p.nombre}`,
    p.sector    ? `Sector: ${p.sector}` : '',
    p.ciudad    ? `Ubicación: ${p.ciudad}` : '',
    p.servicios ? `Productos/servicios: ${p.servicios}` : '',
    p.tono      ? `Tono de comunicación: ${p.tono}` : '',
    p.cta       ? `CTA habitual: ${p.cta}` : '',
    p.hashtags  ? `Hashtags propios: ${p.hashtags}` : '',
  ].filter(Boolean);
  return `CONTEXTO DE MARCA (úsalo siempre, no pongas placeholders):\n${lines.join('\n')}\n\n`;
}

async function voiceContext(tenant) {
  const { patterns } = await loadVoice(tenant);
  if (!patterns) return '';
  return `ESTILO APRENDIDO DEL USUARIO (respétalos estrictamente):\n${patterns}\n\n`;
}

// Genera UN caption para UNA imagen con UN ángulo concreto. La usan tanto
// /api/generate-day como /api/generate-week cuando hay varias fotos (una por día).
async function generateCaptionForAngle(base64, mimeType, profile, module, angleDef, tenant) {
  const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
  const complianceExtra = module.compliance ? module.compliance(profile) : '';
  const voiceCtx = await voiceContext(tenant);

  const payload = {
    model: 'qwen/qwen3.6-27b',
    reasoning_effort: 'none',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        {
          type: 'text',
          text: `Eres un experto community manager de Instagram especializado en negocios hispanohablantes de cualquier sector.

${profileContext(profile)}${moduleExtra}${voiceCtx}Analiza esta imagen y genera UN ÚNICO caption para Instagram con este ángulo: ${angleDef.angle}

Debe tener: primera línea con gancho que pare el scroll, 2-3 frases naturales que conecten la imagen con el negocio, llamada a la acción específica para el sector, y 5 hashtags relevantes.
${complianceExtra}
Responde SOLO con el caption final, sin explicaciones, sin comillas ni texto adicional. NO pongas placeholders. Máximo 1500 caracteres.`
        }
      ]
    }],
    max_tokens: 600
  };

  const response = await callGroq(payload);

  return response.data.choices[0].message.content.replace(/\\#/g, '#').trim();
}

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
app.set('trust proxy', true); // necesario para leer la IP real detrás de Railway/Hostinger/etc.

// Historial en memoria (en produccion se podria usar SQLite) — usado tal cual
// solo cuando no hay sesión (cliente real); en demo pública cada sesión tiene
// el suyo propio en sessionHistories (ver getHistory más arriba).
const history = [];

// Multer — almacena en memoria para pasarlo a Groq como base64
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

app.use(cors());
// Límite alto a propósito: /api/schedule-week manda las 5 fotos de la semana
// como base64 dentro del JSON (hasta 20MB cada una, según el límite de multer
// de arriba, más el ~33% que añade la codificación base64). El límite por
// defecto de express.json() es 100kb — con eso, cualquier POST con imágenes
// fallaba con "PayloadTooLargeError" y el navegador veía una página HTML de
// error en vez de JSON (de ahí el "Unexpected token '<'" al parsear).
app.use(express.json({ limit: '100mb' }));
app.use('/tmp-uploads', express.static(TMP_UPLOADS_DIR));
app.use('/api', sessionMiddleware); // asigna/lee la cookie demo_sid (solo si DEMO_MODE)
app.use('/api', authMiddleware); // decodifica la cookie auth_token si existe (solo si DATABASE_URL)

// ─── Autenticación básica (opcional, modo legado) ────────────────────────────
// Si defines APP_PASSWORD en el .env Y NO hay DATABASE_URL configurada, toda
// la app (frontend + API) pide contraseña antes de dejar pasar nada — pensado
// para el modelo de "un despliegue por cliente" (ver scripts/create-vertical-repo.js).
// En cuanto defines DATABASE_URL, este gate se desactiva: el despliegue pasa a
// ser multi-tenant y usa cuentas de usuario reales (ver requireIdentity más
// abajo) en su lugar. Sin APP_PASSWORD ni DATABASE_URL, la app sigue abierta
// como siempre — útil para desarrollo local.
if (process.env.APP_PASSWORD && !isDbConfigured) {
  app.use((req, res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      const pass = decoded.split(':')[1];
      if (pass === process.env.APP_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="AutoPost CM"');
    res.status(401).send('Autenticación requerida');
  });
}

// ─── API: Cuentas de usuario (solo si DATABASE_URL está configurada) ────────
const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'Lax',
  maxAge: 30 * 24 * 3600 * 1000, // 30 días, igual que la expiración del JWT
};

// Límite simple de intentos de login por IP, en memoria — mismo patrón que
// demoUsage/demoLimitGuard más arriba. Protege contra fuerza bruta básica;
// no persiste entre reinicios, suficiente para esta fase.
const loginAttempts = new Map(); // "ip" -> { count, resetAt }
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function loginRateLimit(req, res, next) {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Demasiados intentos. Prueba de nuevo en unos minutos.' });
  }
  entry.count++;
  next();
}

function setAuthCookie(res, token) {
  res.cookie('auth_token', token, { ...AUTH_COOKIE_OPTS, secure: IS_PROD });
}

app.post('/api/auth/register', async (req, res) => {
  if (!isDbConfigured) return res.status(400).json({ error: 'Cuentas de usuario no disponibles en este despliegue' });
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'El email no parece válido' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(email, passwordHash);
    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ success: true, email: user.email, plan: user.plan });
  } catch (err) {
    if (err.code === 'EMAIL_TAKEN') return res.status(409).json({ error: err.message });
    console.error('Error en /api/auth/register:', err.message);
    res.status(500).json({ error: 'No se pudo crear la cuenta' });
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  if (!isDbConfigured) return res.status(400).json({ error: 'Cuentas de usuario no disponibles en este despliegue' });
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email || '');
    if (!user) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    const valid = await bcrypt.compare(password || '', user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ success: true, email: user.email, plan: user.plan });
  } catch (err) {
    console.error('Error en /api/auth/login:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token', { httpOnly: true, sameSite: 'Lax', secure: IS_PROD });
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'No has iniciado sesión' });
  res.json({ email: req.userEmail, plan: req.userPlan });
});

// ─── API: Conectar Instagram por usuario (OAuth "Instagram API with Instagram Login") ──
// Cada usuario conecta SU PROPIA cuenta desde Configuración — reemplaza, para
// despliegues multi-tenant, el META_ACCESS_TOKEN/META_INSTAGRAM_ACCOUNT_ID
// globales del .env (ver publishToMeta más abajo, que sigue usando esos como
// fallback para el modo "cliente único" de siempre).
app.get('/api/instagram/status', requireIdentity, async (req, res) => {
  if (!isDbConfigured || !req.userId) return res.json({ connected: false });
  const account = await getInstagramAccount(req.userId);
  res.json({ connected: !!account?.instagram_access_token, username: account?.instagram_username || null });
});

app.get('/api/instagram/connect', requireIdentity, (req, res) => {
  if (!isDbConfigured || !req.userId) return res.status(401).json({ error: 'Inicia sesión para conectar Instagram' });
  if (!isInstagramOAuthConfigured) return res.status(400).json({ error: 'Conexión con Instagram no configurada en este despliegue (falta INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET)' });
  if (!process.env.PUBLIC_URL) return res.status(400).json({ error: 'Falta PUBLIC_URL en .env' });
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('ig_oauth_state', state, { httpOnly: true, sameSite: 'Lax', maxAge: 10 * 60 * 1000, secure: IS_PROD });
  res.redirect(getAuthorizeUrl(state));
});

// Meta redirige acá tras la autorización — esta request no viene del frontend
// (viene del navegador siguiendo la redirección de Instagram), así que la
// identidad del usuario se recupera de la cookie auth_token, no de fetch/JSON.
app.get('/api/instagram/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const cookies = parseCookies(req);
  res.clearCookie('ig_oauth_state', { httpOnly: true, sameSite: 'Lax', secure: IS_PROD });

  if (error) return res.redirect(`/?instagram_error=${encodeURIComponent(error_description || error)}`);
  if (!code || !state || state !== cookies.ig_oauth_state) return res.redirect('/?instagram_error=estado_invalido');

  const payload = cookies.auth_token && verifyToken(cookies.auth_token);
  if (!payload) return res.redirect('/?instagram_error=sesion_expirada');

  try {
    const account = await completeInstagramLogin(code);
    await saveInstagramAccount(payload.sub, account);
    res.redirect('/?instagram_connected=1');
  } catch (err) {
    console.error('Error conectando Instagram:', err.response?.data || err.message);
    res.redirect('/?instagram_error=fallo_conexion');
  }
});

app.post('/api/instagram/disconnect', requireIdentity, async (req, res) => {
  if (!isDbConfigured || !req.userId) return res.status(401).json({ error: 'Inicia sesión para desconectar Instagram' });
  await clearInstagramAccount(req.userId);
  res.json({ success: true });
});

// ─── API: Generar caption con Groq Vision ────────────────────────────────────
app.post('/api/generate', requireIdentity, demoLimitGuard, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const tenant = getTenant(req);
    const profile = await loadProfile(tenant);
    const module = getModule(profile.modulo);
    const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
    const complianceExtra = module.compliance ? module.compliance(profile) : '';
    const voiceCtx = await voiceContext(tenant);
    const tones = (module.tones && module.tones.length === 3) ? module.tones : getModule('generico').tones;
    const toneLines = tones.map((t, i) => `- Opción ${i + 1}: ${t.angle}`).join('\n');

    const payload = {
      model: 'qwen/qwen3.6-27b',
      reasoning_effort: 'none',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` }
          },
          {
            type: 'text',
            text: `Eres un experto community manager de Instagram especializado en negocios hispanohablantes de cualquier sector.

${profileContext(profile)}${moduleExtra}${voiceCtx}Analiza la imagen y genera EXACTAMENTE 3 captions distintos listos para publicar en Instagram, en español. Adapta el lenguaje, tono y referencias al sector de la marca. Cada opción debe tener un enfoque diferente:
${toneLines}

Formato OBLIGATORIO — respeta los separadores exactos:

===OPCION_1===
[caption completo]
===OPCION_2===
[caption completo]
===OPCION_3===
[caption completo]

Cada caption debe tener:
- Primera línea: gancho que para el scroll
- 2-3 frases que conecten la imagen con el negocio de forma natural
- Llamada a la acción clara y específica para el sector
- 5 hashtags relevantes para el sector y el contenido
${complianceExtra}
NO pongas placeholders como [nombre], [empresa] ni texto fuera de los separadores. Máximo 2200 caracteres por caption.`
          }
        ]
      }],
      max_tokens: 1024
    };

    const response = await callGroq(payload);

    const raw = response.data.choices[0].message.content.replace(/\\#/g, '#');

    // Parsear las 3 opciones
    const parts = raw.split(/===OPCION_\d+===/);
    const captions = parts.map(p => p.trim()).filter(Boolean).slice(0, 3);
    // Fallback: si el modelo no respetó el formato, devolver el texto completo como única opción
    const captionList = captions.length >= 2 ? captions : [raw.trim()];

    // Guardar en historial con imagen en base64
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      caption: captionList[0],
      image: `data:${mimeType};base64,${base64}`,
      status: 'pending'
    };
    const historyList = await getHistory(tenant);
    historyList.unshift(entry);
    await saveHistory(tenant, historyList);

    res.json({ captions: captionList, id: entry.id, tones: tones.map(t => t.label) });
  } catch (err) {
    console.error('Error en /api/generate:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando caption', detail: err.message });
  }
});

// ─── API: Semana de contenido ────────────────────────────────────────────────
// Acepta hasta 5 imágenes en el campo "images". Si solo llega 1, se usa la
// misma foto para los 5 días (una única llamada a Groq, más rápido). Si llegan
// varias, cada día usa su propia foto (una llamada a Groq por día, en paralelo).
app.post('/api/generate-week', requireIdentity, demoLimitGuard, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No se recibio imagen' });

    const tenant = getTenant(req);
    const profile = await loadProfile(tenant);
    const module = getModule(profile.modulo);
    const angles = (module.calendarAngles && module.calendarAngles.length === 5)
      ? module.calendarAngles
      : getModule('generico').calendarAngles;

    if (req.files.length === 1) {
      const file = req.files[0];
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype;
      const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
      const complianceExtra = module.compliance ? module.compliance(profile) : '';
      const voiceCtx = await voiceContext(tenant);
      const angleBlocks = angles.map(a => `===${a.day}===\n[ángulo ${a.angle}]`).join('\n');

      const payload = {
        model: 'qwen/qwen3.6-27b',
        reasoning_effort: 'none',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            {
              type: 'text',
              text: `Eres un experto community manager de Instagram especializado en negocios hispanohablantes de cualquier sector.

${profileContext(profile)}${moduleExtra}${voiceCtx}Analiza la imagen y genera EXACTAMENTE 5 captions para publicar de lunes a viernes. Adapta cada ángulo al sector y tipo de negocio de la marca — los ángulos son universales pero el contenido debe sonar auténtico para ese sector concreto.

Formato OBLIGATORIO — respeta los separadores exactos:

${angleBlocks}

Cada caption: gancho que pare el scroll, 2-3 frases naturales para el sector, CTA específico, 5 hashtags del sector.
${complianceExtra}
NO pongas placeholders. NO incluyas texto fuera de los separadores. Máximo 1500 caracteres por caption.`
            }
          ]
        }],
        max_tokens: 2500
      };

      const response = await callGroq(payload);

      const raw = response.data.choices[0].message.content.replace(/\\#/g, '#');
      const dataUri = `data:${mimeType};base64,${base64}`;

      const week = angles.map(a => {
        const regex = new RegExp(`===${a.day}===([\\s\\S]*?)(?:===|$)`);
        const match = raw.match(regex);
        return { day: a.day, angle: a.label, caption: match ? match[1].trim() : '', image: dataUri };
      }).filter(d => d.caption);

      return res.json({ week });
    }

    // Varias fotos: una por día. Si hay menos de 5, se reparten en orden y se repiten.
    // Secuencial (no Promise.all): pedir las 5 imágenes a la vez satura el
    // límite de tokens-por-minuto de Groq en la cuenta actual. Una a una, con
    // el reintento automático de callGroq(), es más lento pero fiable.
    const week = [];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const file = req.files[i % req.files.length];
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype;
      const caption = await generateCaptionForAngle(base64, mimeType, profile, module, a, tenant);
      week.push({ day: a.day, angle: a.label, caption, image: `data:${mimeType};base64,${base64}` });
    }

    res.json({ week });
  } catch (err) {
    console.error('Error en /api/generate-week:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando semana', detail: err.message });
  }
});

// ─── API: Programar la semana para que se publique sola ────────────────────
// Recibe los 5 días (con caption e imagen ya en data URI — el frontend
// convierte cualquier imagen personalizada a base64 antes de mandarla, no
// vale un blob: URL local) más una fecha de inicio (el lunes) y una hora.
// Calcula la fecha/hora exacta de cada día y los deja en estado "scheduled".
// Un intervalo en segundo plano (ver runScheduler más abajo) los publica de
// verdad cuando llega su momento — no hace falta que nadie entre a la app.
// Los módulos (server/modules/*.js) usan el día en MAYÚSCULAS ("LUNES",
// "MIÉRCOLES"...) en el campo calendarAngles[].day — normalizamos a
// mayúsculas aquí también para no depender de que coincida el casing exacto.
const DAY_OFFSET = { 'LUNES': 0, 'MARTES': 1, 'MIÉRCOLES': 2, 'JUEVES': 3, 'VIERNES': 4 };

app.post('/api/schedule-week', requireIdentity, async (req, res) => {
  try {
    const { days, startDate, time } = req.body;
    if (!Array.isArray(days) || !days.length) return res.status(400).json({ error: 'Faltan los días de la semana' });
    if (!startDate || !time) return res.status(400).json({ error: 'Falta la fecha de inicio (lunes) o la hora' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'Formato de fecha/hora inválido' });
    }

    const [h, m] = time.split(':').map(Number);
    const posts = await loadScheduled(getTenant(req));
    const created = [];

    for (const d of days) {
      if (!d.image || !/^data:.+;base64,/.test(d.image)) {
        return res.status(400).json({ error: `Falta la imagen del ${d.day} en formato válido` });
      }
      const offset = DAY_OFFSET[String(d.day || '').toUpperCase()];
      if (offset === undefined) {
        return res.status(400).json({ error: `Día no reconocido: "${d.day}"` });
      }
      const scheduledFor = new Date(`${startDate}T00:00:00`);
      scheduledFor.setDate(scheduledFor.getDate() + offset);
      scheduledFor.setHours(h, m, 0, 0);

      const entry = {
        id: Date.now() + offset, // offset evita colisiones al crear los 5 casi a la vez
        day: d.day,
        angle: d.angle || '',
        caption: d.caption,
        image: d.image,
        scheduledFor: scheduledFor.toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };
      posts.push(entry);
      created.push(entry);
    }

    await saveScheduled(getTenant(req), posts);
    res.json({ success: true, created });
  } catch (err) {
    console.error('Error en /api/schedule-week:', err.message);
    res.status(500).json({ error: 'No se pudo programar la semana', detail: err.message });
  }
});

app.get('/api/scheduled', requireIdentity, async (req, res) => {
  const posts = await loadScheduled(getTenant(req));
  res.json(posts.slice().sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor)));
});

// ─── API: Regenerar el caption de un día concreto (semana) con otra imagen ──
app.post('/api/generate-day', requireIdentity, demoLimitGuard, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });
    const { day } = req.body;

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const tenant = getTenant(req);
    const profile = await loadProfile(tenant);
    const module = getModule(profile.modulo);
    const angles = (module.calendarAngles && module.calendarAngles.length === 5)
      ? module.calendarAngles
      : getModule('generico').calendarAngles;
    const angleDef = angles.find(a => a.day === day) || angles[0];

    const caption = await generateCaptionForAngle(base64, mimeType, profile, module, angleDef, tenant);
    res.json({ caption });
  } catch (err) {
    console.error('Error en /api/generate-day:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando caption del día', detail: err.message });
  }
});

// ─── API: Generar imagen con IA (alternativa a subir foto) ──────────────────
// El usuario describe brevemente qué quiere en la imagen; se combina con el
// estilo visual del módulo activo y el contexto de marca del perfil. Devuelve
// una imagen lista para usarse exactamente igual que una foto subida (el
// frontend la reinyecta en el mismo flujo de /api/generate o /api/generate-week).
app.post('/api/generate-image', requireIdentity, demoLimitGuard, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Falta describir qué imagen generar' });
    }

    const profile = await loadProfile(getTenant(req));
    const module = getModule(profile.modulo);
    const imageStyle = module.imageStyle || getModule('generico').imageStyle;

    const brand = [
      profile.nombre ? `Negocio: ${profile.nombre}` : '',
      profile.sector ? `Sector: ${profile.sector}` : '',
      profile.ciudad ? `Ubicación: ${profile.ciudad}` : '',
    ].filter(Boolean).join('. ');

    const prompt = `${imageStyle}. ${brand}. Escena: ${description.trim()}. Fotografía realista de alta calidad, formato cuadrado para publicación en Instagram, sin marcas de agua.`;

    const { base64, mimeType } = await generateImage(prompt);
    res.json({ image: `data:${mimeType};base64,${base64}` });
  } catch (err) {
    console.error('Error en /api/generate-image:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando imagen con IA', detail: err.message });
  }
});

// ─── API: Publicar en Instagram ──────────────────────────────────────────────
app.post('/api/publish', requireIdentity, async (req, res) => {
  const { id, caption, originalCaption, imageBase64 } = req.body;
  const tenant = getTenant(req);

  // Actualizar historial
  const historyList = await getHistory(tenant);
  const entry = historyList.find(h => h.id === id);
  // Fuente de la imagen real: preferimos la que el servidor guardó en /api/generate
  // (un data URI base64 fiable) en vez de la que manda el cliente en imageBase64,
  // que en el flujo actual del frontend es un blob: URL local del navegador —
  // válido para mostrar la imagen en pantalla, pero inútil aquí en el servidor.
  const sourceImage = entry?.image || imageBase64;

  if (entry) {
    entry.caption = caption;
    entry.status = 'publishing';
  }

  // Guardar par para aprendizaje de voz (solo si el usuario editó)
  let voiceExamples = 0;
  if (originalCaption && caption && originalCaption.trim() !== caption.trim()) {
    const voice = await loadVoice(tenant);
    voice.examples.push({ original: originalCaption.trim(), final: caption.trim(), date: new Date().toISOString() });
    await saveVoice(tenant, voice);
    voiceExamples = voice.examples.length;

    // Analizar patrones a partir de 3 ejemplos (en background, sin bloquear respuesta)
    if (voiceExamples >= 3) {
      analyzeVoice(voice.examples).then(async patterns => {
        const v = await loadVoice(tenant);
        v.patterns = patterns;
        v.lastAnalyzed = new Date().toISOString();
        await saveVoice(tenant, v);
        console.log(`Voz actualizada con ${voiceExamples} ejemplos`);
      }).catch(err => console.error('Error analizando voz:', err.message));
    }
  }

  try {
    let credentials = null;
    if (isDbConfigured && req.userId) {
      const account = await getInstagramAccount(req.userId);
      if (account?.instagram_access_token) {
        credentials = { accessToken: account.instagram_access_token, accountId: account.instagram_user_id };
      }
    }
    const result = await publishToMeta(sourceImage, caption, credentials);
    if (result.demo) {
      if (entry) entry.status = 'published_demo';
      await saveHistory(tenant, historyList);
      return res.json({ success: true, demo: true, voiceExamples, message: result.message + ' El caption se aprobó correctamente.' });
    }
    if (entry) entry.status = 'published';
    await saveHistory(tenant, historyList);
    res.json({ success: true, containerId: result.containerId });
  } catch (err) {
    if (entry) entry.status = 'error';
    await saveHistory(tenant, historyList);
    console.error('Error en /api/publish:', err.response?.data || err.message);
    const detail = err.response?.data?.error?.message || err.message;
    res.status(500).json({ error: 'Error publicando en Instagram', detail });
  }
});

// ─── API: Rechazar ───────────────────────────────────────────────────────────
app.post('/api/reject', requireIdentity, async (req, res) => {
  const { id } = req.body;
  const tenant = getTenant(req);
  const historyList = await getHistory(tenant);
  const entry = historyList.find(h => h.id === id);
  if (entry) entry.status = 'rejected';
  await saveHistory(tenant, historyList);
  res.json({ success: true });
});

// ─── API: Módulos verticales disponibles ────────────────────────────────────
app.get('/api/modules', (req, res) => res.json(listModules()));

// ─── API: Perfil de marca ────────────────────────────────────────────────────
app.get('/api/profile', requireIdentity, async (req, res) => res.json(await loadProfile(getTenant(req))));

app.post('/api/profile', requireIdentity, express.json(), async (req, res) => {
  try {
    await saveProfile(getTenant(req), req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el perfil' });
  }
});

// ─── API: Reseñas ────────────────────────────────────────────────────────────
const REVIEWS_PATH = path.join(__file, 'reviews.json');

async function loadReviews() {
  if (redis) {
    try {
      const data = await redis.get('reviews');
      if (data) return data;
    } catch (err) { console.error('Redis error (loadReviews), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8')); }
  catch { return []; }
}

async function saveReviews(reviews) {
  if (redis) {
    try { await redis.set('reviews', reviews); return; }
    catch (err) { console.error('Redis error (saveReviews), usando fallback local:', err.message); }
  }
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(reviews, null, 2), 'utf8');
}

// ─── Posts programados ("Semana completa" → publicación automática) ─────────
// Igual que profile/voice: sid presente (demo pública) -> solo en memoria de
// esa sesión; sid null (cliente real) -> Redis si hay credenciales, si no
// archivo local. Se guarda aparte del "history" normal (que es efímero, solo
// en memoria) para que un post programado sobreviva a un reinicio del server.
const SCHEDULED_PATH = path.join(__file, 'scheduled-posts.json');

async function loadScheduled(tenant) {
  if (tenant.type === 'demo') {
    if (!sessionScheduled.has(tenant.id)) sessionScheduled.set(tenant.id, []);
    return sessionScheduled.get(tenant.id);
  }
  if (tenant.type === 'user') {
    if (redis) {
      try {
        const data = await redis.get(`scheduled-posts:user:${tenant.id}`);
        if (data) return data;
      } catch (err) { console.error('Redis error (loadScheduled user), usando fallback local:', err.message); }
    }
    try { return JSON.parse(fs.readFileSync(userDataPath(tenant.id, 'scheduled-posts.json'), 'utf8')); }
    catch { return []; }
  }
  if (redis) {
    try {
      const data = await redis.get('scheduled-posts');
      if (data) return data;
    } catch (err) { console.error('Redis error (loadScheduled), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(SCHEDULED_PATH, 'utf8')); }
  catch { return []; }
}

async function saveScheduled(tenant, posts) {
  if (tenant.type === 'demo') { sessionScheduled.set(tenant.id, posts); return; }
  if (tenant.type === 'user') {
    if (redis) {
      try { await redis.set(`scheduled-posts:user:${tenant.id}`, posts); return; }
      catch (err) { console.error('Redis error (saveScheduled user), usando fallback local:', err.message); }
    }
    writeUserFile(tenant.id, 'scheduled-posts.json', posts);
    return;
  }
  if (redis) {
    try { await redis.set('scheduled-posts', posts); return; }
    catch (err) { console.error('Redis error (saveScheduled), usando fallback local:', err.message); }
  }
  fs.writeFileSync(SCHEDULED_PATH, JSON.stringify(posts, null, 2), 'utf8');
}

// Misma lógica que usaba /api/publish, extraída para poder reutilizarla desde
// el scheduler automático. Recibe un data URI (imagen), el caption, y
// opcionalmente { accessToken, accountId } de la cuenta de Instagram del
// usuario dueño del post (ver getInstagramAccount). Si no se pasan, cae en
// META_ACCESS_TOKEN/META_INSTAGRAM_ACCOUNT_ID del .env — el modo "cliente
// único" de siempre, con una sola cuenta compartida por todo el despliegue.
// Devuelve { demo: true } si no hay ninguna cuenta configurada, o
// { success: true, containerId } si publicó de verdad. Lanza si algo falla.
async function publishToMeta(sourceImage, caption, credentials) {
  const accessToken = credentials?.accessToken || process.env.META_ACCESS_TOKEN;
  const accountId = credentials?.accountId || process.env.META_INSTAGRAM_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    return { demo: true, message: 'Modo demo: no hay ninguna cuenta de Instagram conectada.' };
  }
  if (!process.env.PUBLIC_URL) {
    throw new Error('Falta PUBLIC_URL en .env — Meta exige una URL pública de la imagen para publicar (no acepta base64 ni funciona con localhost). Define PUBLIC_URL con la URL pública de tu despliegue.');
  }

  const match = /^data:(.+);base64,(.+)$/.exec(sourceImage || '');
  if (!match) throw new Error('No se encontró una imagen válida para publicar');
  const [, , data] = match;
  // Instagram solo acepta JPEG para publicar — convertimos siempre, sea cual
  // sea el origen (foto subida en PNG/WEBP, imagen generada por IA, etc.),
  // para no depender de que el formato de entrada ya sea compatible.
  const jpegBuffer = await sharp(Buffer.from(data, 'base64')).jpeg({ quality: 90 }).toBuffer();
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const filepath = path.join(TMP_UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, jpegBuffer);
  const imageUrl = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/tmp-uploads/${filename}`;

  // Usamos graph.instagram.com (no graph.facebook.com) porque las cuentas se
  // conectan vía "Instagram API with Instagram Login" — el flujo de Meta que
  // no requiere una Página de Facebook vinculada. El token (prefijo IGAA) y
  // el ID de cuenta (user_id de graph.instagram.com/me) son de ese flujo.
  const containerRes = await axios.post(
    `https://graph.instagram.com/v21.0/${accountId}/media`,
    { image_url: imageUrl, caption, access_token: accessToken }
  );
  const containerId = containerRes.data.id;

  // Instagram descarga la imagen de forma asíncrona tras crear el contenedor.
  // Si se llama a media_publish antes de que termine, Meta responde con
  // "Media ID is not available" aunque el contenedor exista. Hay que esperar
  // a que status_code pase a FINISHED (recomendación oficial de la Content
  // Publishing API) antes de publicar.
  for (let attempt = 0; ; attempt++) {
    const statusRes = await axios.get(`https://graph.instagram.com/v21.0/${containerId}`, {
      params: { fields: 'status_code,status', access_token: accessToken }
    });
    const { status_code, status } = statusRes.data;
    if (status_code === 'FINISHED') break;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new Error(`Instagram no pudo procesar la imagen (${status_code}): ${status || 'sin detalle'}`);
    }
    if (attempt >= 20) {
      throw new Error('Instagram tardó demasiado en procesar la imagen antes de publicar (timeout)');
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  await axios.post(
    `https://graph.instagram.com/v21.0/${accountId}/media_publish`,
    { creation_id: containerId, access_token: accessToken }
  );

  setTimeout(() => fs.unlink(filepath, () => {}), 5 * 60 * 1000);
  return { success: true, containerId };
}

app.get('/api/reviews', async (req, res) => res.json(await loadReviews()));

app.post('/api/reviews', async (req, res) => {
  const { name, role, text, rating } = req.body;
  if (!name?.trim() || !text?.trim()) return res.status(400).json({ error: 'Nombre y reseña son obligatorios' });
  const reviews = await loadReviews();
  const entry = {
    id: Date.now(),
    name: name.trim(),
    role: role?.trim() || '',
    text: text.trim(),
    rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
    date: new Date().toISOString()
  };
  reviews.unshift(entry);
  await saveReviews(reviews);
  res.json({ success: true, entry });
});

// ─── API: Solicitudes de prueba gratis (landing matriz.html) ────────────────
// No damos acceso automático a ninguna instancia real — cada solicitud queda
// guardada aquí para que Sara la revise y active la prueba a mano (mismo
// modelo manual que el piloto de la correduría), evitando que un desconocido
// entre en la instancia real de un cliente.
const TRIAL_REQUESTS_PATH = path.join(__file, 'trial-requests.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadTrialRequests() {
  if (redis) {
    try {
      const data = await redis.get('trial-requests');
      if (data) return data;
    } catch (err) { console.error('Redis error (loadTrialRequests), usando fallback local:', err.message); }
  }
  try { return JSON.parse(fs.readFileSync(TRIAL_REQUESTS_PATH, 'utf8')); }
  catch { return []; }
}

async function saveTrialRequests(requests) {
  if (redis) {
    try { await redis.set('trial-requests', requests); return; }
    catch (err) { console.error('Redis error (saveTrialRequests), usando fallback local:', err.message); }
  }
  fs.writeFileSync(TRIAL_REQUESTS_PATH, JSON.stringify(requests, null, 2), 'utf8');
}

// Si defines ADMIN_KEY, esta ruta pide ?key=... para no dejar los leads
// (nombre/email de quien pide la prueba gratis) visibles a cualquiera que
// entre a la URL — relevante sobre todo en una demo pública sin APP_PASSWORD.
// Sin ADMIN_KEY definida, queda abierta como hasta ahora (uso local).
app.get('/api/trial-requests', async (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (key && req.query.key !== key && req.headers['x-admin-key'] !== key) {
    return res.status(401).json({ error: 'Falta ?key=... (ADMIN_KEY) para ver los leads' });
  }
  res.json(await loadTrialRequests());
});

app.post('/api/trial-request', async (req, res) => {
  const { name, email, business, sector, message } = req.body;
  if (!name?.trim() || !email?.trim() || !sector?.trim()) {
    return res.status(400).json({ error: 'Nombre, email y sector son obligatorios' });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'El email no parece válido' });
  }
  const requests = await loadTrialRequests();
  const entry = {
    id: Date.now(),
    name: name.trim(),
    email: email.trim(),
    business: business?.trim() || '',
    sector: sector.trim(),
    message: message?.trim() || '',
    status: 'pending', // pending | activated | declined
    date: new Date().toISOString()
  };
  requests.unshift(entry);
  await saveTrialRequests(requests);
  notifyTrialRequest(entry); // en background, no bloquea la respuesta
  res.json({ success: true });
});

// ─── API: Mejor hora para publicar ──────────────────────────────────────────
app.post('/api/best-time', async (req, res) => {
  const { sector, caption } = req.body;
  try {
    const response = await callGroq({
      model: 'qwen/qwen3.6-27b',
      reasoning_effort: 'none',
      messages: [{
        role: 'user',
        content: `Eres un experto en estrategia de Instagram con datos de engagement por sector.

Sector del negocio: ${sector || 'negocio general'}
Primeras palabras del caption: "${(caption || '').slice(0, 120)}"

Basándote en patrones reales de engagement en Instagram para este sector, responde en este formato JSON exacto (sin markdown, sin explicación extra):
{
  "dias": ["Jueves", "Viernes"],
  "horas": "18:00 – 20:00",
  "razon": "Una frase corta explicando por qué ese momento funciona para este sector específico"
}`
      }],
      max_tokens: 200
    });

    const raw = response.data.choices[0].message.content.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch (err) {
    console.error('Error en /api/best-time:', err.message);
    res.status(500).json({ error: 'No se pudo calcular' });
  }
});

// ─── API: Voz aprendida ──────────────────────────────────────────────────────
app.get('/api/voice', requireIdentity, async (req, res) => {
  const { examples, patterns, lastAnalyzed } = await loadVoice(getTenant(req));
  res.json({ count: examples.length, patterns, lastAnalyzed });
});

// ─── API: Historial ──────────────────────────────────────────────────────────
app.get('/api/history', requireIdentity, async (req, res) => {
  const list = await getHistory(getTenant(req));
  res.json(list.map(h => ({
    id: h.id,
    date: h.date,
    caption: h.caption,
    status: h.status,
    image: h.image
  })));
});

// ─── Servir frontend en produccion ───────────────────────────────────────────
if (IS_PROD) {
  const distPath = path.join(__file, '..', 'dist');
  // La raíz del dominio abre la landing "matriz" (marketing, elige sector) en
  // vez de la app directamente — pensado para una demo pública compartible.
  // La app en sí sigue viva en /index.html (usada también por el botón
  // "Ver demo en vivo" de matriz.html).
  app.get('/', (req, res) => res.sendFile(path.join(distPath, 'matriz.html')));
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Red de seguridad: si algo falla al parsear el body (JSON roto, o más
// grande que el límite de arriba) Express por defecto devuelve una página de
// error en HTML, no JSON — y el frontend, que siempre espera JSON, revienta
// con un error confuso ("Unexpected token '<'") en vez de mostrar el problema
// real. Con esto, cualquier error de body-parser vuelve como JSON legible.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err instanceof SyntaxError)) {
    console.error('Error de body-parser:', err.message);
    return res.status(400).json({ error: 'Solicitud inválida o demasiado grande', detail: err.message });
  }
  next(err);
});

// ─── Scheduler: publica en Instagram los posts programados cuya hora llegó ──
// IMPORTANTE: esto solo funciona mientras este proceso Node siga corriendo.
// En local (npm run dev en el portátil de Sara) se para si cierra la terminal
// o el ordenador duerme — para que publique de verdad sola, sin que nadie
// toque nada, este server tiene que estar desplegado 24/7 (Hostinger, etc.).
let schedulerRunning = false;

async function publishDuePosts(tenant, posts) {
  const now = new Date();
  let changed = false;

  // Si son posts de un usuario registrado, publicar con SU cuenta de
  // Instagram conectada (no la global del .env) — una sola consulta por
  // tenant, reutilizada para todos sus posts vencidos en este tick.
  let credentials = null;
  if (tenant.type === 'user') {
    const account = await getInstagramAccount(tenant.id);
    if (account?.instagram_access_token) {
      credentials = { accessToken: account.instagram_access_token, accountId: account.instagram_user_id };
    }
  }

  for (const post of posts) {
    if (post.status !== 'scheduled') continue;
    if (new Date(post.scheduledFor) > now) continue;
    try {
      const result = await publishToMeta(post.image, post.caption, credentials);
      post.status = result.demo ? 'published_demo' : 'published';
      if (result.containerId) post.containerId = result.containerId;
      console.log(`✅ Post programado publicado (${post.day}, ${result.demo ? 'demo' : 'real'}): id ${post.id}`);
    } catch (err) {
      post.status = 'error';
      post.error = err.message;
      console.error(`❌ Error publicando post programado (${post.day}, id ${post.id}):`, err.message);
    }
    changed = true;
  }
  if (changed) await saveScheduled(tenant, posts);
}

async function runScheduler() {
  if (schedulerRunning) return; // evita solapes si una publicación tarda más de 1 minuto
  schedulerRunning = true;
  try {
    // Cliente único (modo legado, sin DATABASE_URL): posts compartidos.
    const shared = { type: 'shared' };
    await publishDuePosts(shared, await loadScheduled(shared));
    // Visitantes de la demo pública: cada uno tiene los suyos en memoria.
    for (const [sid, posts] of sessionScheduled.entries()) {
      await publishDuePosts({ type: 'demo', id: sid }, posts);
    }
    // Usuarios registrados (solo si DATABASE_URL está configurada): cada uno
    // tiene sus posts en Redis/archivo, namespaced por su id.
    if (isDbConfigured) {
      const userIds = await listUserIds();
      for (const id of userIds) {
        const tenant = { type: 'user', id };
        await publishDuePosts(tenant, await loadScheduled(tenant));
      }
    }
  } catch (err) {
    console.error('Error en runScheduler:', err.message);
  } finally {
    schedulerRunning = false;
  }
}

app.listen(PORT, () => {
  console.log(`AutoPost CM corriendo en http://localhost:${PORT}`);
  if (!IS_PROD) console.log(`Frontend dev: http://localhost:5173`);
  console.log(isDbConfigured
    ? 'Cuentas de usuario: ACTIVADAS (DATABASE_URL definido) — modo multi-tenant, APP_PASSWORD ignorado'
    : (process.env.APP_PASSWORD ? 'Autenticación: ACTIVADA (APP_PASSWORD definido, modo legado)' : 'Autenticación: desactivada (define APP_PASSWORD o DATABASE_URL para activarla)'));
  console.log(redis ? 'Persistencia: Upstash Redis (sobrevive a redeploys)' : 'Persistencia: archivos locales (define UPSTASH_REDIS_REST_URL/TOKEN para producción)');
  console.log((process.env.META_ACCESS_TOKEN && process.env.META_INSTAGRAM_ACCOUNT_ID) ? 'Publicación en Instagram: configurada' : 'Publicación en Instagram: modo demo (define META_ACCESS_TOKEN/META_INSTAGRAM_ACCOUNT_ID + PUBLIC_URL para publicar de verdad)');
  setInterval(runScheduler, 60 * 1000);
  runScheduler(); // primera pasada inmediata, no esperar 60s a arrancar
});
