import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { getModule, listModules } from './modules/index.js';
import { generateImage } from './services/imageGen.js';

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

function loadProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')); }
  catch {
    try { return JSON.parse(fs.readFileSync(DEFAULT_PROFILE_PATH, 'utf8')); }
    catch { return {}; }
  }
}

function loadVoice() {
  try { return JSON.parse(fs.readFileSync(VOICE_PATH, 'utf8')); }
  catch { return { examples: [], patterns: null }; }
}

function saveVoice(data) {
  fs.writeFileSync(VOICE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function analyzeVoice(examples) {
  const pairs = examples.map((e, i) =>
    `--- Par ${i + 1} ---\nOriginal IA:\n${e.original}\n\nEditado por el usuario:\n${e.final}`
  ).join('\n\n');

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: `Analiza estos ${examples.length} pares de captions de Instagram (versión IA vs versión editada por el usuario) e identifica los patrones de estilo y preferencias del usuario.

${pairs}

Responde SOLO con una lista numerada de 4-5 patrones concisos y específicos en español. Ejemplos de buenas respuestas: "Prefiere frases de máximo 10 palabras", "Siempre incluye el número de teléfono en el CTA", "Evita los signos de exclamación", "Usa tuteo informal". Sin introducción ni conclusión.`
      }],
      max_tokens: 300
    },
    { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );

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

function voiceContext() {
  const { patterns } = loadVoice();
  if (!patterns) return '';
  return `ESTILO APRENDIDO DEL USUARIO (respétalos estrictamente):\n${patterns}\n\n`;
}

// Genera UN caption para UNA imagen con UN ángulo concreto. La usan tanto
// /api/generate-day como /api/generate-week cuando hay varias fotos (una por día).
async function generateCaptionForAngle(base64, mimeType, profile, module, angleDef) {
  const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
  const complianceExtra = module.compliance ? module.compliance(profile) : '';

  const payload = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        {
          type: 'text',
          text: `Eres un experto community manager de Instagram especializado en negocios hispanohablantes de cualquier sector.

${profileContext(profile)}${moduleExtra}${voiceContext()}Analiza esta imagen y genera UN ÚNICO caption para Instagram con este ángulo: ${angleDef.angle}

Debe tener: primera línea con gancho que pare el scroll, 2-3 frases naturales que conecten la imagen con el negocio, llamada a la acción específica para el sector, y 5 hashtags relevantes.
${complianceExtra}
Responde SOLO con el caption final, sin explicaciones, sin comillas ni texto adicional. NO pongas placeholders. Máximo 1500 caracteres.`
        }
      ]
    }],
    max_tokens: 600
  };

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    payload,
    { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
  );

  return response.data.choices[0].message.content.replace(/\\#/g, '#').trim();
}

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
app.set('trust proxy', true); // necesario para leer la IP real detrás de Railway/Hostinger/etc.

// ─── Límite diario de la demo pública (opcional) ─────────────────────────────
// Si defines DEMO_DAILY_LIMIT (ej. "3"), cada IP solo puede generar ese número
// de captions/imágenes al día — pensado SOLO para el despliegue de demo pública
// abierta (sin login), para no dejar la cuota gratuita de Groq/Pollinations a
// merced de cualquiera. NO definir esta variable en un despliegue de cliente
// real (Objetiva Broker, etc.) — ahí el uso debe ser ilimitado.
const DEMO_DAILY_LIMIT = parseInt(process.env.DEMO_DAILY_LIMIT, 10) || 0;
const demoUsage = new Map(); // "ip|YYYY-MM-DD" -> nº de usos ese día

