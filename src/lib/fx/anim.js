// Animaciones de clip: entrada, salida y bucle. Modifican la transformación («st») en el momento t.
import { P, withDef } from './params.js';

export const ANIMS = [];
export const ANIM_BY_ID = new Map();
const reg = (it) => { const a = { tags: [], params: [P.amount, P.speed], ...it }; ANIMS.push(a); ANIM_BY_ID.set(a.id, a); return a; };
export const getAnim = (id) => ANIM_BY_ID.get(id) ?? null;

const E = (p) => 1 - Math.pow(1 - p, 3);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const backOut = (p) => { const c1 = 1.70158; return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const elastic = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);
const bounceOut = (x) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};

// ---- entrada y salida: p = presencia (0 = fuera, 1 = en su sitio)
const io = (id, label, fn, tags = [], params) => reg({ id, label, slots: ['in', 'out'], fn, tags, params: params || [withDef(P.amount, 100)] });
io('appear', 'Aparecer / desaparecer', (st, p, c) => { st.alpha *= clamp01(p * 1.4); st.sc *= 0.85 + 0.15 * E(p); }, ['aparecer', 'desaparecer']);
io('fadeA', 'Desvanecer', (st, p) => { st.alpha *= p; }, ['fundido']);
io('slideA', 'Deslizar', (st, p, c, out) => {
  const a = ((c.pr.angle ?? 180) * Math.PI) / 180; const d = (1 - E(p)) * c.W * c.pr.amount;
  st.dx += Math.cos(a) * d * -1; st.dy += Math.sin(a) * d * -1; st.alpha *= Math.min(1, p * 3);
}, ['deslizamiento'], [withDef(P.amount, 100), withDef(P.angle, 180)]);
io('zoomInA', 'Acercar', (st, p, c) => { st.sc *= 1 + (1 - E(p)) * 1.2 * c.pr.amount; st.alpha *= Math.min(1, p * 2.5); }, ['zoom']);
io('zoomOutA', 'Alejar', (st, p, c) => { st.sc *= 1 - (1 - E(p)) * 0.8 * c.pr.amount; st.alpha *= Math.min(1, p * 2.5); }, ['zoom']);
io('growA', 'Ampliar', (st, p) => { st.sc *= Math.max(0.0001, E(p)); st.alpha *= Math.min(1, p * 3); });
io('shrinkA', 'Reducir', (st, p, c) => { st.sc *= 1 + (1 - E(p)) * 0.6 * c.pr.amount; st.alpha *= Math.min(1, p * 2.5); });
io('bounceA', 'Rebotar', (st, p, c) => { st.dy -= (1 - bounceOut(p)) * c.H * 0.6 * c.pr.amount; st.alpha *= Math.min(1, p * 5); });
io('spinA', 'Girar', (st, p, c) => { st.rot += (1 - E(p)) * Math.PI * 2 * c.pr.amount; st.sc *= Math.max(0.0001, E(p)); st.alpha *= Math.min(1, p * 3); });
io('flyA', 'Volar', (st, p, c) => { const q = 1 - E(p); st.dx -= q * c.W * 0.7; st.dy += q * c.H * 0.6 - Math.sin(q * Math.PI) * c.H * 0.2; st.rot -= q * 0.6; st.sc *= 0.5 + 0.5 * E(p); st.alpha *= Math.min(1, p * 3); });
io('zoomSpinA', 'Zoom con giro', (st, p, c) => { st.sc *= Math.max(0.0001, backOut(p)); st.rot += (1 - E(p)) * Math.PI * c.pr.amount; st.alpha *= Math.min(1, p * 3); });
io('bounceScaleA', 'Rebote con escala', (st, p) => { st.sc *= Math.max(0.0001, elastic(p)); st.alpha *= Math.min(1, p * 6); });
io('slideBlurA', 'Deslizamiento con desenfoque', (st, p, c) => { st.dx -= (1 - E(p)) * c.W * 0.6; st.alpha *= Math.min(1, p * 3); (st.fx ||= []).push({ k: 'dirblur', u: { uAmt: (1 - E(p)) * c.pr.amount, uA: 0.22, uB: 0, uC: 0 } }); }, ['blur', 'desenfoque']);
io('swingA', 'Péndulo', (st, p) => { st.rot += Math.sin(p * Math.PI * 3) * (1 - p) * 0.5; st.alpha *= Math.min(1, p * 4); });

// ---- bucle: t = tiempo local * velocidad
const loop = (id, label, fn, tags = [], params) => reg({ id, label, slots: ['loop'], fn, tags, params: params || [withDef(P.amount, 50), P.speed] });
loop('scrollH', 'Desplazamiento horizontal', (st, t, c) => { st.dx += Math.sin(t * 1.5) * c.W * 0.08 * c.pr.amount * 2; });
loop('scrollV', 'Desplazamiento vertical', (st, t, c) => { st.dy += Math.sin(t * 1.5) * c.H * 0.08 * c.pr.amount * 2; });
loop('rotateL', 'Rotación', (st, t, c) => { st.rot += t * 1.2 * (c.pr.amount * 2); });
loop('scaleL', 'Cambio de escala', (st, t, c) => { st.sc *= 1 + Math.sin(t * 2) * 0.2 * c.pr.amount * 2; });
loop('bounceL', 'Rebotes repetidos', (st, t, c) => { st.dy -= Math.abs(Math.sin(t * 3.2)) * c.H * 0.12 * c.pr.amount * 2; });
loop('pulseL', 'Pulsaciones', (st, t, c) => { const k = Math.pow(0.5 + 0.5 * Math.sin(t * 5), 3); st.sc *= 1 + k * 0.18 * c.pr.amount * 2; });
loop('oscillateL', 'Oscilaciones', (st, t, c) => { st.rot += Math.sin(t * 2.4) * 0.25 * c.pr.amount * 2; });
loop('shakeL', 'Sacudidas', (st, t, c) => { st.dx += Math.sin(t * 61) * c.W * 0.012 * c.pr.amount * 2; st.dy += Math.cos(t * 53) * c.H * 0.012 * c.pr.amount * 2; st.rot += Math.sin(t * 47) * 0.02 * c.pr.amount * 2; });
loop('floatL', 'Flotar', (st, t, c) => { st.dy += Math.sin(t * 1.6) * c.H * 0.03 * c.pr.amount * 2; st.rot += Math.sin(t * 1.1) * 0.03; });

export const ANIM_IN_OUT = ANIMS.filter((a) => a.slots.includes('in'));
export const ANIM_LOOP = ANIMS.filter((a) => a.slots.includes('loop'));
export const ioDefaults = { duration: 0.8 };
