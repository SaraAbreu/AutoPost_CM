# Conexión con Instagram

## Qué API usa

AutoPost CM publica usando **"Instagram API with Instagram Login"**, el flujo actual de Meta que permite conectar directamente una cuenta profesional de Instagram (Business o Creator) **sin necesidad de vincularla a una Página de Facebook**. Todas las llamadas de publicación van contra `graph.instagram.com` (no `graph.facebook.com`, que es el flujo clásico y más viejo, pensado para cuentas gestionadas a través de una Página).

Esto es importante tenerlo claro porque en el panel de Meta for Developers hay dos productos parecidos ("Instagram Graph API" clásico vs. "Instagram" / Instagram API with Instagram Login) y usan endpoints, tokens y pasos de configuración distintos.

## Dos modos de funcionamiento

### Modo cliente único (una sola cuenta para toda la app)

Variables de entorno: `META_ACCESS_TOKEN` + `META_INSTAGRAM_ACCOUNT_ID`. Todo el que use la app publica con esa única cuenta — pensado para un despliegue dedicado a un solo negocio.

### Modo multi-tenant (cada usuario, su propia cuenta) — recomendado

Con `DATABASE_URL` activa, cada usuario conecta su propia cuenta de Instagram desde **Configuración → "Conectar mi Instagram"**, sin tener que entrar nunca al panel de Meta. El token de cada usuario se guarda en su fila de la tabla `users` (columnas `instagram_access_token`, `instagram_user_id`, `instagram_username`, `instagram_token_expires_at` — ver `server/migrations/002_instagram_accounts.sql`).

Al publicar (`/api/publish`) o cuando el programador publica un post vencido, `publishToMeta()` usa la cuenta del usuario dueño del post si existe una conectada; si no, cae al `META_ACCESS_TOKEN`/`META_INSTAGRAM_ACCOUNT_ID` global como respaldo (útil en local, o como cuenta "de sistema" mientras un usuario todavía no conectó la suya).

## El flujo OAuth paso a paso (modo multi-tenant)

Implementado en `server/auth/instagram.js` + las rutas `/api/instagram/*` de `server/index.js`.

1. El usuario hace clic en "Conectar mi Instagram" → `GET /api/instagram/connect`
2. El backend genera un `state` aleatorio (protección CSRF), lo guarda en una cookie de corta duración, y redirige a `https://www.instagram.com/oauth/authorize` con los permisos `instagram_business_basic` y `instagram_business_content_publish`
3. El usuario autoriza en la pantalla de Instagram
4. Instagram redirige de vuelta a `GET /api/instagram/callback` con un `code`
5. El backend verifica que el `state` coincide (contra la cookie) y que hay una sesión de usuario válida (cookie `auth_token`)
6. Intercambia el `code` por un **token corto** (~1 hora) → lo cambia por un **token largo** (60 días) → consulta `graph.instagram.com/v21.0/me` para obtener el `user_id` y `username` reales
7. Guarda todo en la fila del usuario (`saveInstagramAccount`) y redirige de vuelta a la app (`/?instagram_connected=1`)

## Variables de entorno necesarias

| Variable | Para qué |
|---|---|
| `INSTAGRAM_APP_ID` | ID de la app de Instagram (panel de Meta → tu app → Instagram → "Configuración de la API con inicio de sesión de Instagram") |
| `INSTAGRAM_APP_SECRET` | Secreto de esa misma app — **nunca se expone al frontend** |
| `PUBLIC_URL` | Necesaria para dos cosas: (a) construir la URL de redirección del OAuth (`{PUBLIC_URL}/api/instagram/callback`, que también hay que agregar a mano en "URIs de redireccionamiento de OAuth válidos" en el panel de Meta), y (b) porque Meta exige descargar la imagen del post desde una URL pública para publicarla — no acepta base64 ni funciona con `localhost` |

## Cuentas de prueba mientras la app está en "modo desarrollo"

Mientras la app de Meta no pase por revisión (App Review), **solo pueden conectar su Instagram las cuentas que agregues a mano** como "Evaluador de Instagram" en el panel de Meta (Roles de la app → Roles → Añadir personas). Cada persona agregada tiene que aceptar la invitación desde su propia app de Instagram (Configuración → Aplicaciones y sitios web → Invitaciones de prueba) antes de poder autorizar la conexión.

Esto es suficiente para un grupo chico y conocido de testers. Para que cualquier persona pueda conectar su cuenta sin que la agregues a mano, Meta exige pasar por su proceso de revisión de la app — más lento, con requisitos como política de privacidad pública y demo en vídeo del flujo.

## Renovación del token

Los tokens largos duran 60 días. Meta ofrece un endpoint de refresh (`graph.instagram.com/refresh_access_token`) que hay que llamar periódicamente antes de que expiren — **esto todavía no está automatizado** en el código (queda como mejora pendiente, ver `instagram_token_expires_at` que ya se guarda para poder implementarlo). Para un grupo de prueba chico, alcanza con volver a conectar la cuenta manualmente cada ~50 días.

## Pruebas locales: el problema de `localhost`

Como Meta necesita una URL pública para descargar la imagen, no se puede probar la publicación real desde `npm run dev` sin exponer el backend de alguna forma. Durante el desarrollo se usó un túnel de [Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) (`npx cloudflared tunnel --url http://localhost:3001`), que da una URL pública temporal para usar como `PUBLIC_URL` mientras se prueba. Cada vez que se reinicia el túnel cambia la URL, así que hay que actualizar `PUBLIC_URL` (y la URL de redirección en el panel de Meta) cada vez. Para algo estable, ver [DESPLIEGUE.md](DESPLIEGUE.md).