function demoLimitGuard(req, res, next) {
  if (!DEMO_DAILY_LIMIT) return next(); // sin límite configurado, comportamiento normal
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

// Historial en memoria (en produccion se podria usar SQLite)
const history = [];

// Multer — almacena en memoria para pasarlo a Groq como base64
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

app.use(cors());
app.use(express.json());
app.use('/tmp-uploads', express.static(TMP_UPLOADS_DIR));

// ─── Autenticación básica (opcional) ─────────────────────────────────────────
// Si defines APP_PASSWORD en el .env, toda la app (frontend + API) pide contraseña
// antes de dejar pasar nada. Pensado para desplegar una demo en Railway sin
// dejarla abierta a cualquiera que tenga la URL. Si no defines APP_PASSWORD,
// la app se comporta como hasta ahora (sin login) — útil para desarrollo local.
if (process.env.APP_PASSWORD) {
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

// ─── API: Generar caption con Groq Vision ────────────────────────────────────
app.post('/api/generate', demoLimitGuard, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const profile = loadProfile();
    const module = getModule(profile.modulo);
    const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
    const complianceExtra = module.compliance ? module.compliance(profile) : '';
    const tones = (module.tones && module.tones.length === 3) ? module.tones : getModule('generico').tones;
    const toneLines = tones.map((t, i) => `- Opción ${i + 1}: ${t.angle}`).join('\n');

    const payload = {
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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

${profileContext(profile)}${moduleExtra}${voiceContext()}Analiza la imagen y genera EXACTAMENTE 3 captions distintos listos para publicar en Instagram, en español. Adapta el lenguaje, tono y referencias al sector de la marca. Cada opción debe tener un enfoque diferente:
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

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      payload,
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

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
    history.unshift(entry);

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
app.post('/api/generate-week', demoLimitGuard, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No se recibio imagen' });

    const profile = loadProfile();
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
      const angleBlocks = angles.map(a => `===${a.day}===\n[ángulo ${a.angle}]`).join('\n');

      const payload = {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            {
              type: 'text',
              text: `Eres un experto community manager de Instagram especializado en negocios hispanohablantes de cualquier sector.

${profileContext(profile)}${moduleExtra}${voiceContext()}Analiza la imagen y genera EXACTAMENTE 5 captions para publicar de lunes a viernes. Adapta cada ángulo al sector y tipo de negocio de la marca — los ángulos son universales pero el contenido debe sonar auténtico para ese sector concreto.

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

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        payload,
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );

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
    const week = await Promise.all(angles.map(async (a, i) => {
      const file = req.files[i % req.files.length];
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype;
      const caption = await generateCaptionForAngle(base64, mimeType, profile, module, a);
      return { day: a.day, angle: a.label, caption, image: `data:${mimeType};base64,${base64}` };
    }));

    res.json({ week });
  } catch (err) {
    console.error('Error en /api/generate-week:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando semana', detail: err.message });
  }
});

// ─── API: Regenerar el caption de un día concreto (semana) con otra imagen ──
app.post('/api/generate-day', demoLimitGuard, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });
    const { day } = req.body;

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const profile = loadProfile();
    const module = getModule(profile.modulo);
    const angles = (module.calendarAngles && module.calendarAngles.length === 5)
      ? module.calendarAngles
      : getModule('generico').calendarAngles;
    const angleDef = angles.find(a => a.day === day) || angles[0];

    const caption = await generateCaptionForAngle(base64, mimeType, profile, module, angleDef);
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
app.post('/api/generate-image', demoLimitGuard, async (req, res) => {
  try {
    const { description } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Falta describir qué imagen generar' });
    }

    const profile = loadProfile();
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
app.post('/api/publish', async (req, res) => {
  const { id, caption, originalCaption, imageBase64 } = req.body;

  // Actualizar historial
  const entry = history.find(h => h.id === id);
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
    const voice = loadVoice();
    voice.examples.push({ original: originalCaption.trim(), final: caption.trim(), date: new Date().toISOString() });
    saveVoice(voice);
    voiceExamples = voice.examples.length;

    // Analizar patrones a partir de 3 ejemplos (en background, sin bloquear respuesta)
    if (voiceExamples >= 3) {
      analyzeVoice(voice.examples).then(patterns => {
        const v = loadVoice();
        v.patterns = patterns;
        v.lastAnalyzed = new Date().toISOString();
        saveVoice(v);
        console.log(`Voz actualizada con ${voiceExamples} ejemplos`);
      }).catch(err => console.error('Error analizando voz:', err.message));
    }
  }

  try {
    if (!process.env.META_ACCESS_TOKEN || !process.env.META_INSTAGRAM_ACCOUNT_ID) {
      if (entry) entry.status = 'published_demo';
      return res.json({
        success: true,
        demo: true,
        voiceExamples,
        message: 'Modo demo: Meta Graph API no configurada. El caption se aprobó correctamente.'
      });
    }

    if (!process.env.PUBLIC_URL) {
      throw new Error('Falta PUBLIC_URL en .env — Meta exige una URL pública de la imagen para publicar (no acepta base64 ni funciona con localhost). Define PUBLIC_URL con la URL pública de tu despliegue (ej. Railway).');
    }

    // Paso 0: Meta necesita descargar la imagen desde una URL pública, no la
    // acepta como base64. La escribimos a un archivo temporal servido de forma
    // estática y construimos su URL pública a partir de PUBLIC_URL.
    const match = /^data:(.+);base64,(.+)$/.exec(sourceImage || '');
    if (!match) throw new Error('No se encontró una imagen válida para publicar');
    const [, mime, data] = match;
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filepath = path.join(TMP_UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    const imageUrl = `${process.env.PUBLIC_URL.replace(/\/$/, '')}/tmp-uploads/${filename}`;

    // Paso 1: Subir imagen como contenedor
    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.META_INSTAGRAM_ACCOUNT_ID}/media`,
      {
        image_url: imageUrl,
        caption,
        access_token: process.env.META_ACCESS_TOKEN
      }
    );
    const containerId = containerRes.data.id;

    // Paso 2: Publicar contenedor
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.META_INSTAGRAM_ACCOUNT_ID}/media_publish`,
      { creation_id: containerId, access_token: process.env.META_ACCESS_TOKEN }
    );

    // Limpieza: Meta ya debería haber descargado la imagen a estas alturas;
    // le damos un margen prudencial antes de borrar el archivo temporal.
    setTimeout(() => fs.unlink(filepath, () => {}), 5 * 60 * 1000);

    if (entry) entry.status = 'published';
    res.json({ success: true, containerId });
  } catch (err) {
    if (entry) entry.status = 'error';
    console.error('Error en /api/publish:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error publicando en Instagram', detail: err.message });
  }
});

// ─── API: Rechazar ───────────────────────────────────────────────────────────
app.post('/api/reject', (req, res) => {
  const { id } = req.body;
  const entry = history.find(h => h.id === id);
  if (entry) entry.status = 'rejected';
  res.json({ success: true });
});

// ─── API: Módulos verticales disponibles ────────────────────────────────────
app.get('/api/modules', (req, res) => res.json(listModules()));

// ─── API: Perfil de marca ────────────────────────────────────────────────────
app.get('/api/profile', (req, res) => res.json(loadProfile()));

app.post('/api/profile', express.json(), (req, res) => {
  try {
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo guardar el perfil' });
  }
});

// ─── API: Reseñas ────────────────────────────────────────────────────────────
const REVIEWS_PATH = path.join(__file, 'reviews.json');

function loadReviews() {
  try { return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8')); }
  catch { return []; }
}

app.get('/api/reviews', (req, res) => res.json(loadReviews()));

app.post('/api/reviews', (req, res) => {
  const { name, role, text, rating } = req.body;
  if (!name?.trim() || !text?.trim()) return res.status(400).json({ error: 'Nombre y reseña son obligatorios' });
  const reviews = loadReviews();
  const entry = {
    id: Date.now(),
    name: name.trim(),
    role: role?.trim() || '',
    text: text.trim(),
    rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
    date: new Date().toISOString()
  };
  reviews.unshift(entry);
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(reviews, null, 2), 'utf8');
  res.json({ success: true, entry });
});

// ─── API: Solicitudes de prueba gratis (landing matriz.html) ────────────────
// No damos acceso automático a ninguna instancia real — cada solicitud queda
// guardada aquí para que Sara la revise y active la prueba a mano (mismo
// modelo manual que el piloto de la correduría), evitando que un desconocido
// entre en la instancia real de un cliente.
const TRIAL_REQUESTS_PATH = path.join(__file, 'trial-requests.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadTrialRequests() {
  try { return JSON.parse(fs.readFileSync(TRIAL_REQUESTS_PATH, 'utf8')); }
  catch { return []; }
}

// Si defines ADMIN_KEY, esta ruta pide ?key=... para no dejar los leads
// (nombre/email de quien pide la prueba gratis) visibles a cualquiera que
// entre a la URL — relevante sobre todo en una demo pública sin APP_PASSWORD.
// Sin ADMIN_KEY definida, queda abierta como hasta ahora (uso local).
app.get('/api/trial-requests', (req, res) => {
  const key = process.env.ADMIN_KEY;
  if (key && req.query.key !== key && req.headers['x-admin-key'] !== key) {
    return res.status(401).json({ error: 'Falta ?key=... (ADMIN_KEY) para ver los leads' });
  }
  res.json(loadTrialRequests());
});

app.post('/api/trial-request', (req, res) => {
  const { name, email, business, sector, message } = req.body;
  if (!name?.trim() || !email?.trim() || !sector?.trim()) {
    return res.status(400).json({ error: 'Nombre, email y sector son obligatorios' });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'El email no parece válido' });
  }
  const requests = loadTrialRequests();
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
  fs.writeFileSync(TRIAL_REQUESTS_PATH, JSON.stringify(requests, null, 2), 'utf8');
  res.json({ success: true });
});

// ─── API: Mejor hora para publicar ──────────────────────────────────────────
app.post('/api/best-time', async (req, res) => {
  const { sector, caption } = req.body;
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
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
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const raw = response.data.choices[0].message.content.trim();
    const json = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
    res.json(json);
  } catch (err) {
    console.error('Error en /api/best-time:', err.message);
    res.status(500).json({ error: 'No se pudo calcular' });
  }
});

// ─── API: Voz aprendida ──────────────────────────────────────────────────────
app.get('/api/voice', (req, res) => {
  const { examples, patterns, lastAnalyzed } = loadVoice();
  res.json({ count: examples.length, patterns, lastAnalyzed });
});

// ─── API: Historial ──────────────────────────────────────────────────────────
app.get('/api/history', (req, res) => {
  res.json(history.map(h => ({
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

app.listen(PORT, () => {
  console.log(`AutoPost CM corriendo en http://localhost:${PORT}`);
  if (!IS_PROD) console.log(`Frontend dev: http://localhost:5173`);
  console.log(process.env.APP_PASSWORD ? 'Autenticación: ACTIVADA (APP_PASSWORD definido)' : 'Autenticación: desactivada (define APP_PASSWORD para activarla)');
});
