import generico from './generico.js';
import seguros from './seguros.js';
import inmobiliaria from './inmobiliaria.js';

export const MODULES = { generico, seguros, inmobiliaria };

export function getModule(id) {
  return MODULES[id] || MODULES.generico;
}

// Versión "segura" para exponer al frontend: sin las funciones (promptExtra/compliance),
// solo lo que la UI necesita para pintar el selector y los campos extra.
export function listModules() {
  return Object.values(MODULES).map(({ id, label, extraFields }) => ({ id, label, extraFields }));
}
