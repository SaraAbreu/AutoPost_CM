# Despliegue

Para que el programador de publicaciones funcione de verdad (publique solo, sin que nadie tenga la app abierta) y para que la publicación en Instagram funcione (necesita una URL pública, no `localhost`), el backend tiene que estar desplegado 24/7 en algún hosting.

## Opción A — Railway (recomendado si tenés plan pago)

Es la opción que ya trae configurada el repo (`railway.json`), documentada paso a paso en [SETUP.md](../SETUP.md#deploy-en-la-nube-railway). Resumen:

1. Conectá el repo de GitHub en [railway.app](https://railway.app)
2. Railway detecta Node.js automáticamente y usa `railway.json` (build: `npm run build`, start: `npm start`)
3. Definís las variables de entorno en el panel (las mismas que en tu `.env` local)
4. Railway te da una URL fija (`https://tuapp.up.railway.app`) — esa va en `PUBLIC_URL`

**Nota**: el plan de prueba gratuita de Railway es limitado en el tiempo — pasado ese período, hace falta pasar a un plan pago (Hobby, con tarjeta) para seguir usándolo.

## Opción B — Render.com (capa gratuita)

Buena alternativa si no querés pagar todavía. Como AutoPost CM ya guarda todos sus datos "de verdad" en PostgreSQL (Neon) y Redis (Upstash) — no en archivos locales —, el disco efímero de Render (se borra en cada reinicio) no es un problema.

**Limitación a tener en cuenta**: en el plan free, Render "duerme" el servicio tras 15 minutos sin tráfico HTTP. Mientras duerme, el programador de publicaciones también se detiene — los posts programados no se pierden, pero pueden publicarse tarde (en cuanto alguien vuelve a visitar la app y la despierta). Se puede mitigar con un servicio gratuito de ping periódico como [UptimeRobot](https://uptimerobot.com) (cada 5 minutos) para mantenerlo despierto.

Pasos:

1. Cuenta en [render.com](https://render.com) (podés usar GitHub)
2. "New +" → "Web Service" → conectar el repo
3. Build Command: `npm run build` — Start Command: `npm start` — Plan: Free
4. Variables de entorno: las mismas que en `.env` local
5. Render da una URL fija (`https://tuapp.onrender.com`) — va en `PUBLIC_URL`

## Variables de entorno en producción

Ver la tabla completa en [SETUP.md](../SETUP.md#variables-de-entorno-env). Como mínimo, para un despliegue multi-tenant con publicación real en Instagram:

```
GROQ_API_KEY=
DATABASE_URL=
JWT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PUBLIC_URL=              # la URL fija que te da el hosting
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

`APP_PASSWORD` y `META_ACCESS_TOKEN`/`META_INSTAGRAM_ACCOUNT_ID` globales no hacen falta en un despliegue multi-tenant — quedan reservados para el modo "cliente único" (ver [INSTAGRAM.md](INSTAGRAM.md)).

## Después de cada despliegue nuevo

1. Correr `npm run migrate` una vez contra la base de datos de producción (crea/actualiza las tablas)
2. Actualizar la "URI de redireccionamiento de OAuth" en el panel de Meta for Developers a `{tu URL de producción}/api/instagram/callback`
3. Verificar en los logs de arranque que diga "Cuentas de usuario: ACTIVADAS" y "Publicación en Instagram: configurada"

## Repo dedicado por cliente

Si en vez de multi-tenant querés un despliegue aparte para un cliente concreto (una sola cuenta, `APP_PASSWORD` en vez de login), usá `node scripts/create-vertical-repo.js <vertical> <carpeta-destino>` — copia el núcleo del proyecto a un repo independiente. Ver [SETUP.md](../SETUP.md#crear-un-repo-dedicado-para-un-vertical).
