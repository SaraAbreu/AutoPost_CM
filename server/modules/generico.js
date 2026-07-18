// Módulo GENÉRICO — comportamiento por defecto, válido para cualquier negocio.
// Sirve también de plantilla: cada módulo nuevo debe exportar la misma forma.
export default {
  id: 'generico',
  label: 'Genérico (cualquier negocio)',

  // Campos extra que se piden en Settings además de los básicos (nombre, sector, ciudad...)
  extraFields: [],

  // Texto que se inyecta en el prompt de generación, después del contexto de marca.
  // Recibe el profile.json completo por si el módulo necesita algún campo extra suyo.
  promptExtra: () => '',

  // Aviso/disclaimer que el modelo debe añadir al caption. Vacío = no aplica.
  compliance: () => '',

  // Estilo visual sugerido cuando se genera la imagen con IA (en vez de subir foto).
  imageStyle: 'fotografía profesional de un negocio local, luz natural, composición limpia y realista, sin texto ni logos superpuestos',

  // Los 3 enfoques para el modo "caption único" (deben ser exactamente 3).
  tones: [
    { label: '✨ Inspiracional', angle: 'emocional/inspiracional — conecta con los valores o el sentimiento que transmite la imagen' },
    { label: '💬 Cercano',       angle: 'cercano/conversacional — habla directamente a la audiencia como si fuera un amigo del sector' },
    { label: '🎯 Comercial',     angle: 'directo/acción — enfocado en generar una reacción concreta (reserva, contacto, visita)' },
  ],

  // Ángulos para el modo "semana completa" (deben ser exactamente 5, lunes a viernes).
  calendarAngles: [
    { day: 'LUNES',     label: '🎓 Educativo',    angle: 'PROCESO: muestra cómo se hace, el trabajo detrás, el detalle que otros no ven' },
    { day: 'MARTES',    label: '✨ Inspiracional', angle: 'RESULTADO: el antes/después, el orgullo del trabajo terminado, la transformación' },
    { day: 'MIÉRCOLES', label: '🤝 Humanización', angle: 'HISTORIA: la persona detrás del negocio, un momento real, algo personal' },
    { day: 'JUEVES',    label: '🎯 Producto',     angle: 'OFERTA: presenta un servicio o trabajo concreto con CTA directo' },
    { day: 'VIERNES',   label: '💬 Engagement',   angle: 'COMUNIDAD: pregunta, debate, invita a participar, genera conversación' },
  ],
};
