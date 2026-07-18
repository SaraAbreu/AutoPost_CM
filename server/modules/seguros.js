// Módulo CORREDURÍAS DE SEGUROS — nicho prioritario.
export default {
  id: 'seguros',
  label: 'Correduría de seguros',

  extraFields: [
    { name: 'numColegiado', label: 'Nº de colegiado / registro DGSFP', placeholder: 'Ej: J-1234' },
    { name: 'tiposPoliza',  label: 'Tipos de póliza que ofreces', placeholder: 'Ej: Hogar, Auto, Vida, Salud, Decesos' },
  ],

  promptExtra: (p) => `INSTRUCCIONES ESPECÍFICAS DEL SECTOR SEGUROS (respétalas siempre):
- No prometas coberturas, indemnizaciones ni ahorros concretos sin matizar que están "sujetos a condiciones de la póliza".
- Transmite confianza y cercanía: eres un asesor que acompaña, no un vendedor agresivo.
- Si el caption habla de un producto, explica el riesgo que cubre en términos sencillos, sin jerga técnica de seguros.
- El CTA debe invitar a "revisar tu póliza", "pedir presupuesto sin compromiso" o "resolver dudas" — nunca a "contratar ya" o a comparar precios con la competencia.
${p?.tiposPoliza ? `- Pólizas que ofrece esta correduría: ${p.tiposPoliza}` : ''}

`,

  compliance: (p) => `Añade siempre, como línea final del caption y separada del resto por un salto de línea, este aviso breve:
"Información orientativa, sujeta a condiciones particulares de la póliza."${p?.numColegiado ? ` Si el caption promociona un producto concreto (no en contenido educativo ni de comunidad), puedes mencionar que es mediador de seguros colegiado (${p.numColegiado}).` : ''}
`,

  // Estilo visual sugerido cuando se genera la imagen con IA (en vez de subir foto).
  imageStyle: 'fotografía profesional de una oficina de seguros o un asesor atendiendo a un cliente, ambiente cálido y de confianza, realista, sin texto ni logos superpuestos',

  tones: [
    { label: '🛡️ Confianza',  angle: 'transmite seguridad y tranquilidad — conecta con la preocupación real que resuelve el seguro (proteger a la familia, el hogar, el coche)' },
    { label: '📘 Educativo',  angle: 'explica de forma sencilla qué cubre o por qué importa, sin tecnicismos, como si se lo explicaras a un amigo' },
    { label: '📞 Acción',     angle: 'invita a pedir presupuesto o revisar la póliza actual, con un CTA claro y sin presión de venta agresiva' },
  ],

  calendarAngles: [
    { day: 'LUNES',     label: '📘 Educativo',    angle: 'EDUCATIVO: explica una cobertura o concepto de seguros de forma sencilla y sin jerga — algo que la gente probablemente no sabe que su póliza puede cubrir' },
    { day: 'MARTES',    label: '✅ Caso resuelto', angle: 'CASO RESUELTO: un siniestro o gestión resuelta con éxito (anonimizado), transmite tranquilidad y confianza en el servicio de la correduría' },
    { day: 'MIÉRCOLES', label: '🤝 Humanización', angle: 'HISTORIA: el equipo detrás de la correduría, por qué se dedican a esto, un momento cercano con un cliente' },
    { day: 'JUEVES',    label: '🎯 Producto',     angle: 'OFERTA: destaca un tipo de póliza con CTA a pedir presupuesto o revisión gratuita, sin prometer precios ni coberturas concretas' },
    { day: 'VIERNES',   label: '💬 Comunidad',    angle: 'COMUNIDAD: pregunta tipo "¿sabías que tu seguro de hogar puede cubrir X?" — invita a comentar o preguntar dudas' },
  ],
};
