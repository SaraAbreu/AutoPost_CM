# Historial del proyecto

Evolución de AutoPost CM de punta a punta, basada en el historial real de commits.

## 2026-06-25 — v1

Primera versión funcional: subir una foto, generar un caption con IA, revisarlo y publicarlo en Instagram. La base de todo lo que vino después.

## 2026-07-10 — Semana de contenido + arquitectura modular

Se agrega el modo "Semana completa" (5 captions de una vez, uno por día) y se introduce la arquitectura de **verticales** (`server/modules/`): genérico, seguros e inmobiliaria, cada uno con su propio prompt, campos de perfil y calendario de contenido. Antes de esto la app solo sabía generar un caption genérico, sin adaptarse al sector del negocio.

## 2026-07-18 — Demo pública

Una seguidilla de cambios el mismo día para poder abrir una demo pública sin arriesgar los datos de un cliente real:
- Landing `matriz.html` como página raíz, con los 3 verticales presentados
- Límite diario de generaciones gratis por IP (`DEMO_DAILY_LIMIT`), para no agotar la cuota de Groq/Pollinations
- Aislamiento de sesión por visitante (cookie anónima `demo_sid`) — cada quien prueba con su propio perfil/historial, sin pisar lo que está probando otra persona
- Migración de la persistencia a Redis (Upstash) para que los datos sobrevivan a los redeploys, en vez de vivir solo en archivos locales que algunos hostings borran
- Se corrige el modelo de Groq (el anterior había sido retirado) y se filtra el bloque `<think>` que algunos modelos de razonamiento devuelven mezclado con la respuesta

## 2026-07-19 — Programación automática

Se agrega el programador en segundo plano: una vez generada la semana completa, se puede dejar programada para que se publique sola a la hora elegida, sin que nadie tenga que volver a entrar a la app. Nueva pantalla "Programados" para ver la cola.

## 2026-07-19 — Cuentas de usuario, rediseño visual y conexión de Instagram por usuario

El cambio más grande hasta ahora, con tres frentes en paralelo:

**Cuentas de usuario multi-tenant**: registro/login real con email y contraseña (JWT + PostgreSQL), reemplazando el `APP_PASSWORD` único compartido. Cada usuario pasa a tener su perfil, voz aprendida, historial y programados completamente aislados. Se agregó también un modo "probar gratis sin cuenta" para no forzar el registro antes de que alguien pruebe la herramienta.

**Rediseño visual completo**: nueva estética de vidrio esmerilado (glassmorphism) en toda la app, con navegación adaptada específicamente a móvil — la barra de navegación se convierte en una barra inferior fija tipo app nativa por debajo de los 640px de ancho.

**Publicación real en Instagram, por fin funcionando**: se detectaron y corrigieron tres problemas que impedían publicar de verdad — falta de `PUBLIC_URL` (Meta no puede descargar la imagen desde `localhost`), un token de acceso inválido, y el uso del endpoint equivocado (`graph.facebook.com`, el flujo clásico vía Página de Facebook, en vez de `graph.instagram.com`, el flujo real que usa esta cuenta: "Instagram API with Instagram Login"). A partir de acá, además, cada usuario puede conectar **su propia** cuenta de Instagram desde Configuración, en vez de depender de una única cuenta compartida — ver [INSTAGRAM.md](INSTAGRAM.md) para el detalle técnico completo.

## Qué sigue (pendiente, sin fecha)

- Renovación automática del token de Instagram antes de que expire (hoy son 60 días, se renueva a mano)
- Arreglar el manejo de errores de `/api/history` cuando un invitado sin cuenta entra a esa pantalla con `DATABASE_URL` activa
- Selector de idioma (i18n) — hoy la app es 100% en castellano, pensado para poder agregar otros idiomas más adelante
- Despliegue estable en producción (Railway de pago o Render con capa gratuita) — hoy solo se probó con un túnel temporal
