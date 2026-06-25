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
| PORT | Puerto del servidor (por defecto: 3001) |

Sin META_ACCESS_TOKEN, la app funciona en modo demo: genera captions pero no publica en Instagram.

## Deploy en la nube (Railway)

1. Crea cuenta en railway.app
2. Conecta tu repositorio de GitHub
3. Railway detecta automáticamente Node.js
4. Añade las variables de entorno en el panel de Railway
5. Ejecuta `npm run build` como build command y `npm start` como start command

La URL de Railway sirve tanto el frontend como la API.
