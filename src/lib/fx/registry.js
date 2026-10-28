// Catálogo modular de efectos de video, filtros de color y transiciones.
// Cada elemento: { id, kind, cat, label, params, build(p, ctx) } donde build devuelve la cadena de pasadas GPU.
// Para registrar uno nuevo basta con llamar a `register({...})`.
import { P, sel, withDef } from './params.js';

export const ITEMS = [];
export const BY_ID = new Map();
export function register(it) {
  if (BY_ID.has(it.kind + ':' + it.id)) return;
  const item = { tags: [], params: [P.amount], ...it };
  ITEMS.push(item);
  BY_ID.set(item.kind + ':' + item.id, item);
  return item;
}
export const getItem = (kind, id) => BY_ID.get(kind + ':' + id) ?? null;

const U = (p, extra = {}) => ({ uAmt: p.amount, uSpd: p.speed, ...extra });
const pass = (k, u, more = {}) => ({ k, u, ...more });

// ====================================================================== EFECTOS
export const FX_CATS = [
  { id: 'retro', label: 'Retro' },
  { id: 'luz', label: 'Luz' },
  { id: 'distorsion', label: 'Distorsión' },
  { id: 'glitch', label: 'Glitch y color' },
  { id: 'camara', label: 'Cámara' },
  { id: 'espejo', label: 'Espejos' },
  { id: 'clima', label: 'Atmósfera' },
  { id: 'estilo', label: 'Estilo' },
];
const fx = (id, cat, label, params, build, tags = []) => register({ kind: 'fx', id, cat, label, params, build, tags });
const AMT = (def = 60) => withDef(P.amount, def);

// ---- Retro
const retroU = (p, o) => U(p, { uScan: 0, uJit: 0, uBleed: 0, uNoise: 0, uTrack: 0, uCurve: 0, uVig: 0, uTone: 1, uFlick: 0, ...o });
fx('vhs', 'retro', 'VHS', [AMT(70), P.speed], (p) => [pass('retro', retroU(p, { uScan: 0.7, uJit: 1, uBleed: 1.6, uNoise: 0.7, uTrack: 1, uVig: 0.4, uTone: 0.8, uFlick: 0.5 }))], ['cinta', 'video']);
fx('oldfilm', 'retro', 'Película antigua', [AMT(80), P.speed], (p) => [pass('film', U(p, { uGrain: 1, uScratch: 1, uDust: 1, uFlick: 1, uSepia: 0.85, uVigf: 0.8, uWeave: 1 }))], ['película', 'sepia']);
fx('filmgrain', 'retro', 'Grano de película', [AMT(60), withDef(P.speed, 100)], (p) => [pass('film', U(p, { uGrain: 1.6, uScratch: 0, uDust: 0, uFlick: 0, uSepia: 0, uVigf: 0, uWeave: 0 }))], ['grano']);
fx('scratches', 'retro', 'Rayones de película', [AMT(70), P.speed], (p) => [pass('film', U(p, { uGrain: 0.2, uScratch: 1.6, uDust: 1.4, uFlick: 0.4, uSepia: 0, uVigf: 0, uWeave: 0.3 }))], ['polvo']);
fx('scanlines', 'retro', 'Líneas de escaneo', [AMT(70), P.speed], (p) => [pass('retro', retroU(p, { uScan: 1.3, uVig: 0.2 }))], ['crt', 'scanlines']);
fx('analognoise', 'retro', 'Ruido analógico', [AMT(65), P.speed], (p) => [pass('retro', retroU(p, { uNoise: 1.6, uJit: 0.3, uScan: 0.2 }))], ['ruido', 'estática']);
fx('oldcamera', 'retro', 'Cámara antigua', [AMT(75), P.speed], (p) => [pass('film', U(p, { uGrain: 0.9, uScratch: 0.4, uDust: 0.6, uFlick: 1.4, uSepia: 0.55, uVigf: 1.2, uWeave: 1.6 }))], ['cámara', 'vintage']);
fx('damagedtape', 'retro', 'Cinta dañada', [AMT(85), P.speed], (p) => [pass('retro', retroU(p, { uScan: 0.5, uJit: 2.4, uBleed: 2.6, uNoise: 1.2, uTrack: 3, uVig: 0.5, uTone: 0.6, uFlick: 1 }))], ['vhs', 'glitch']);
fx('style80', 'retro', 'Estética años 80', [AMT(70), P.speed], (p) => [
  pass('grade', gradeU(p, { uSat: 1.5, uCon: 1.1, uBri: 0.0, uSh: [0.08, 0, 0.12], uHi: [0.1, 0.02, 0.06], uTemp: -0.2 })),
  pass('retro', retroU(p, { uScan: 0.6, uBleed: 1.6, uNoise: 0.3, uVig: 0.3 })),
], ['neón', 'synthwave']);
fx('style90', 'retro', 'Estética años 90', [AMT(70), P.speed], (p) => [
  pass('grade', gradeU(p, { uSat: 1.15, uCon: 1.05, uFade: 0.15, uTemp: 0.25 })),
  pass('retro', retroU(p, { uJit: 0.6, uBleed: 0.8, uNoise: 0.5, uScan: 0.2, uVig: 0.5, uTone: 0.9, uFlick: 0.3 })),
], ['camcorder']);
fx('retrofreeze', 'retro', 'Fotograma congelado retro', [AMT(70), withDef(P.speed, 100)], (p) => [pass('retro', retroU(p, { uScan: 0.8, uJit: 1.2, uBleed: 1.4, uNoise: 0.6, uTone: 0.7 }))], ['congelar']).hold = { rate: 0 };

