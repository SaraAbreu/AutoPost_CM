// Módulo INMOBILIARIA.
export default {
  id: 'inmobiliaria',
  label: 'Inmobiliaria',

  extraFields: [
    { name: 'tipoOperacion', label: 'Operación principal', placeholder: 'Ej: Venta, Alquiler o ambas' },
    { name: 'zona',          label: 'Zona/s de actuación', placeholder: 'Ej: Chamberí, Salamanca' },
    { name: 'numAgencia',    label: 'Nº de registro de agencia (si aplica)', placeholder: 'Ej: RAI-1234' },
  ],

  promptExtra: (p) => `INSTRUCCIONES ESPECÍFICAS DEL SECTOR INMOBILIARIO (respétalas siempre):
- No garantices precios, financiación ni plazos de venta/alquiler concretos — usa "precio orientativo" o "consulta condiciones" cuando hables de cifras.
- Vende la experiencia y el estilo de vida de la propiedad, no solo metros cuadrados y características técnicas.
- El CTA debe invitar a "agendar una visita", "pedir una tasación gratuita" o "solicitar más información" — nunca a "compra ya".
${p?.tipoOperacion ? `- Esta agencia se dedica principalmente a: ${p.tipoOperacion}` : ''}
${p?.zona ? `- Zona/s de actuación: ${p.zona}` : ''}

`,

  compliance: (p) => `Añade siempre, como línea final del caption y separada del resto por un salto de línea, este aviso breve:
"Precio y condiciones orientativos, sujetos a verificación."${p?.numAgencia ? ` Si el caption promociona una propiedad concreta, puedes mencionar el nº de registro de la agencia (${p.numAgencia}).` : ''}
`,

  tones: [
    { label: '🏡 Estilo de vida', angle: 'vende la experiencia de vivir en esa propiedad, la emoción y el estilo de vida, no solo metros y características técnicas' },
    { label: '🔍 Informativo',    angle: 'destaca datos objetivos de la propiedad y la zona de forma clara y atractiva' },
    { label: '📅 Acción',         angle: 'invita a agendar una visita o pedir más información, con un CTA claro' },
  ],

  calendarAngles: [
    { day: 'LUNES',     label: '🏗️ Proceso',    angle: 'PROCESO: cómo se prepara una vivienda para la venta o alquiler, el trabajo detrás de una publicación (home staging, fotos, papeleo)' },
    { day: 'MARTES',    label: '🔑 Resultado',   angle: 'RESULTADO: una operación cerrada con éxito (anonimizada) o un antes/después de una propiedad' },
    { day: 'MIÉRCOLES', label: '🤝 Humanización', angle: 'HISTORIA: el equipo de la agencia, por qué se dedican a esto, un momento cercano con un cliente' },
    { day: 'JUEVES',    label: '🏠 Propiedad',   angle: 'OFERTA: destaca una propiedad concreta con CTA a agendar visita, sin prometer precio ni condiciones de financiación' },
    { day: 'VIERNES',   label: '💬 Comunidad',   angle: 'COMUNIDAD: pregunta o consejo sobre el mercado local, invita a comentar o preguntar dudas sobre comprar/alquilar' },
  ],
};
