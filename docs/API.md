# Referencia de API

Todas las rutas viven en `server/index.js`. "Requiere sesión" significa que pasan por el middleware `requireIdentity` — solo bloquea de verdad cuando `DATABASE_URL` está configurada (modo multi-tenant); en modo cliente único no exige login (usa `APP_PASSWORD` a nivel de toda la app en su lugar, si está definido).

## Autenticación

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | No | Crea una cuenta (email + contraseña, mínimo 8 caracteres). Solo si `DATABASE_URL` está activa |
| POST | `/api/auth/login` | No | Inicia sesión. Limitado a 10 intentos cada 15 min por IP |
| POST | `/api/auth/logout` | No | Borra la cookie de sesión |
| GET | `/api/auth/me` | Sí | Devuelve `{ email, plan }` del usuario logueado |

## Conexión con Instagram (por usuario)

Ver [INSTAGRAM.md](INSTAGRAM.md) para el flujo completo.

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| GET | `/api/instagram/status` | Sí | `{ connected, username }` — si el usuario tiene una cuenta de Instagram conectada |
| GET | `/api/instagram/connect` | Sí | Redirige a Instagram para autorizar la conexión (inicia el flujo OAuth) |
| GET | `/api/instagram/callback` | — | Instagram redirige acá tras la autorización. No lo llama el frontend directamente |
| POST | `/api/instagram/disconnect` | Sí | Desconecta la cuenta de Instagram del usuario |

## Generación de contenido

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `/api/generate` | Sí | Sube una imagen (`multipart/form-data`, campo `image`) → devuelve 3 variantes de caption |
| POST | `/api/generate-week` | Sí | Sube hasta 5 imágenes (`images[]`) → devuelve un caption por día (lunes a viernes) |
| POST | `/api/generate-day` | Sí | Regenera el caption de un día concreto de la semana, con otra imagen |
| POST | `/api/generate-image` | Sí | `{ description }` → genera una imagen con IA (Pollinations) en base al texto y al perfil de marca |

Las cuatro rutas de generación pasan también por `demoLimitGuard` — si el despliegue tiene `DEMO_DAILY_LIMIT` configurado, cuentan contra el límite diario por IP.

## Publicación

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `/api/publish` | Sí | `{ id, caption, originalCaption, imageBase64 }` → aprueba y publica en Instagram (o modo demo si no hay cuenta conectada) |
| POST | `/api/reject` | Sí | `{ id }` → marca el post como rechazado, no se publica |
| POST | `/api/best-time` | No | `{ sector, caption }` → sugerencia de mejor día/hora para publicar, generada por IA |

## Programación

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| POST | `/api/schedule-week` | Sí | `{ days, startDate, time }` → programa los 5 posts de una semana generada |
| GET | `/api/scheduled` | Sí | Lista los posts programados/publicados del tenant actual, ordenados por fecha |

## Perfil, voz e historial

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| GET | `/api/profile` | Sí | Perfil de marca actual |
| POST | `/api/profile` | Sí | Guarda el perfil de marca (nombre, sector, ciudad, tono, CTA, hashtags, módulo, campos extra del vertical) |
| GET | `/api/voice` | Sí | `{ examples, patterns, lastAnalyzed }` — estado de la voz aprendida |
| GET | `/api/history` | Sí | Historial de publicaciones (aprobadas o rechazadas) |
| GET | `/api/modules` | No | Lista los verticales disponibles (genérico, seguros, inmobiliaria) para el selector de Configuración |

## Landing pública (`matriz.html`)

| Método | Ruta | Sesión | Descripción |
|---|---|---|---|
| GET | `/api/reviews` | No | Lista de reseñas para mostrar en la landing |
| POST | `/api/reviews` | No | `{ name, role, text, rating }` → agrega una reseña |
| GET | `/api/trial-requests` | Protegido por `ADMIN_KEY` (query `?key=` o header `x-admin-key`) | Lista de leads que pidieron la prueba gratis |
| POST | `/api/trial-request` | No | `{ name, email, business, sector, message }` → registra un lead de "prueba gratis" |

## Notas generales

- Todas las respuestas de error siguen el formato `{ error: "mensaje", detail?: "..." }`
- Las rutas marcadas "Sí" en modo cliente único (sin `DATABASE_URL`) **no bloquean nada** — `requireIdentity` es un no-op en ese modo. La protección de acceso, si existe, es `APP_PASSWORD` a nivel de toda la app
- `demoLimitGuard` y la cookie `demo_sid` solo actúan si `DEMO_DAILY_LIMIT` está configurada (despliegue de demo pública)
