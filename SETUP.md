# AutoPost CM — Guía de instalación

## Requisitos
- Node.js 18+
- Una GROQ_API_KEY (console.groq.com)

## Instalación local

```bash
# 1. Entra en la carpeta
cd autopost-cm

# 2. Instala dependencias
npm install

# 3. Crea tu archivo de variables de entorno
cp .env.example .env
# Edita .env y añade tu GROQ_API_KEY

# 4. Arranca en modo desarrollo
npm run dev
```

Abre http://localhost:5173 en el navegador.

## Instalar como app de escritorio (PWA)

1. Abre http://localhost:5173 en Chrome o Edge
2. En la barra de direcciones verás un icono de instalación (⊕ o pantalla con flecha)
3. Haz clic en "Instalar AutoPost CM"
4. La app se abre como ventana independiente sin barra del navegador

## Variables de entorno (.env)

| Variable | Descripción |
|----------|-------------|
| GROQ_API_KEY | API key de Groq (obligatoria) |
| META_ACCESS_TOKEN | Token de Meta Graph API (opcional, para publicar en Instagram) |
| META_INSTAGRAM_ACCOUNT_ID | ID de la cuenta de Instagram Business (opcional) |
| PUBLIC_URL | URL pública de tu despliegue (ej. Railway). Obligatoria si defines META_ACCESS_TOKEN — Meta exige descargar la imagen desde una URL pública, no funciona con localhost |
| PORT | Puerto del servidor (por defecto: 3001) |
| APP_PASSWORD | Contraseña de acceso a toda la app (opcional en local; recomendable en Railway SOLO si es un despliegue para un cliente real — no la definas en el despliegue de demo pública, porque bloquearía matriz.html) |
| ADMIN_KEY | Protege `GET /api/trial-requests` (los leads que piden prueba gratis desde matriz.html). Sin esto esa ruta queda abierta a quien tenga la URL. Consulta con `/api/trial-requests?key=TU_ADMIN_KEY` |
| DEMO_DAILY_LIMIT | SOLO para el despliegue de demo pública. Nº de generaciones gratis por IP y día (ej. `3`). Al agotarse, la app muestra un aviso con enlace a `/matriz.html` para pedir la prueba completa. No definir en un despliegue de cliente real — ahí debe ser ilimitado |
| POLLINATIONS_TOKEN | Token de Pollinations.AI (auth.pollinations.ai), opcional — "Generar imagen con IA" funciona sin esto (gratis, con marca de agua pequeña). Solo hace falta si quieres quitarla o subir el límite de peticiones |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | Recomendable en cualquier despliegue fuera de tu ordenador (Railway, Hostinger...). Sin esto, el perfil de marca, la voz aprendida, las reseñas y los leads se guardan en archivos locales que la mayoría de hostings borran en cada redeploy. Con esto definido, viven en Redis (upstash.com, plan Free gratuito) y sobreviven a los redeploys pase lo que pase con el disco del hosting. Sin esto, sigue funcionando igual en local |
| DATABASE_URL | Opcional — activa cuentas de usuario reales (ver sección "Cuentas de usuario" más abajo). Connection string de Postgres, recomendado neon.tech (plan Free) |
| JWT_SECRET | Obligatoria SOLO si defines DATABASE_URL — secreto para firmar las sesiones de los usuarios. Genera uno con `openssl rand -hex 32` |

Sin META_ACCESS_TOKEN, la app funciona en modo demo: genera captions pero no publica en Instagram. Si defines META_ACCESS_TOKEN, define también PUBLIC_URL o la publicación real fallará.

"Generar imagen con IA" es gratis de serie (Pollinations.AI, sin API key ni tarjeta) — no necesitas configurar nada para usarla.

Sin APP_PASSWORD, la app queda abierta a cualquiera que tenga la URL — bien para desarrollo local, mal para una URL pública. Al desplegar en Railway, define siempre APP_PASSWORD (a menos que actives DATABASE_URL, ver abajo).

## Cuentas de usuario (multi-tenant, opcional)

