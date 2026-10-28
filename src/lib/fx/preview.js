// Miniaturas y vista previa en vivo de elementos del catálogo (misma ruta de render que el editor).
import { itemPasses, transitionStep, animStep, runGL, layer, perf } from './apply.js';
import { drawParticles } from './particles.js';
import { drawTextFx } from './textfx.js';
import { getItem } from './registry.js';
import { getAnim } from './anim.js';
import { getTextFx } from './textfx.js';
import { Scratch } from '../render.js';
import { buildAudioChain, getAudioFx, audioFxParams } from './audiofx.js';

const samples = new Map();
const scratch = new Scratch();
/** Escena de muestra con color, detalle y movimiento para que los efectos se aprecien. */
function sample(W, H) {
  const key = `${W}x${H}`;
  let c = samples.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b6fff'); g.addColorStop(0.55, '#ff9a5c'); g.addColorStop(1, '#2a2438');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ffe27a'; x.beginPath(); x.arc(W * 0.72, H * 0.3, H * 0.14, 0, 7); x.fill();
  x.fillStyle = '#1b1830';
  x.beginPath(); x.moveTo(0, H); x.lineTo(W * 0.22, H * 0.55); x.lineTo(W * 0.42, H * 0.8); x.lineTo(W * 0.62, H * 0.5); x.lineTo(W * 0.85, H * 0.82); x.lineTo(W, H * 0.6); x.lineTo(W, H); x.fill();
  x.fillStyle = '#e8456b'; x.fillRect(W * 0.12, H * 0.62, W * 0.12, H * 0.2);
  x.fillStyle = '#fff'; x.font = `bold ${Math.round(H * 0.2)}px sans-serif`; x.textAlign = 'center'; x.fillText('LineCut', W * 0.5, H * 0.45);
  x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = Math.max(1, H / 60);
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(W * i / 6, 0); x.lineTo(W * i / 6, H); x.stroke(); }
  samples.set(key, c);
  return c;
}

const tri = (t, period) => { const q = (t % period) / period; return q < 0.5 ? q * 2 : 2 - q * 2; };

/**
 * Dibuja el elemento en `ctx` (W×H) en el instante t (segundos de vista previa).
 * item = { kind, id }, params = valores de UI. Devuelve false si no se puede (p. ej. audio).
 */
