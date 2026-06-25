import express from 'express';
import cors from 'cors';
import multer from 'multer';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

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
            text: `Eres community manager experto en Instagram para pymes hispanohablantes.

${profileContext(loadProfile())}${voiceContext()}Analiza la imagen y genera EXACTAMENTE 3 captions distintos listos para publicar en Instagram, en español. Cada uno debe tener un tono diferente: el primero inspiracional, el segundo cercano/conversacional, el tercero directo/comercial.

Formato OBLIGATORIO — respeta los separadores exactos:

===OPCION_1===
[caption completo]
===OPCION_2===
[caption completo]
===OPCION_3===
[caption completo]

Cada caption debe tener:
- Primera línea: frase gancho impactante
- 2-3 frases conectando la imagen con un producto o servicio
- Llamada a la acción clara
- 5 hashtags relevantes al final

NO incluyas descripciones, explicaciones ni texto fuera de los separadores. Máximo 2200 caracteres por caption.`
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

    res.json({ captions: captionList, id: entry.id });
  } catch (err) {
    console.error('Error en /api/generate:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error generando caption', detail: err.message });
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