// ---- Luz
function bloomChain(p, { thr = 0.55, gain = 1.2, rad = 2.2, color = [1, 1, 1], pre = [] }) {
  return [
    ...pre,
    pass('bright', { uThr: thr }, { scale: 0.5 }),
    pass('blurh', { uA: rad }, { scale: 0.5 }), pass('blurv', { uA: rad }, { scale: 0.5 }),
    pass('blurh', { uA: rad * 2 }, { scale: 0.25 }), pass('blurv', { uA: rad * 2 }, { scale: 0.25 }),
    pass('addglow', { uGain: gain * p.amount, uCol: color }),
  ];
}
fx('glow', 'luz', 'Glow', [AMT(60), withDef(P.size, 50)], (p) => bloomChain(p, { thr: 0.5, rad: 1.2 + p.size * 0.04 }), ['brillo']);
fx('intensebright', 'luz', 'Brillo intenso', [AMT(70)], (p) => bloomChain(p, { thr: 0.45, gain: 1.1, rad: 2.6, pre: [pass('grade', gradeU(p, { uBri: 0.06, uCon: 1.1, uSat: 1.1 }))] }), ['exposición']);
fx('halo', 'luz', 'Halo luminoso', [AMT(60), withDef(P.size, 70)], (p) => bloomChain(p, { thr: 0.4, rad: 2 + p.size * 0.08, gain: 1.4 }), ['bloom']);
fx('neon', 'luz', 'Neón', [AMT(80), { ...P.color, def: '#00f2fe' }], (p) => bloomChain(p, { thr: 0.45, gain: 1.2, rad: 1.6, color: [1, 1, 1], pre: [pass('edges', { uAmt: 1, uA: 1.1, uB: 4, uC: 1, uCol: p.rgb }, { save: true })] }), ['contorno']);
fx('sparkles', 'luz', 'Destellos', [AMT(70), P.speed, withDef(P.size, 60)], (p) => [pass('flare', U(p, { uA: 0.9, uC: 0.75, uD: 0.8 }))], ['flare']);
fx('lightleak', 'luz', 'Fugas de luz', [AMT(70), P.speed], (p) => [pass('leak', U(p, { uA: 3.2, uB: 1.1 }))], ['leak']);
fx('edgeglow', 'luz', 'Resplandor de contornos', [AMT(80), { ...P.color, def: '#ffd24a' }], (p) => bloomChain(p, { thr: 0.85, gain: 1.2, rad: 1.4, pre: [pass('edges', { uAmt: p.amount, uA: 1.1, uB: 4, uC: 2, uCol: p.rgb }, { save: true })] }), ['contorno']);
fx('lightrays', 'luz', 'Rayos de luz', [AMT(70), { ...P.color, def: '#fff1c0' }], (p) => [pass('zoomblur', { uAmt: p.amount, uA: 0.9, uB: 1, uC: 0.5, uD: 0.9, uThr: 0.55, uCol: p.rgb })], ['god rays']);
fx('volumetric', 'luz', 'Luz volumétrica', [AMT(65), { ...P.color, def: '#ffe2a8' }, P.speed], (p) => [
  pass('zoomblur', { uAmt: p.amount, uA: 1.1, uB: 1, uC: 0.25, uD: 1.0, uThr: 0.45, uCol: p.rgb }),
  pass('fog', { uAmt: p.amount * 0.5, uSpd: p.speed, uA: 2.2, uB: 0.6, uCol: p.rgb }),
], ['rayos', 'niebla']);
fx('lightflicker', 'luz', 'Parpadeo de luz', [AMT(60), withDef(P.speed, 100)], (p) => [pass('flicker', U(p, { uA: 14, uB: 1 }))], ['flicker']);
fx('flashpulse', 'luz', 'Destello de flash', [AMT(80), withDef(P.speed, 100), P.color], (p) => [pass('flash', { uAmt: p.amount, uSpd: p.speed, uA: 1.4, uCol: p.rgb })], ['flash']);

// ---- Distorsión
fx('waves', 'distorsion', 'Ondas', [AMT(60), P.speed, withDef(P.freq, 40), sel('axis', 'Eje', [['h', 'Horizontal'], ['v', 'Vertical'], ['hv', 'Ambos']], 'h')],
  (p) => [pass('wave', U(p, { uA: 4 + p.freq * 0.5, uB: 0.05, uC: p.axis === 'v' ? 1 : p.axis === 'hv' ? 2 : 0 }))], ['onda']);
fx('heatwave', 'distorsion', 'Onda de calor', [AMT(60), P.speed], (p) => [pass('heat', U(p, { uA: 5, uB: 0.05, uC: 1 }))], ['calor']);
fx('fisheye', 'distorsion', 'Ojo de pez', [AMT(70)], (p) => [pass('lens', U(p, { uA: 1.4, uB: 0 }))]);
fx('bulge', 'distorsion', 'Abombamiento', [AMT(70)], (p) => [pass('lens', U(p, { uA: 1.5, uB: 1 }))], ['bulto']);
fx('pinch', 'distorsion', 'Pellizco', [AMT(70)], (p) => [pass('lens', U(p, { uA: 1.5, uB: 2 }))]);
fx('stretchx', 'distorsion', 'Estiramiento horizontal', [AMT(70)], (p) => [pass('lens', U(p, { uA: 1.6, uB: 3 }))], ['estirar']);
fx('stretchy', 'distorsion', 'Estiramiento vertical', [AMT(70)], (p) => [pass('lens', U(p, { uA: 1.6, uB: 4 }))], ['estirar']);
fx('lensdist', 'distorsion', 'Distorsión de lente', [AMT(60)], (p) => [pass('lens', U(p, { uA: 0.9, uB: 0 })), pass('rgb', U(p, { uA: 0.012, uC: 1 }))], ['lente']);
fx('swirlfx', 'distorsion', 'Remolino', [AMT(60), P.speed], (p) => [pass('swirl', U(p, { uA: 0.7, uB: 5, uC: 0.5, uD: 0.5 }))], ['espiral']);
fx('ripplefx', 'distorsion', 'Ondulación', [AMT(70), P.speed], (p) => [pass('ripple', U(p, { uA: 30, uB: 0.05, uC: 0.5, uD: 0.5 }))], ['agua']);
fx('oscillation', 'distorsion', 'Oscilación de imagen', [AMT(60), P.speed], (p) => [pass('camera', U(p, { uA: 1, uB: 4 }))]);

