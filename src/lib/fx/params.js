// Descriptores de parámetros reutilizables y utilidades para leer/normalizar valores.
export const P = {
  amount: { id: 'amount', label: 'Intensidad', min: 0, max: 100, def: 60, unit: '%' },
  speed: { id: 'speed', label: 'Velocidad', min: 10, max: 400, def: 100, unit: '%' },
  angle: { id: 'angle', label: 'Ángulo', min: 0, max: 360, def: 0, unit: '°' },
  size: { id: 'size', label: 'Tamaño', min: 5, max: 100, def: 50, unit: '%' },
  count: { id: 'count', label: 'Cantidad', min: 5, max: 100, def: 50, unit: '%' },
  freq: { id: 'freq', label: 'Frecuencia', min: 1, max: 100, def: 40, unit: '' },
  blur: { id: 'blur', label: 'Desenfoque', min: 0, max: 100, def: 40, unit: '%' },
  opacity: { id: 'opacity', label: 'Opacidad', min: 0, max: 100, def: 100, unit: '%' },
  color: { id: 'color', label: 'Color', type: 'color', def: '#ffffff' },
};
export const withDef = (p, def) => ({ ...p, def });
export const sel = (id, label, options, def) => ({ id, label, type: 'select', options, def });

export function hexToRgb(hex) {
  const h = String(hex || '#ffffff').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(f.slice(0, 2), 16) / 255, parseInt(f.slice(2, 4), 16) / 255, parseInt(f.slice(4, 6), 16) / 255];
}

/** Valores por defecto de los parámetros de un elemento. */
export function defaultParams(item) {
  const o = {};
  for (const d of item.params || []) o[d.id] = d.def;
  return o;
}

/** Completa y normaliza: amount → 0..1, speed → factor, color → [r,g,b]. Conserva el resto tal cual. */
export function normParams(item, raw) {
  const p = { ...defaultParams(item), ...(raw || {}) };
  const out = { ...p };
  out.amount = (p.amount ?? 60) / 100;
  out.speed = (p.speed ?? 100) / 100;
  out.rgb = hexToRgb(p.color);
  return out;
}