export function renderPreview(ctx, W, H, item, params, t, opts = {}) {
  const { kind, id } = item;
  const base = sample(W, H);
  const k = W / 360;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const dur = 3;
  if (kind === 'fx' || kind === 'filter') {
    const it = getItem(kind, id);
    const passes = itemPasses(kind, id, params, { t, local: t, dur, p: 1, W, H });
    const src = layer('pv-src', W, H);
    src.ctx.drawImage(base, 0, 0);
    const res = it?.hold ? null : runGL(src.canvas, passes, W, H, t);
    ctx.drawImage(res || src.canvas, 0, 0, W, H);
    return true;
  }
  if (kind === 'particles') {
    ctx.drawImage(base, 0, 0);
    drawParticles(ctx, W, H, k, t, id, params, scratch);
    return true;
  }
  if (kind === 'transition' || kind === 'anim') {
    const st = { alpha: 1, sc: 1, dx: 0, dy: 0, rot: 0, wipe: null, sx: 1, sy: 1, fx: null, dip: null };
    const D = 1.4;
    let out = false;
    if (kind === 'transition') {
      const isOut = opts.side === 'out';
      const pp = Math.min(1, (t % 2) / D);
      out = isOut;
      transitionStep(st, { type: id, p: params }, isOut ? 1 - pp : pp, isOut, W, H, t, dur);
    } else {
      const it = getAnim(id);
      const slot = it?.slots?.[0] || 'in';
      const dd = 1.2;
      const fake = { duration: 4, anim: { [slot]: { id, duration: dd, p: params } } };
      const lt = slot === 'in' ? (t % 3) : slot === 'out' ? 4 - dd + ((t % 3) / 3) * dd : t;
      animStep(st, fake, slot === 'loop' ? t : lt, W, H);
    }
    const passes = st.fx || [];
    const ly = layer('pv-clip', W, H);
    ly.ctx.save();
    ly.ctx.translate(W / 2 + st.dx, H / 2 + st.dy); ly.ctx.rotate(st.rot);
    ly.ctx.scale(st.sc * st.sx, st.sc * st.sy);
    if (st.wipe) { /* las cortinillas se recortan en coordenadas de lienzo */ }
    ly.ctx.drawImage(base, -W / 2, -H / 2);
    ly.ctx.restore();
    if (st.wipe) {
      const m = layer('pv-wipe', W, H);
      m.ctx.drawImage(ly.canvas, 0, 0);
      ly.ctx.clearRect(0, 0, W, H);
      ly.ctx.save(); ly.ctx.beginPath(); ly.ctx.rect(st.wipe[0], st.wipe[1], st.wipe[2], st.wipe[3]); ly.ctx.clip(); ly.ctx.drawImage(m.canvas, 0, 0); ly.ctx.restore();
    }
    if (st.dip && st.dip[3] > 0) {
      ly.ctx.globalCompositeOperation = 'source-atop';
      ly.ctx.fillStyle = `rgba(${st.dip[0]},${st.dip[1]},${st.dip[2]},${Math.min(1, st.dip[3])})`;
      ly.ctx.fillRect(0, 0, W, H);
      ly.ctx.globalCompositeOperation = 'source-over';
    }
    const res = passes.length ? runGL(ly.canvas, passes, W, H, t) : null;
    // fondo de cuadros para ver la transparencia
    ctx.fillStyle = '#24242b'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2e2e36';
    const s = Math.max(6, H / 10);
    for (let y = 0; y < H; y += s) for (let x = ((y / s) % 2) * s; x < W; x += s * 2) ctx.fillRect(x, y, s, s);
    ctx.globalAlpha = Math.max(0, Math.min(1, st.alpha));
    ctx.drawImage(res || ly.canvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
    void out;
    return true;
  }
  if (kind === 'text') {
    const it = getTextFx(id);
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = 'rgba(10,10,24,.62)'; ctx.fillRect(0, 0, W, H);
    const size = H * 0.3;
    const st = { size: size / k, bold: true, italic: false, font: 'Inter, sans-serif', color: '#ffffff', strokeWidth: 0, strokeColor: '#000', shadow: false, align: 'center', letterSpacing: 0, shadowColor: '#000', shadowBlur: 0, shadowX: 0, shadowY: 0 };
    const text = 'Texto';
    ctx.save();
    ctx.font = `800 ${size}px Inter, sans-serif`;
    const w = ctx.measureText(text).width;
    ctx.restore();
    const L = { lines: [text], lh: size * 1.15, textW: w, textH: size * 1.15, w, h: size * 1.15 };
    const dd = it?.mode === 'loop' ? 99 : 1.2;
    const clip = { style: st, duration: it?.mode === 'out' ? 3 : 3 };
    const local = it?.mode === 'in' ? (t % 2.6) : it?.mode === 'out' ? 3 - 1.2 + ((t % 2.6) / 2.6) * 1.2 : t;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    drawTextFx(ctx, clip, k, L, local, { id, p: { ...params, duration: params?.duration ?? dd } }, { fontString: () => `800 ${size}px Inter, sans-serif` });
    ctx.restore();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- audio
let ac = null;
let playing = null;
/** Escucha un efecto de audio sobre una voz sintética corta (secuencia de notas con formantes). */
export function previewAudioFx(id, params) {
  stopAudioPreview();
  const it = getAudioFx(id);
  if (!it) return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ac = ac || new AC();
  ac.resume?.();
  const chain = buildAudioChain(ac, [{ id, p: audioFxParams(it, params) }]);
  const out = ac.createGain(); out.gain.value = 0.5;
  const src = ac.createGain();
  const notes = [220, 262, 330, 294, 247, 196];
  const now = ac.currentTime + 0.05;
  const stops = [];
  notes.forEach((f, i) => {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = i % 2 ? 1100 : 700; fl.Q.value = 3;
    const g = ac.createGain(); const t0 = now + i * 0.38;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.9, t0 + 0.04); g.gain.setValueAtTime(0.9, t0 + 0.28); g.gain.linearRampToValueAtTime(0, t0 + 0.36);
    o.connect(fl).connect(g).connect(src); o.start(t0); o.stop(t0 + 0.4); stops.push(o);
  });
  if (chain) { src.connect(chain.input); chain.output.connect(out); } else src.connect(out);
  out.connect(ac.destination);
  const total = notes.length * 0.38 + (id === 'reverb' || id === 'echo' ? 2.5 : 0.6);
  const timer = setTimeout(stopAudioPreview, total * 1000);
  playing = { chain, out, timer };
  return true;
}
export function stopAudioPreview() {
  if (!playing) return;
  clearTimeout(playing.timer);
  try { playing.out.disconnect(); } catch { /* ya */ }
  playing.chain?.dispose();
  playing = null;
}
export { perf };
