// Servicio de generación de imágenes con IA — Pollinations.AI.
// Gratis, sin API key ni cuenta (tier anónimo: ~1 petición cada 15s, de sobra
// para uso manual). Las imágenes anónimas llevan una pequeña marca de agua;
// si algún día hace falta quitarla o subir el límite, se puede registrar gratis
// en auth.pollinations.ai y poner el token en POLLINATIONS_TOKEN (.env) — pero
// no es necesario para empezar a usar la función.
import axios from 'axios';

export async function generateImage(prompt, { width = 1024, height = 1024 } = {}) {
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    model: 'flux',
    nologo: process.env.POLLINATIONS_TOKEN ? 'true' : 'false',
  });

  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

  const headers = {};
  if (process.env.POLLINATIONS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.POLLINATIONS_TOKEN}`;
  }

  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    headers,
    timeout: 60000,
  });

  const base64 = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type'] || 'image/jpeg';

  return { base64, mimeType };
}