// ---- Glitch y color
fx('glitchfx', 'glitch', 'Glitch', [AMT(60), P.speed], (p) => [pass('glitch', U(p, { uA: 1, uB: 1 }))], ['digital']);
fx('rgbsplitfx', 'glitch', 'Separación RGB', [AMT(60), withDef(P.angle, 0), P.speed], (p) => [pass('rgb', U(p, { uA: 0.02, uB: p.angle, uC: 0, uD: 1 }))], ['rgb']);
fx('chromatic', 'glitch', 'Aberración cromática', [AMT(60)], (p) => [pass('rgb', U(p, { uA: 0.03, uC: 1 }))], ['cromática']);
fx('signalnoise', 'glitch', 'Interferencia de señal', [AMT(70), P.speed], (p) => [pass('glitch', U(p, { uA: 0.6, uB: 0.5 })), pass('retro', retroU(p, { uJit: 1.4, uNoise: 0.8, uTrack: 1.2, uBleed: 0.6 }))], ['señal']);
fx('tearfx', 'glitch', 'Desgarro digital', [AMT(70), P.speed, withDef(P.freq, 30)], (p) => [pass('tear', U(p, { uA: 6 + p.freq * 0.5 }))]);
fx('invertfx', 'glitch', 'Negativo', [AMT(100)], (p) => [pass('invert', U(p))], ['inversión', 'invertir colores']);
fx('posterizefx', 'glitch', 'Posterización', [AMT(70), withDef(P.count, 30)], (p) => [pass('posterize', U(p, { uA: 2 + p.count * 0.12 }))]);
fx('pixelfx', 'glitch', 'Pixelación', [AMT(60)], (p) => [pass('pixel', U(p, { uA: 18, uB: 0 }))], ['pixelar']);
fx('mosaicfx', 'glitch', 'Mosaico', [AMT(60)], (p) => [pass('pixel', U(p, { uA: 22, uB: 1 }))], ['mosaico']);
fx('contours', 'glitch', 'Contornos', [AMT(100), withDef(P.size, 40)], (p) => [pass('edges', { uAmt: 1, uA: 0.8 + p.size * 0.03, uB: 4, uC: 0, uCol: [1, 1, 1] })], ['bordes', 'sketch']);
fx('cameranoise', 'glitch', 'Ruido de cámara', [AMT(55), P.speed], (p) => [pass('film', U(p, { uGrain: 2, uScratch: 0, uDust: 0, uFlick: 0.2, uSepia: 0, uVigf: 0, uWeave: 0 }))], ['grano', 'iso']);

// ---- Cámara y movimiento
const cam = (id, label, mode, a, tags) => fx(id, 'camara', label, [AMT(60), P.speed], (p) => [pass('camera', U(p, { uA: a, uB: mode }))], tags);
cam('shake', 'Temblor de imagen', 0, 1.2, ['sacudida']);
cam('handheld', 'Cámara temblorosa', 1, 1.2, ['cámara en mano']);
cam('vibration', 'Vibración', 2, 1.4, []);
cam('zoompulse', 'Pulso de zoom', 3, 1.2, ['latido']);
cam('dynzoom', 'Zoom dinámico', 5, 1.2, ['respiración']);
fx('motionblur', 'camara', 'Motion blur', [AMT(60), withDef(P.angle, 0)], (p) => [pass('dirblur', { uAmt: p.amount, uSpd: p.speed, uA: 0.1, uB: p.angle, uC: 0 })], ['movimiento']);
fx('dirblurfx', 'camara', 'Desenfoque direccional', [AMT(60), withDef(P.angle, 45)], (p) => [pass('dirblur', { uAmt: p.amount, uSpd: p.speed, uA: 0.12, uB: p.angle, uC: 0 })]);
fx('radialblur', 'camara', 'Desenfoque radial', [AMT(60)], (p) => [pass('zoomblur', { uAmt: p.amount, uA: 0.35, uB: 0, uC: 0.5, uD: 0.5, uThr: 0 })]);
fx('gaussblur', 'camara', 'Desenfoque gaussiano', [AMT(50)], (p) => [pass('blur', { uAmt: p.amount, uA: 0.08 })], ['blur']);
fx('speedlinesfx', 'camara', 'Speed lines', [AMT(80), P.speed, withDef(P.count, 40), P.color], (p) => [pass('speedlines', { uAmt: p.amount, uSpd: p.speed, uA: 24 + p.count, uB: 0.5, uCol: p.rgb })], ['manga', 'líneas de velocidad']);
fx('motionecho', 'camara', 'Eco de movimiento', [AMT(70), withDef(P.angle, 0)], (p) => [pass('trails', { uAmt: p.amount, uA: 0.9, uB: 1.0, uC: 0 }, { feedback: 'echo' })], ['estela', 'eco']);
fx('trailsfx', 'camara', 'Estelas', [AMT(75), P.speed], (p) => [pass('trails', { uAmt: p.amount, uA: 0.94, uB: 1.012, uC: 1.2 }, { feedback: 'trail' })], ['estela']);
const stutter = fx('framerepeat', 'camara', 'Repetición de fotogramas', [AMT(100), withDef({ ...P.freq, label: 'Fotogramas por segundo', min: 1, max: 30, def: 6 }, 6)], (p) => [], ['stutter', 'entrecortado']);
stutter.hold = { rateParam: 'freq' };
const freeze = fx('freezemotion', 'camara', 'Congelación del movimiento', [AMT(100)], (p) => [], ['congelar', 'freeze']);
freeze.hold = { rate: 0 };

