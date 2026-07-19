// Flujo OAuth de "Instagram API with Instagram Login" — permite que cada
// usuario conecte SU PROPIA cuenta de Instagram desde dentro de la app, sin
// entrar nunca al panel de Meta. Requiere INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET
// (del mismo panel de Meta donde se generó el token manual) y PUBLIC_URL (Meta
// redirige ahí después de que el usuario autoriza).
import axios from 'axios';

export const isInstagramOAuthConfigured = !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);

export function getRedirectUri() {
  return `${(process.env.PUBLIC_URL || '').replace(/\/$/, '')}/api/instagram/callback`;
}

export function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

// code -> token corto (~1h)
async function exchangeCodeForShortToken(code) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
    code,
  });
  const res = await axios.post('https://api.instagram.com/oauth/access_token', form);
  return res.data; // { access_token, user_id }
}

// token corto -> token largo (60 días)
async function exchangeForLongLivedToken(shortToken) {
  const res = await axios.get('https://graph.instagram.com/access_token', {
    params: { grant_type: 'ig_exchange_token', client_secret: process.env.INSTAGRAM_APP_SECRET, access_token: shortToken }
  });
  return res.data; // { access_token, token_type, expires_in }
}

async function getInstagramProfile(token) {
  const res = await axios.get('https://graph.instagram.com/v21.0/me', {
    params: { fields: 'user_id,username', access_token: token }
  });
  return res.data; // { user_id, username }
}

// Hace los 3 pasos seguidos: code -> token corto -> token largo -> perfil.
// Devuelve todo lo necesario para guardar en la fila del usuario.
export async function completeInstagramLogin(code) {
  const shortLived = await exchangeCodeForShortToken(code);
  const longLived = await exchangeForLongLivedToken(shortLived.access_token);
  const profile = await getInstagramProfile(longLived.access_token);
  return {
    instagramUserId: profile.user_id,
    username: profile.username,
    accessToken: longLived.access_token,
    expiresAt: new Date(Date.now() + longLived.expires_in * 1000),
  };
}
