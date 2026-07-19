# AutoPost CM

Automatización de publicaciones en Instagram con IA — de la foto al feed, con un humano revisando en el medio.

## Qué es

AutoPost CM es una aplicación web pensada para negocios locales (seguros, inmobiliarias, y cualquier otro rubro) que quieren mantener Instagram activo sin dedicarle horas todas las semanas. El flujo es simple:

1. **Subís una foto** (o generás una con IA) del negocio, un producto, un momento del día a día
2. **La IA analiza la imagen** y escribe 1 o varios captions adaptados a tu marca, tu sector y tu tono de comunicación
3. **Vos revisás y aprobás** — podés editar el texto antes de publicar, o pedir otras versiones
4. **Se publica en Instagram**, en el momento o programado para más adelante

No hay ningún bot de Telegram ni nada parecido: todo pasa por esta interfaz web.

## Funcionalidades principales

- **Generación de captions con IA de visión** ([Groq](https://console.groq.com), modelo `qwen/qwen3.6-27b`) — 3 variantes con distinto enfoque (inspiracional, cercano, comercial) para un caption único
- **Generación de imágenes con IA** (Pollinations.AI) cuando no tenés una foto a mano
- **Revisión humana obligatoria** antes de publicar — nada sale a Instagram sin que alguien lo apruebe
- **Publicación real en Instagram**, cada usuario con su propia cuenta conectada (ver [docs/INSTAGRAM.md](docs/INSTAGRAM.md))
- **"Semana completa"**: generá los 5 posts de lunes a viernes de una sola vez, cada uno con su propio ángulo de contenido
- **Programación automática**: dejá la semana programada y un proceso en segundo plano la publica sola a la hora que definiste
- **Voz aprendida**: la IA analiza tus ediciones a los captions y va afinando su estilo para sonar cada vez más como vos
- **Historial** de todo lo publicado, rechazado o programado
- **Arquitectura por verticales**: seguros, inmobiliaria y genérico, cada uno con su propio prompt, campos de perfil y calendario de contenido — fácil de extender a un sector nuevo
- **Cuentas de usuario multi-tenant**: cada persona que se registra tiene su perfil de marca, historial, programados y cuenta de Instagram completamente aislados de los demás
- **Landing pública con demo limitada** (`matriz.html`) para captar leads que quieran probar la herramienta

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Express (Node.js), un solo proceso monolito |
| IA de visión / texto | Groq (`qwen/qwen3.6-27b`) |
| IA de imagen | Pollinations.AI |
| Publicación | Meta — Instagram API with Instagram Login |
| Base de datos | PostgreSQL (cuentas de usuario) — recomendado [Neon](https://neon.tech) |
| Datos de contenido | Redis (perfil, voz, historial, programados) — recomendado [Upstash](https://upstash.com) |

## Puesta en marcha

Para instalar, configurar variables de entorno y desplegar, mirá **[SETUP.md](SETUP.md)** — tiene la guía paso a paso completa.

## Documentación

La carpeta **[docs/](docs/)** tiene la documentación técnica completa del proyecto:

- **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)** — cómo está armado por dentro: estructura de carpetas, modelo de datos, aislamiento multi-tenant
- **[docs/FUNCIONALIDADES.md](docs/FUNCIONALIDADES.md)** — cada funcionalidad explicada en detalle
- **[docs/API.md](docs/API.md)** — referencia de todos los endpoints del backend
- **[docs/INSTAGRAM.md](docs/INSTAGRAM.md)** — cómo funciona la conexión con Instagram, paso a paso
- **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)** — cómo llevar la app a producción (Railway, Render)
- **[docs/HISTORIAL.md](docs/HISTORIAL.md)** — evolución del proyecto, de v1 hasta hoy

## Estructura del proyecto

```
autopost-cm/
├── src/                    # Frontend React
│   ├── components/         # Pantallas: Upload, CaptionReview, History, Scheduled, Settings, WeekView, AuthScreen
│   └── context/             # AuthContext (sesión de usuario)
├── server/
│   ├── index.js            # Backend Express — todas las rutas de la API
│   ├── auth/                # JWT, usuarios, conexión OAuth con Instagram
│   ├── middleware/           # Autenticación de requests
│   ├── modules/              # Verticales: genérico, seguros, inmobiliaria
│   ├── services/             # Generación de imágenes (Pollinations)
│   └── migrations/           # SQL de la base de datos
├── public/                 # Landing (matriz.html), PWA
├── scripts/                # Utilidades (migrar DB, crear repo por vertical)
└── docs/                   # Documentación técnica (ver arriba)
```
