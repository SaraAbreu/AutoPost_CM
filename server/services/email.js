// Aviso por email cuando alguien pide su mes gratis desde matriz.html. Usa
// Resend (resend.com) — no bloquea la respuesta al usuario si falla o si no
// está configurado (RESEND_API_KEY/TRIAL_NOTIFY_EMAIL ausentes = no hace nada).
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function notifyTrialRequest(entry) {
  if (!resend || !process.env.TRIAL_NOTIFY_EMAIL) return;
  try {
    await resend.emails.send({
      from: 'AutoPost CM <onboarding@resend.dev>',
      to: process.env.TRIAL_NOTIFY_EMAIL,
      subject: `Nueva solicitud de prueba — ${entry.name} (${entry.sector})`,
      html: `
        <h2>Nueva solicitud de prueba gratis</h2>
        <p><b>Nombre:</b> ${entry.name}</p>
        <p><b>Email:</b> ${entry.email}</p>
        <p><b>Negocio:</b> ${entry.business || '(no indicado)'}</p>
        <p><b>Sector:</b> ${entry.sector}</p>
        <p><b>Mensaje:</b> ${entry.message || '(sin mensaje)'}</p>
      `,
    });
  } catch (err) {
    console.error('Error enviando aviso de trial-request por email:', err.message);
  }
}
