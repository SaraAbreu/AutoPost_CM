# Arquitectura

## Visión general

AutoPost CM es un monolito simple: un único proceso Node.js (`server/index.js`) sirve tanto la API como, en producción, el build estático del frontend. No hay microservicios, no hay colas de mensajes, no hay workers separados — todo corre en un solo proceso, incluido el programador de publicaciones (un `setInterval` de 60 segundos).

```
Navegador (React/Vite)
        │
        │ fetch /api/*
        ▼
Express (server/index.js)
        │
   ┌────┼─────────────┬──────────────┬─────────────────┐
   ▼    ▼             ▼              ▼                 ▼
 Groq  Pollinations  PostgreSQL    Redis           Meta Graph API
(IA de (IA de        (cuentas de   (perfil, voz,   (graph.instagram.com —
 texto/ imagen)       usuario)      historial,       publicar en Instagram)
 visión)                            programados)
```

## Frontend

React 18 + Vite, sin router de terceros — la navegación entre pantallas (`Upload`, `CaptionReview`, `History`, `Scheduled`, `Settings`, `WeekView`) se maneja con estado simple en `App.jsx` (`useState('upload' | 'review' | 'history' | ...)`), no con URLs.

- `src/context/AuthContext.jsx` — maneja la sesión del usuario (login, registro, logout, `useAuth()`), habla con `/api/auth/*`
- En desarrollo, Vite corre en el puerto 5173 y hace proxy de `/api/*` hacia el backend en el puerto 3001 (ver `vite.config.js`) — **importante**: el proxy solo cubre `/api`, no `/tmp-uploads` (ver [INSTAGRAM.md](INSTAGRAM.md))
- En producción (`NODE_ENV=production`), Express sirve directamente los archivos de `dist/` — no hace falta un servidor de frontend aparte

## Backend

Todo vive en `server/index.js`, con algunas piezas extraídas a módulos:

| Carpeta/archivo | Responsabilidad |
|---|---|
| `server/auth/jwt.js` | Firmar/verificar JWT de sesión de usuario |
| `server/auth/users.js` | Queries de PostgreSQL sobre la tabla `users` (crear, buscar, cuenta de Instagram) |
| `server/auth/instagram.js` | Intercambio de tokens OAuth con Instagram |
| `server/middleware/auth.js` | Decodifica la cookie de sesión en cada request, expone `req.userId` |
| `server/db.js` | Pool de conexión a PostgreSQL |
| `server/modules/*.js` | Un archivo por vertical de negocio (genérico, seguros, inmobiliaria) |
| `server/services/imageGen.js` | Llamada a Pollinations.AI para generar imágenes |
| `server/migrations/*.sql` | Cambios de esquema de la base de datos, aplicados con `npm run migrate` |

## Modelo de "tenant" (aislamiento de datos)

Cada request se clasifica en uno de tres tipos, calculado por `getTenant(req)` en `server/index.js`:

1. **`shared`** (modo legado, cliente único) — sin `DATABASE_URL` configurada. Todo el mundo que entra ve y edita el mismo perfil/historial/programados. Protegido opcionalmente por `APP_PASSWORD` (HTTP Basic Auth a nivel de toda la app).
2. **`demo`** — cuando `DEMO_DAILY_LIMIT` está activo (despliegue de demo pública). Cada visitante recibe una cookie anónima (`demo_sid`) y tiene su propio perfil/historial/voz **en memoria** (se pierde al reiniciar el proceso — aceptable para una demo).
3. **`user`** — cuando `DATABASE_URL` está configurada y la persona inició sesión. Cada usuario tiene sus propios datos, persistentes, namespaced por su `id` de PostgreSQL.

La prioridad al resolver el tenant es `user` > `demo` > `shared`: si alguien está logueado, sus datos ganan aunque conserve una cookie `demo_sid` vieja.

## Dónde vive cada dato

| Dato | `DATABASE_URL` activa | Sin `DATABASE_URL` |
|---|---|---|
| Cuenta (email, contraseña, plan) | Tabla `users` en PostgreSQL | No existen cuentas — modo `shared` |
| Token de Instagram por usuario | Columnas `instagram_*` en `users` | — |
| Perfil de marca, voz aprendida, historial, programados | Redis namespaced (`profile:user:<id>`, etc.) si hay Upstash configurado; si no, `server/data/users/<id>/*.json` | Redis (`profile`, `voice`, etc. sin namespace) si hay Upstash; si no, `server/*.json` en la raíz de `server/` |
| Imagen temporal para que Meta la descargue al publicar | `server/tmp-uploads/*` (disco local, se autoborra a los 5 minutos) | igual |

Este diseño es deliberado: **`users` es la única tabla relacional** porque solo la cuenta necesita garantías fuertes (unicidad de email, por ejemplo). El resto de los datos (perfil, historial...) vive en Redis como documentos sueltos porque no hay relaciones complejas entre ellos — si el volumen lo justifica en el futuro, pueden migrar a tablas propias.

## El programador de publicaciones

`runScheduler()` corre cada 60 segundos (`setInterval`) mientras el proceso Node esté vivo. En cada tick recorre:

1. Los posts programados del tenant `shared` (modo cliente único)
2. Los de cada sesión de demo activa en memoria
3. Los de cada usuario registrado en PostgreSQL (`listUserIds()`)

Para cada post con `status: 'scheduled'` cuya `scheduledFor` ya pasó, llama a `publishToMeta()` con las credenciales de Instagram correspondientes a su dueño (ver [INSTAGRAM.md](INSTAGRAM.md)).

**Limitación importante**: esto solo funciona mientras el proceso Node siga corriendo. En local, se detiene si cerrás la terminal o el ordenador entra en suspensión. Para que publique sola de verdad, sin que nadie toque nada, el backend tiene que estar desplegado 24/7 (ver [DESPLIEGUE.md](DESPLIEGUE.md)).