Por defecto la app funciona como "cliente único": todo el mundo que entra (con o sin APP_PASSWORD) ve y edita el mismo perfil/historial/programados. Si defines `DATABASE_URL`, la app cambia de modo: activa registro/login real (email + contraseña) y **cada usuario tiene su propio perfil de marca, voz aprendida, historial y posts programados, aislados de los demás**. `APP_PASSWORD` deja de usarse en ese momento — las rutas de datos exigen sesión iniciada (o cookie de demo pública, si `DEMO_DAILY_LIMIT` también está activa).

**Importante**: no definas `DATABASE_URL` en un despliegue de cliente único que ya está en marcha con `APP_PASSWORD` (ej. el piloto real) sin querer convertirlo en multi-tenant — dejaría de aceptar peticiones sin una cuenta.

Pasos para activarlo (recomendamos [neon.tech](https://neon.tech), plan Free, Postgres puro con autosuspend — funciona igual con Supabase u otro Postgres si lo prefieres):

1. Crea un proyecto en Neon y copia el connection string (botón "Connection string" del dashboard).
2. Pégalo en `.env` como `DATABASE_URL=...`.
3. Genera un secreto y ponlo en `JWT_SECRET` (ej. `openssl rand -hex 32`).
4. Ejecuta `npm run migrate` una vez — crea la tabla `users`.
5. Arranca la app normalmente (`npm run dev` / `npm start`). El log de arranque confirma "Cuentas de usuario: ACTIVADAS".

Nota: en el plan Free, Neon "duerme" tras un rato sin uso — la primera petición después de inactividad tarda ~1s más de lo normal mientras la base despierta. No es un fallo.

Esta fase solo mete `users` (email, contraseña hasheada, plan) en Postgres — el perfil, la voz, el historial y los programados de cada usuario siguen viviendo en Redis (o archivo local en `server/data/users/<id>/` si no hay Redis configurado), namespaced por su id, igual que hoy para el cliente único. Es una decisión consciente para esta fase: si el volumen de usuarios/posts lo justifica más adelante, esos datos pueden migrar a tablas relacionales.

Todavía no hay pantalla de login/registro en la app — se usa vía API (`POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`), pensada para probarse con curl/Postman mientras se construye la UI en una fase posterior.

## Deploy en la nube (Railway)

1. Crea cuenta en railway.app
2. Conecta tu repositorio de GitHub
3. Railway detecta automáticamente Node.js (hay un `railway.json` en el repo con el build/start command ya configurados, no hace falta tocarlos)
4. Añade las variables de entorno en el panel de Railway:
   - `GROQ_API_KEY` (obligatoria)
   - `ADMIN_KEY` (recomendable, protege los leads de `matriz.html`)
   - `APP_PASSWORD` **solo** si este despliegue es para un cliente concreto (no para la demo pública genérica — bloquearía matriz.html)
5. Deploy. Railway asigna una URL tipo `https://tuapp.up.railway.app`

Con `NODE_ENV=production` (Railway lo define solo), la raíz `/` sirve `matriz.html` (landing con los 3 verticales) y `/index.html` sirve la app en sí, precargada con un perfil de ejemplo (`server/profile.default.json`, ficticio — "KNT Tattoo") porque `server/profile.json` real nunca se sube a git. Así la demo no se ve vacía ni expone datos de ningún cliente real.

Si más adelante despliegas una instancia dedicada para un cliente real (ej. Objetiva Broker), usa `scripts/create-vertical-repo.js` para crear ese repo aparte, rellena su `profile.json` de verdad, y en ESE despliegue sí define `APP_PASSWORD`.

## Crear un repo dedicado para un vertical

Si quieres que un vertical (seguros / inmobiliaria / genérico) tenga su propio repositorio independiente en vez de vivir como módulo dentro de este mismo proyecto:

```bash
node scripts/create-vertical-repo.js seguros ../autopost-cm-seguros
```

Esto copia el núcleo del proyecto a la carpeta indicada, deja el vertical ya preseleccionado en `server/profile.json`, y limpia `voice.json`/`reviews.json` para que el repo nuevo no arrastre datos de otro cliente. El script imprime al final los pasos manuales para instalar dependencias y subirlo a su propio repo de GitHub — no toca git ni sube nada por su cuenta.