// ---- Espejos y multiplicación
fx('mirrorfx', 'espejo', 'Espejo', [AMT(100), sel('side', 'Lado', [[0, 'Izquierda → derecha'], [1, 'Derecha → izquierda'], [2, 'Arriba → abajo'], [3, 'Abajo → arriba']], 0)],
  (p) => [pass('mirror', U(p, { uA: Number(p.side) }))]);
fx('symmetry', 'espejo', 'Simetría', [AMT(100)], (p) => [pass('mirror', U(p, { uA: 4 }))], ['cuatro']);
fx('kaleido', 'espejo', 'Caleidoscopio', [AMT(80), P.speed, withDef({ ...P.count, label: 'Segmentos', min: 2, max: 16, def: 6 }, 6)], (p) => [pass('kaleido', U(p, { uA: Math.round(p.count), uB: 0.9 }))]);
fx('tunnelfx', 'espejo', 'Túnel infinito', [AMT(90), P.speed], (p) => [pass('tunnel', U(p, { uA: 4, uB: 1 }))], ['túnel']);
fx('multimirror', 'espejo', 'Espejo múltiple', [AMT(100), withDef({ ...P.count, label: 'Repeticiones', min: 2, max: 8, def: 3 }, 3)], (p) => [pass('tile', U(p, { uA: Math.round(p.count), uB: 1 }))]);
fx('duplicate', 'espejo', 'Duplicación de imagen', [AMT(100), withDef({ ...P.count, label: 'Repeticiones', min: 2, max: 8, def: 2 }, 2)], (p) => [pass('tile', U(p, { uA: Math.round(p.count), uB: 0 }))], ['mosaico', 'clon']);
fx('ghost', 'espejo', 'Imagen fantasma', [AMT(70), withDef(P.angle, 0), P.speed], (p) => [pass('double', U(p, { uA: 1.3, uB: 1, uC: p.angle }))], ['eco']);
fx('doubleexp', 'espejo', 'Doble exposición', [AMT(70), P.speed], (p) => [pass('double', U(p, { uA: 1, uB: 0 }))], ['superponer']);

// ---- Atmósfera
fx('fogfx', 'clima', 'Niebla', [AMT(60), P.speed, withDef(P.size, 40), P.color], (p) => [pass('fog', { uAmt: p.amount, uSpd: p.speed, uA: 1.5 + p.size * 0.04, uB: 1, uCol: p.rgb })], ['bruma']);
fx('waterfx', 'clima', 'Agua', [AMT(70), P.speed], (p) => [pass('caustics', U(p, { uA: 3, uB: 1 }))], ['cáusticas']);
fx('vignettefx', 'clima', 'Viñeta oscura', [AMT(80)], (p) => [pass('vignette', { uAmt: p.amount, uA: 0.25, uB: 0.65, uCol: [0, 0, 0] })], ['viñeta']);
fx('shadowsfx', 'clima', 'Sombras', [AMT(70), sel('side', 'Zona', [[0, 'Abajo'], [1, 'Arriba'], [2, 'Arriba y abajo']], 0)], (p) => [pass('shade', U(p, { uA: 1.4, uB: Number(p.side) }))]);
fx('creepyblur', 'clima', 'Desenfoque inquietante', [AMT(70), P.speed], (p, c) => [
  pass('blur', { uAmt: 0.5 + 0.25 * Math.sin(c.t * 2 * p.speed), uA: 0.03 }),
  pass('grade', gradeU(p, { uSat: 0.35, uCon: 1.2, uBri: -0.05, uTemp: -0.5 })),
  pass('vignette', { uAmt: p.amount, uA: 0.15, uB: 0.6, uCol: [0, 0, 0.03] }),
], ['inquietante', 'terror']);
fx('appear', 'estilo', 'Efecto de aparición', [AMT(100), sel('mode', 'Estilo', [[1, 'Líquido'], [0, 'Estática'], [2, 'Desintegración'], [3, 'Píxeles']], 1), P.color], (p, c) => [
  pass('dissolve', { uProg: Math.min(1, c.local / Math.max(0.1, c.dur * 0.5)), uB: Number(p.mode), uAmt: p.amount, uEdge: p.rgb, uTime: 0 }),
], ['aparecer', 'revelar']);

