# Funcionalidades

## 1. Generación de caption único

Pantalla "Nueva publicación" → "Caption único". Subís una foto (o vídeo — se extrae un fotograma) o generás una imagen con IA, y el backend (`POST /api/generate`) manda la imagen a Groq Vision junto con el contexto de marca (nombre, sector, ciudad, tono, CTA, hashtags propios) y el módulo del vertical activo.

Devuelve **3 variantes** con enfoques distintos, definidos por el módulo (ver `server/modules/*.js`):
- ✨ Inspiracional — conecta con los valores/sentimiento de la imagen
- 💬 Cercano — tono conversacional, como hablarle a un amigo
- 🎯 Comercial — orientado a generar una acción concreta (reserva, contacto, visita)

Elegís una, la editás si querés, y pasás a revisión.

## 2. Generación de imagen con IA

Alternativa a subir una foto: describís brevemente qué querés que aparezca ("asesor atendiendo a un cliente en la oficina, ambiente cálido") y Pollinations.AI genera una imagen combinando esa descripción con el estilo visual del módulo activo y el contexto de marca. Gratis, sin API key — con una marca de agua pequeña salvo que configures `POLLINATIONS_TOKEN`.

## 3. Revisión humana

Antes de publicar, siempre hay una pantalla de revisión (`CaptionReview.jsx`) con:
- Un mockup realista de cómo se va a ver el post en Instagram
- El caption en un editor de texto libre
- Contador de caracteres (límite de 2200 de Instagram)
- Sugerencia de "mejor momento para publicar" (`POST /api/best-time`, calculado por IA en base al sector)
- Botones **Aprobar y publicar** / **Rechazar**

Si editás el caption antes de aprobar, ese par (original de la IA vs. tu versión final) se guarda para el aprendizaje de voz (punto 6).

## 4. Publicación en Instagram

Al aprobar, `POST /api/publish` llama a `publishToMeta()`, que sube la imagen a `graph.instagram.com` usando la cuenta de Instagram conectada del usuario. Ver **[INSTAGRAM.md](INSTAGRAM.md)** para el detalle completo de cómo funciona la conexión.

Sin ninguna cuenta de Instagram conectada, la app sigue funcionando en **modo demo**: genera y aprueba captions normalmente, pero no publica nada de verdad (útil para probar el resto del flujo sin credenciales).

## 5. Semana completa

Pantalla "Nueva publicación" → "Semana completa". Subís hasta 5 fotos (una por cada día de lunes a viernes) y `POST /api/generate-week` genera un caption por día, cada uno con un ángulo de contenido distinto definido por el módulo:

| Día | Ángulo (módulo genérico) |
|---|---|
| Lunes | 🎓 Educativo — el proceso, el trabajo detrás |
| Martes | ✨ Inspiracional — el resultado, el antes/después |
| Miércoles | 🤝 Humanización — la persona detrás del negocio |
| Jueves | 🎯 Producto — una oferta concreta con CTA |
| Viernes | 💬 Engagement — pregunta, invita a la conversación |

Si subís menos de 5 fotos, se reparten en orden y se repiten para completar la semana. Si subís solo 1, el modelo genera los 5 captions en una sola llamada (más rápido); con varias fotos distintas, genera **una por una, en secuencia** — es una decisión deliberada para no saturar el límite de tokens-por-minuto de la cuenta de Groq, a costa de ser más lento.

Desde la vista de semana (`WeekView.jsx`) podés reemplazar la imagen de un día puntual, regenerar su caption, copiarlo, o programar toda la semana de una vez.

## 6. Voz aprendida

Cada vez que editás un caption antes de aprobarlo, se guarda el par (versión de la IA / versión final tuya). A partir de 3 pares guardados, la IA analiza esos ejemplos (`analyzeVoice()`) y extrae 4-5 patrones de estilo concretos (ej. "Prefiere frases de máximo 10 palabras", "Siempre incluye el teléfono en el CTA"). Esos patrones se inyectan en el prompt de todas las generaciones futuras, así que el caption que propone la IA se va pareciendo cada vez más a tu forma de escribir.

Se puede ver el estado ("Voz aprendida") desde Configuración.

## 7. Programación automática

Desde "Semana completa" → "Programar semana", elegís el lunes de inicio y la hora de publicación, y los 5 posts quedan guardados con `status: 'scheduled'` y su `scheduledFor` calculado. El programador en segundo plano (ver [ARQUITECTURA.md](ARQUITECTURA.md#el-programador-de-publicaciones)) los publica solos cuando llega su momento, sin que nadie tenga que entrar a la app.

La pantalla "Programados" muestra la cola completa con su estado (`Programado` / `Publicado` / `Error al publicar`).

## 8. Historial

Cada publicación (aprobada o rechazada) queda registrada con su imagen, caption final y fecha. Se puede consultar desde "Historial", con detalle al hacer clic en cada entrada.

## 9. Arquitectura por verticales

Cada negocio elige un "módulo" desde Configuración (`server/modules/generico.js`, `seguros.js`, `inmobiliaria.js`). Cada módulo define:
- Campos extra de perfil específicos del sector
- Texto adicional que se inyecta en el prompt de generación
- Disclaimers de compliance obligatorios (relevante sobre todo para seguros)
- Estilo visual sugerido para la generación de imágenes
- Los 3 tonos del "caption único" y los 5 ángulos de la "semana completa"

Agregar un vertical nuevo es crear un archivo más en `server/modules/` con esa misma forma y registrarlo en `server/modules/index.js` — no requiere tocar el resto del backend.

## 10. Cuentas de usuario (multi-tenant)

Con `DATABASE_URL` configurada, la app pasa de "cliente único" a multi-tenant real: cualquiera puede registrarse (`AuthScreen.jsx`) con email y contraseña, y cada cuenta tiene su propio perfil de marca, voz aprendida, historial, programados y conexión de Instagram, completamente aislados de los demás usuarios. Ver [ARQUITECTURA.md](ARQUITECTURA.md#modelo-de-tenant-aislamiento-de-datos).

También existe un modo **"probar gratis sin cuenta"** (invitado) que usa el dataset compartido (`shared`) sin necesidad de registrarse — pensado para que alguien pruebe la herramienta rápido antes de comprometerse a crear una cuenta.

## 11. Landing pública y captura de leads

`public/matriz.html` es una landing con los 3 verticales, reseñas, y un formulario de "prueba gratis" que guarda el lead (`POST /api/trial-request`) para que se revise y active la prueba a mano — no se da acceso automático a ninguna instancia real. En despliegues configurados como demo pública (`DEMO_DAILY_LIMIT` definido), esta landing es la página raíz (`/`).
