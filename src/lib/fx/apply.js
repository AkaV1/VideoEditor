// Puente entre el catálogo (registro de efectos) y el renderizador: calcula pasadas GPU, transiciones, animaciones.
import { getItem, buildPasses } from './registry.js';
import { normParams } from './params.js';
import { getFx } from './gl.js';
import { getAnim } from './anim.js';
import { getTextFx } from './textfx.js';
import { drawParticles } from './particles.js';

/** Modo de bajo rendimiento: desactiva efectos pesados (partículas, realimentación) y reduce la resolución GL. */
export const perf = { low: false };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const layers = new Map();
/** Lienzo 2D de tamaño exacto W×H (el procesador GL lo lee entero). */
export function layer(name, W, H) {
  W = Math.round(W); H = Math.round(H);
  const key = `${name}:${W}x${H}`;
  let l = layers.get(key);
  if (!l) {
    if (layers.size > 12) layers.clear();
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    l = { canvas, ctx: canvas.getContext('2d') };
    layers.set(key, l);
  }
  l.ctx.setTransform(1, 0, 0, 1, 0, 0);
  l.ctx.globalAlpha = 1;
  l.ctx.globalCompositeOperation = 'source-over';
  l.ctx.filter = 'none';
  l.ctx.clearRect(0, 0, W, H);
  return l;
}

const heavy = (p) => perf.low && p.feedback;

export function itemPasses(kind, id, params, c) {
  const it = getItem(kind, id);
  if (!it) return [];
  const pr = normParams(it, params);
  let list = buildPasses(it, pr, c);
  if (perf.low) list = list.filter((p) => !heavy(p));
  return list;
}

/** Pasadas de los efectos y filtros aplicados a un clip. */
export function clipPasses(clip, local, W, H) {
  const out = [];
  for (const f of clip.fx || []) {
    if (f.off) continue;
    out.push(...itemPasses(f.kind || 'fx', f.id, f.p, { t: local, local, dur: clip.duration, p: 1, W, H }));
  }
  return out;
}

/** Transición registrada: modifica `st` y devuelve true; si no existe devuelve false (se usa la clásica). */
export function transitionStep(st, tr, p, out, W, H, local, dur) {
  const it = getItem('transition', tr.type);
  if (!it) return false;
  const pr = normParams(it, tr.p);
  it.geo?.(st, p, out, W, H, pr);
  if (it.build) {
    const list = buildPasses(it, pr, { t: local, local, dur, p, W, H, out }).filter((q) => !heavy(q));
    if (list.length) (st.fx ||= []).push(...list);
  }
  return true;
}

/** Animaciones de entrada, salida y bucle del clip. */
export function animStep(st, clip, local, W, H) {
  const a = clip.anim;
  if (!a) return;
  const run = (slot, p, out) => {
    const it = getAnim(slot.id);
    if (!it) return;
    const pr = normParams(it, slot.p);
    it.fn(st, p, { W, H, pr, clip, out }, out);
  };
  if (a.in && a.in.duration > 0 && local < a.in.duration) run(a.in, clamp(local / a.in.duration, 0, 1), false);
  const remain = clip.duration - local;
  if (a.out && a.out.duration > 0 && remain < a.out.duration) run(a.out, clamp(remain / a.out.duration, 0, 1), true);
  if (a.loop) {
    const it = getAnim(a.loop.id);
    if (it) it.fn(st, local * normParams(it, a.loop.p).speed, { W, H, pr: normParams(it, a.loop.p), clip }, false);
  }
}

/** Efecto de texto activo en este instante (entrada → salida → bucle). */
export function pickTextFx(clip, local) {
  const list = clip.textFx;
  if (!list || !list.length) return null;
  const remain = clip.duration - local;
  let loop = null, inn = null, out = null;
  for (const f of list) {
    if (f.off) continue;
    const it = getTextFx(f.id);
    if (!it) continue;
    const d = f.p?.duration ?? 1.2;
    if (it.mode === 'in' && local < d && !inn) inn = f;
    else if (it.mode === 'out' && remain < d && !out) out = f;
    else if (it.mode === 'loop' && !loop) loop = f;
  }
  return out || inn || loop;
}

/** Ejecuta pasadas GPU sobre un lienzo 2D. Devuelve el lienzo WebGL o null (se dibuja sin efecto). */
export function runGL(srcCanvas, passes, W, H, time) {
  if (!passes.length) return null;
  try {
    const gl = getFx(W, H);
    if (!gl || !gl.ok) return null;
    return gl.run(srcCanvas, passes, time);
  } catch {
    return null;
  }
}

const holds = new Map();
/** Congela/repite fotogramas: devuelve el lienzo a usar como fuente (copia retenida) o null si hay que refrescarlo. */
function holdFrame(key, W, H, step, src) {
  let h = holds.get(key);
  if (!h || h.W !== W || h.H !== H) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    h = { canvas, ctx: canvas.getContext('2d'), step: NaN, W, H };
    holds.set(key, h);
    if (holds.size > 8) holds.delete(holds.keys().next().value);
  }
  if (h.step !== step) {
    h.ctx.clearRect(0, 0, W, H);
    h.ctx.drawImage(src, 0, 0, W, H);
    h.step = step;
  }
  return h.canvas;
}

/**
 * Efecto de ajuste (capa de efecto sobre todo lo anterior). Ya no depende de `effectId`:
 * clip.fxKind = 'fx' | 'filter' | 'particles'; clip.fxId; clip.fxParams.
 */
export function applyFxClip(ctx, W, H, k, clip, local, scratch) {
  const kind = clip.fxKind;
  if (kind === 'particles') {
    if (perf.low && /^(fog|smoke|fire)$/.test(clip.fxId)) return true;
    drawParticles(ctx, W, H, k, local, clip.fxId, clip.fxParams, scratch);
    return true;
  }
  const it = getItem(kind, clip.fxId);
  if (!it) return false;
  const pr = normParams(it, clip.fxParams);
  const passes = itemPasses(kind, clip.fxId, clip.fxParams, { t: local, local, dur: clip.duration, p: 1, W, H });
  const snap = layer('adj', W, H);
  snap.ctx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, W, H);
  let srcCanvas = snap.canvas;
  if (it.hold) {
    const rate = it.hold.rate === 0 ? 0 : clamp(Number(clip.fxParams?.[it.hold.rateParam] ?? 6), 1, 60);
    const step = rate === 0 ? 0 : Math.floor(local * rate);
    srcCanvas = holdFrame(`hold:${clip.id}`, W, H, step, snap.canvas);
  }
  let res = null;
  if (passes.length) res = runGL(srcCanvas, passes, W, H, local);
  const out = res || srcCanvas;
  if (out === snap.canvas) return true; // nada que cambiar
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(out, 0, 0, W, H);
  ctx.restore();
  void pr;
  return true;
}
