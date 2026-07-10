import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { getModule, listModules } from './modules/index.js';

const __file = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__file, 'profile.json');
const VOICE_PATH   = path.join(__file, 'voice.json');

function loadProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8')); }
  catch { return {}; }
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

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// Historial en memoria (en produccion se podria usar SQLite)
const history = [];

// Multer — almacena en memoria para pasarlo a Groq como base64
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

app.use(cors());
app.use(express.json());

// ─── API: Generar caption con Groq Vision ────────────────────────────────────
app.post('/api/generate', upload.single('image'), async (req, res) => {
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
app.post('/api/generate-week', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibio imagen' });

    const base64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const profile = loadProfile();
    const module = getModule(profile.modulo);
    const moduleExtra = module.promptExtra ? module.promptExtra(profile) : '';
    const complianceExtra = module.compliance ? module.compliance(profile) : '';
    const angles = (module.calendarAngles && module.calendarAngles.length === 5)
      ? module.calendarAngles
      : getModule('generico').calendarAngles;
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

    const week = angles.map(a => {
      const regex = new RegExp(`===${a.day}===([\\s\\S]*?)(?:===|$)`);
      const match = raw.match(regex);
      return {
        day: a.day,
        angle: a.label,
        caption: match ? match[1].trim() : ''
      };
    }).filter(d => d.caption);

    res.json({ week, image: `data:${mimeType};base64,${base64}` });
  } catch (err) {
    console.error('Error en /api/generate-week:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando semana', detail: err.message });
  }
});

// ─── API: Publicar en Instagram ──────────────────────────────────────────────
app.post('/api/publish', async (req, res) => {
  const { id, caption, originalCaption, imageBase64, mimeType } = req.body;

  // Actualizar historial
  const entry = history.find(h => h.id === id);
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

    // Paso 1: Subir imagen como contenedor
    const imageUrl = imageBase64; // En produccion deberia ser una URL publica
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
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`AutoPost CM corriendo en http://localhost:${PORT}`);
  if (!IS_PROD) console.log(`Frontend dev: http://localhost:5173`);
});