// ====================================================================== FILTROS (corrección de color)
export const FILTER_CATS = [
  { id: 'cine', label: 'Cine' },
  { id: 'retro', label: 'Retro' },
  { id: 'color', label: 'Color' },
  { id: 'piel', label: 'Retrato' },
];
export function gradeU(p, o = {}) {
  return {
    uAmt: p.amount, uSat: 1, uCon: 1, uBri: 0, uTemp: 0, uTint: 0, uFade: 0, uGam: 1, uSoft: 0,
    uSh: [0, 0, 0], uHi: [0, 0, 0], ...o,
  };
}
const flt = (id, cat, label, o, tags = []) => register({
  kind: 'filter', id, cat, label, tags, params: [withDef(P.amount, 100)], build: (p) => [pass('grade', gradeU(p, o))],
});
flt('cinematic', 'cine', 'Cinematográfico', { uCon: 1.18, uSat: 0.9, uSh: [0, 0.02, 0.05], uHi: [0.05, 0.02, 0], uBri: -0.02 }, ['cine']);
flt('film', 'cine', 'Película', { uCon: 1.08, uSat: 0.95, uFade: 0.18, uTemp: 0.12, uSh: [0.02, 0.03, 0.04] });
flt('cinewarm', 'cine', 'Cinematográfico cálido', { uCon: 1.15, uSat: 1.0, uTemp: 0.55, uSh: [0.03, 0.01, 0], uHi: [0.06, 0.03, 0] });
flt('cinecool', 'cine', 'Cinematográfico frío', { uCon: 1.15, uSat: 0.95, uTemp: -0.5, uSh: [0, 0.02, 0.06], uHi: [0, 0.02, 0.05] });
flt('tealorange', 'cine', 'Teal and orange', { uCon: 1.15, uSat: 1.15, uSh: [-0.02, 0.06, 0.09], uHi: [0.12, 0.05, -0.04] }, ['teal', 'naranja']);
flt('cinecontrast', 'cine', 'Contraste cinematográfico', { uCon: 1.45, uSat: 0.85, uBri: -0.05, uGam: 1.05 });
flt('desat', 'color', 'Desaturado', { uSat: 0.35, uCon: 1.05 }, ['apagado']);
flt('retro', 'retro', 'Retro', { uSat: 0.85, uCon: 0.95, uFade: 0.2, uTemp: 0.3, uSh: [0.04, 0.02, 0.0] });
flt('sepiaf', 'retro', 'Sepia', { uSat: 0.2, uCon: 1.0, uTemp: 0.9, uTint: 0.2, uSh: [0.05, 0.02, -0.02], uHi: [0.1, 0.06, -0.02] });
flt('film35', 'retro', 'Película de 35 mm', { uCon: 1.1, uSat: 1.05, uFade: 0.12, uTemp: 0.15, uSh: [0.02, 0.04, 0.02], uHi: [0.05, 0.02, 0.0] });
flt('washed', 'retro', 'Colores deslavados', { uSat: 0.65, uCon: 0.85, uFade: 0.35, uBri: 0.04 });
flt('warmtones', 'color', 'Tonos cálidos', { uTemp: 0.7, uSat: 1.1, uHi: [0.05, 0.02, 0] });
flt('oldbw', 'retro', 'Blanco y negro antiguo', { uSat: 0, uCon: 0.95, uFade: 0.3, uTemp: 0.25, uSh: [0.02, 0.01, 0] });
flt('vividf', 'color', 'Vívido', { uSat: 1.5, uCon: 1.12 });
flt('saturated', 'color', 'Saturado', { uSat: 1.9, uCon: 1.05 });
flt('pastel', 'color', 'Pastel', { uSat: 0.7, uCon: 0.8, uBri: 0.1, uFade: 0.15, uHi: [0.03, 0.02, 0.04] });
flt('coolf', 'color', 'Frío', { uTemp: -0.7, uSat: 1.05 });
flt('warmf', 'color', 'Cálido', { uTemp: 0.6, uSat: 1.1 });
flt('highcontrast', 'color', 'Alto contraste', { uCon: 1.6, uSat: 1.1 });
flt('matte', 'cine', 'Mate', { uCon: 0.9, uFade: 0.45, uSat: 0.9 });
flt('bwf', 'color', 'Blanco y negro', { uSat: 0, uCon: 1.2 });
flt('natural', 'color', 'Natural', { uSat: 1.05, uCon: 1.03, uBri: 0.01 });
flt('soft', 'piel', 'Suave', { uCon: 0.92, uSat: 0.95, uSoft: 0.6, uBri: 0.03 });
flt('portrait', 'piel', 'Retrato', { uCon: 1.05, uSat: 1.0, uTemp: 0.18, uSoft: 0.5, uHi: [0.03, 0.015, 0.01] });
flt('skin', 'piel', 'Tono de piel', { uSat: 1.05, uTemp: 0.3, uTint: 0.05, uSoft: 0.2, uHi: [0.04, 0.02, 0.01] });
flt('softglow', 'piel', 'Brillo suave', { uCon: 0.95, uBri: 0.04, uSoft: 1.0 });
register({
  kind: 'filter', id: 'edgeblur', cat: 'piel', label: 'Desenfoque de bordes', tags: ['fondo', 'tilt shift', 'enfoque'],
  params: [withDef(P.amount, 80), withDef(P.size, 40)],
  build: (p) => [
    pass('blur', { uAmt: 1, uA: 0.04 * p.amount }),
    pass('edgemix', { uAmt: 1, uA: 0.1 + p.size * 0.006 }),
  ],
});

// ====================================================================== TRANSICIONES
export const TR_CATS = [
  { id: 'basicas', label: 'Básicas' },
  { id: 'zoom', label: 'Zoom y cámara' },
  { id: 'glitch', label: 'Glitch y señal' },
  { id: 'luz', label: 'Luz y desenfoque' },
  { id: 'desliz', label: 'Deslizar y cortinas' },
  { id: 'forma', label: 'Formas y 3D' },
  { id: 'organica', label: 'Fluidas' },
];
const E = (p) => 1 - Math.pow(1 - p, 3);
const ex = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const inv = (p) => 1 - p;
const trans = (id, cat, label, o) => register({ kind: 'transition', id, cat, label, params: [P.amount], ...o });
// geo(st, p, out, W, H, pr): modifica alpha/escala/posición/rotación (p = presencia, 1 = visible)
// build(pr, c): pasadas GPU; c.p = presencia
trans('none', 'basicas', 'Corte directo', { geo: () => {}, params: [] });
trans('fade', 'basicas', 'Fundido (entrada / salida)', { geo: (st, p) => { st.alpha *= p; }, params: [] });
trans('crossfade', 'basicas', 'Disolución cruzada', { geo: (st, p) => { st.alpha *= p * p * (3 - 2 * p); }, params: [] });
trans('fadeblack', 'basicas', 'Fundido a negro', { geo: (st, p) => { st.alpha *= Math.min(1, p * 1.6); st.dip = [0, 0, 0, 1 - p]; }, params: [] });
trans('fadewhite', 'basicas', 'Fundido a blanco', { geo: (st, p) => { st.alpha *= Math.min(1, p * 1.6); st.dip = [255, 255, 255, 1 - p]; }, params: [] });
trans('fadescale', 'basicas', 'Desvanecimiento', { geo: (st, p) => { st.alpha *= E(p); st.sc *= 0.9 + 0.1 * E(p); }, params: [] });
trans('blink', 'basicas', 'Parpadeo', { geo: (st, p) => { const k = Math.floor((1 - p) * 8); st.alpha *= p > 0.98 ? 1 : k % 2 === 0 ? 0.15 + 0.85 * p : 1; }, params: [] });
trans('zoomIn', 'zoom', 'Zoom +', { geo: (st, p) => { st.sc *= 0.55 + 0.45 * E(p); st.alpha *= E(p); }, params: [] });
trans('zoomOut', 'zoom', 'Zoom −', { geo: (st, p) => { st.sc *= 1.5 - 0.5 * E(p); st.alpha *= E(p); }, params: [] });
trans('zoomFast', 'zoom', 'Zoom rápido', { geo: (st, p) => { st.sc *= 1 + 1.6 * Math.pow(1 - ex(p), 1.6); st.alpha *= Math.min(1, ex(p) * 3); }, build: (pr, c) => [pass('zoomblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.5, uB: 0, uC: 0.5, uD: 0.5 })] });
trans('zoomBlur', 'zoom', 'Zoom con desenfoque', { geo: (st, p) => { st.sc *= 1.25 - 0.25 * E(p); st.alpha *= Math.min(1, E(p) * 2); }, build: (pr, c) => [pass('zoomblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.9, uB: 0, uC: 0.5, uD: 0.5 })] });
trans('pushPull', 'zoom', 'Acercamiento y alejamiento', { geo: (st, p) => { const q = 1 - p; st.sc *= 1 + 0.25 * Math.sin(q * Math.PI) - 0.3 * q; st.alpha *= Math.min(1, p * 2.5); } });
trans('cameraRoll', 'zoom', 'Giro de cámara', { geo: (st, p) => { st.rot += (1 - E(p)) * Math.PI * 0.5; st.sc *= 0.7 + 0.3 * E(p); st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('spinblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.5 })] });
trans('rot3d', 'forma', 'Rotación 3D', { geo: (st, p) => { st.alpha *= Math.min(1, p * 3); }, build: (pr, c) => [pass('persp', { uB: 0, uAng: (1 - E(c.p)) * 75, uPiv: 0, uDist: 2.4 })] });
trans('pan', 'zoom', 'Movimiento panorámico', { geo: (st, p, out, W) => { st.dx += (out ? -1 : 1) * (1 - E(p)) * W * 0.5; st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('dirblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.25, uB: 0, uC: 0 })] });
trans('handheld', 'zoom', 'Cámara en mano', { geo: (st, p, out, W, H) => { const a = 1 - p; st.dx += Math.sin(p * 61) * a * W * 0.04; st.dy += Math.cos(p * 47) * a * H * 0.04; st.rot += Math.sin(p * 53) * a * 0.06; st.sc *= 1 + a * 0.08; st.alpha *= Math.min(1, p * 3); }, build: (pr, c) => [pass('dirblur', { uAmt: (1 - c.p) * pr.amount * 0.6, uA: 0.06, uB: 25, uC: 0 })] });
trans('glitchT', 'glitch', 'Glitch digital', { geo: (st, p) => { st.alpha *= Math.min(1, p * 5); }, build: (pr, c) => [pass('glitch', { uAmt: (1 - c.p) * pr.amount * 1.4, uSpd: 1, uA: 1, uB: 1 })] });
trans('rgbT', 'glitch', 'RGB Split', { geo: (st, p) => { st.alpha *= Math.min(1, p * 4); }, build: (pr, c) => [pass('rgb', { uAmt: (1 - c.p) * pr.amount, uA: 0.08, uB: 0, uC: 0, uD: 1, uSpd: 1 })] });
trans('chromaT', 'glitch', 'Aberración cromática', { geo: (st, p) => { st.alpha *= Math.min(1, p * 3); }, build: (pr, c) => [pass('rgb', { uAmt: (1 - c.p) * pr.amount, uA: 0.12, uC: 1 })] });
trans('shiftT', 'glitch', 'Desplazamiento de imagen', { geo: (st, p) => { st.alpha *= Math.min(1, p * 4); }, build: (pr, c) => [pass('tear', { uAmt: (1 - c.p) * pr.amount * 1.3, uSpd: 1, uA: 7 })] });
trans('waveT', 'glitch', 'Distorsión ondulada', { geo: (st, p) => { st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('wave', { uAmt: (1 - c.p) * pr.amount, uSpd: 1.5, uA: 14, uB: 0.12, uC: 0 })] });
trans('tearT', 'glitch', 'Desgarro digital', { geo: (st, p) => { st.alpha *= Math.min(1, p * 4); }, build: (pr, c) => [pass('tear', { uAmt: (1 - c.p) * pr.amount * 1.5, uSpd: 1.3, uA: 14 })] });
trans('signalT', 'glitch', 'Interferencia de señal', { geo: (st, p) => { st.alpha *= Math.min(1, p * 4); }, build: (pr, c) => [pass('retro', { uAmt: (1 - c.p) * pr.amount, uSpd: 2, uScan: 0.6, uJit: 3, uBleed: 2, uNoise: 1.4, uTrack: 2, uCurve: 0, uVig: 0, uTone: 0.6, uFlick: 1 })] });
trans('tvT', 'glitch', 'Ruido de televisión', { build: (pr, c) => [pass('dissolve', { uProg: c.p, uB: 0, uAmt: 0, uEdge: [1, 1, 1] }), pass('retro', { uAmt: (1 - c.p) * pr.amount, uSpd: 2, uScan: 1, uJit: 1, uBleed: 1, uNoise: 1.6, uTrack: 0, uCurve: 0, uVig: 0, uTone: 0.6, uFlick: 0 })] });
trans('flashW', 'luz', 'Flash blanco', { params: [P.amount], geo: (st, p) => { st.alpha *= 0.4 + 0.6 * E(p); }, build: (pr, c) => [pass('flash', { uAmt: Math.min(1, (1 - c.p) * 1.6 * pr.amount * 1.4), uA: 0, uCol: [1, 1, 1] })] });
trans('flashC', 'luz', 'Flash de color', { params: [P.amount, { ...P.color, def: '#ff3b6b' }], geo: (st, p) => { st.alpha *= 0.4 + 0.6 * E(p); }, build: (pr, c) => [pass('flash', { uAmt: Math.min(1, (1 - c.p) * 1.6 * pr.amount * 1.4), uA: 0, uCol: pr.rgb })] });
trans('flareT', 'luz', 'Destello de lente', { geo: (st, p) => { st.alpha *= 0.5 + 0.5 * E(p); }, build: (pr, c) => [pass('flare', { uAmt: Math.sin(Math.PI * Math.min(1, (1 - c.p) * 1.3)) * pr.amount, uSpd: 1, uA: 1.2, uC: 0.75, uD: 0.8 })] });
trans('leakT', 'luz', 'Fuga de luz', { geo: (st, p) => { st.alpha *= 0.4 + 0.6 * E(p); }, build: (pr, c) => [pass('leak', { uAmt: Math.sin(Math.PI * Math.min(1, (1 - c.p) * 1.2)) * pr.amount * 1.3, uSpd: 1.6, uA: 2.4, uB: 1.4 })] });
trans('radialT', 'luz', 'Desenfoque radial', { geo: (st, p) => { st.alpha *= Math.min(1, p * 2); }, build: (pr, c) => [pass('zoomblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.6, uB: 0, uC: 0.5, uD: 0.5 })] });
trans('motionT', 'luz', 'Desenfoque de movimiento', { geo: (st, p, out, W) => { st.dx += (out ? -1 : 1) * (1 - E(p)) * W * 0.15; st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('dirblur', { uAmt: (1 - c.p) * pr.amount, uA: 0.3, uB: 0, uC: 0 })] });
trans('gaussT', 'luz', 'Desenfoque gaussiano', { geo: (st, p) => { st.alpha *= Math.min(1, p * 2); }, build: (pr, c) => [pass('blur', { uAmt: (1 - c.p) * pr.amount, uA: 0.16 })] });
trans('lightsweep', 'luz', 'Barrido luminoso', { params: [P.amount, { ...P.color, def: '#fff2c8' }], geo: (st, p) => { st.alpha *= Math.min(1, p * 3); }, build: (pr, c) => [pass('sweep', { uAmt: (1 - c.p) * pr.amount * 1.4, uSpd: 0, uA: 6, uB: 20, uCol: pr.rgb, uTime: 0 }), pass('mask', { uProg: c.p, uB: 0, uC: 20, uSoft: 0.25, uAmt: 0, uEdge: [0, 0, 0] })] });
trans('slideLeft', 'desliz', 'Deslizar ←', { geo: (st, p, out, W) => { st.dx += (out ? -1 : 1) * (1 - E(p)) * W; }, params: [] });
trans('slideRight', 'desliz', 'Deslizar →', { geo: (st, p, out, W) => { st.dx -= (out ? -1 : 1) * (1 - E(p)) * W; }, params: [] });
trans('slideUp', 'desliz', 'Deslizar ↑', { geo: (st, p, out, W, H) => { st.dy += (out ? -1 : 1) * (1 - E(p)) * H; }, params: [] });
trans('slideDown', 'desliz', 'Deslizar ↓', { geo: (st, p, out, W, H) => { st.dy -= (out ? -1 : 1) * (1 - E(p)) * H; }, params: [] });
const maskT = (id, cat, label, mode, extra = {}, more = {}) => trans(id, cat, label, {
  params: [withDef(P.amount, 50)],
  build: (pr, c) => [pass('mask', { uProg: E(c.p), uB: mode, uC: extra.angle ?? 0, uD: extra.inv ?? 0, uA: extra.slats ?? 8, uSoft: 0.03 + (1 - pr.amount) * 0.0, uAmt: 0, uEdge: [1, 1, 1] })],
  ...more,
});
maskT('wipeRight', 'desliz', 'Cortina →', 0, { angle: 0 });
maskT('wipeDown', 'desliz', 'Cortina ↓', 0, { angle: 270 });
maskT('wipeH', 'desliz', 'Barrido horizontal', 0, { angle: 180 });
maskT('wipeV', 'desliz', 'Barrido vertical', 0, { angle: 90 });
maskT('diagT', 'desliz', 'Máscara diagonal', 0, { angle: 45 });
maskT('splitT', 'desliz', 'División de pantalla', 5);
maskT('splitH', 'desliz', 'División horizontal', 6);
maskT('blindsT', 'desliz', 'Cortinilla', 7, { slats: 8 });
maskT('irisOpen', 'forma', 'Apertura circular', 1, { inv: 0 });
maskT('irisClose', 'forma', 'Cierre circular', 1, { inv: 1 });
maskT('clockT', 'forma', 'Reloj', 8);
maskT('blocksT', 'forma', 'Bloques', 9);
maskT('diamondT', 'forma', 'Rombo', 2, { inv: 0 });
maskT('starT', 'forma', 'Estrella (formas)', 3, { inv: 0 });
maskT('heartT', 'forma', 'Corazón (formas)', 4, { inv: 0 });
trans('cube', 'forma', 'Cubo 3D', { geo: (st, p) => { st.alpha *= Math.min(1, p * 3); }, build: (pr, c, out) => [pass('persp', { uB: 3, uAng: (out ? -1 : 1) * (1 - E(c.p)) * 90, uPiv: out ? 1 : -1, uDist: 3 })] });
trans('pageturn', 'forma', 'Giro de página', { build: (pr, c) => [pass('curl', { uProg: E(c.p) })] });
trans('flipH', 'forma', 'Volteo horizontal', { geo: (st, p) => { st.alpha *= p > 0.02 ? 1 : 0; }, build: (pr, c, out) => [pass('persp', { uB: 0, uAng: (out ? -1 : 1) * (1 - c.p) * 88, uPiv: 0, uDist: 2.6 })] });
trans('flipV', 'forma', 'Volteo vertical', { geo: (st, p) => { st.alpha *= p > 0.02 ? 1 : 0; }, build: (pr, c, out) => [pass('persp', { uB: 1, uAng: (out ? -1 : 1) * (1 - c.p) * 88, uPiv: 0, uDist: 2.6 })] });
trans('spin', 'forma', 'Giro', { geo: (st, p, out) => { st.rot += (out ? -1 : 1) * (1 - E(p)) * Math.PI; st.sc *= E(p); st.alpha *= E(p); }, params: [] });
trans('screenRot', 'forma', 'Rotación de pantalla', { geo: (st, p, out) => { st.rot += (out ? -1 : 1) * (1 - E(p)) * Math.PI * 2; st.sc *= 0.6 + 0.4 * E(p); st.alpha *= Math.min(1, p * 2.5); }, params: [] });
trans('spiral', 'organica', 'Espiral', { geo: (st, p) => { st.sc *= 0.5 + 0.5 * E(p); st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('swirl', { uAmt: (1 - c.p) * pr.amount * 1.6, uSpd: 1, uA: 0.9, uB: 12, uC: 0.5, uD: 0.5 })] });
trans('stretchT', 'organica', 'Estiramiento', { geo: (st, p) => { const e = ex(p); st.sx = 0.05 + 0.95 * e * (1 + 0.12 * Math.sin(p * 9) * (1 - p)); st.sy = 1.9 - 0.9 * e; st.alpha *= Math.min(1, p * 3); }, params: [] });
trans('rippleT', 'organica', 'Ondulación', { geo: (st, p) => { st.alpha *= Math.min(1, p * 2.5); }, build: (pr, c) => [pass('ripple', { uAmt: (1 - c.p) * pr.amount * 1.4, uSpd: 1, uA: 36, uB: 0.12, uC: 0.5, uD: 0.5 })] });
trans('liquid', 'organica', 'Transición líquida', { build: (pr, c) => [pass('dissolve', { uProg: c.p, uB: 1, uAmt: 0.8, uEdge: [0.4, 0.8, 1], uTime: c.t }), pass('wave', { uAmt: (1 - c.p) * pr.amount, uSpd: 1, uA: 10, uB: 0.05, uC: 2, uTime: c.t })] });
trans('particlesT', 'organica', 'Partículas', { params: [P.amount, { ...P.color, def: '#ffd36b' }], build: (pr, c) => [pass('dissolve', { uProg: c.p, uB: 2, uAmt: 1, uEdge: pr.rgb, uTime: c.t })] });
trans('dissolveT', 'organica', 'Disolución de ruido', { build: (pr, c) => [pass('dissolve', { uProg: c.p, uB: 3, uAmt: 0.4, uEdge: [1, 1, 1], uTime: c.t })] });

/** Pasadas de un elemento con parámetros ya normalizados. */
export function buildPasses(item, pr, c) {
  if (!item.build) return [];
  return item.build(pr, c) || [];
}
