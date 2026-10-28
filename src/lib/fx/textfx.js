// Efectos de texto: animaciones de entrada, de salida y continuas, dibujadas letra a letra.
import { P, withDef } from './params.js';

export const TEXTFX = [];
const BY = new Map();
export const getTextFx = (id) => BY.get(id) ?? null;
const reg = (id, label, mode, params, tags = []) => {
  const it = { kind: 'text', id, label, mode, tags, params: params || [withDef(P.amount, 70), P.speed] };
  TEXTFX.push(it);
  BY.set(id, it);
};
const DUR = { id: 'duration', label: 'Duración', min: 0.2, max: 4, def: 1.2, unit: ' s', step: 0.1 };
const IN = [DUR, withDef(P.amount, 100)];

reg('typewriter', 'Máquina de escribir', 'in', IN, ['teclear']);
reg('handwriting', 'Escritura a mano', 'in', IN, ['trazo']);
reg('letters', 'Aparición por letras', 'in', IN);
reg('words', 'Aparición por palabras', 'in', IN);
reg('fadeT', 'Desvanecimiento', 'in', IN);
reg('bounceT', 'Rebote', 'in', IN);
reg('spinT', 'Giro', 'in', IN);
reg('slideT', 'Deslizamiento', 'in', IN);
reg('zoomT', 'Zoom', 'in', IN);
reg('maskreveal', 'Revelado por máscara', 'in', IN, ['máscara']);
reg('disappear', 'Desaparición', 'out', IN);
reg('glitchT', 'Glitch', 'loop', [withDef(P.amount, 70), P.speed]);
reg('neonT', 'Neón', 'loop', [withDef(P.amount, 80), P.speed, { ...P.color, def: '#00f2fe' }]);
reg('shadowT', 'Sombra animada', 'loop', [withDef(P.amount, 70), P.speed, { ...P.color, def: '#000000' }]);
reg('outlineT', 'Contorno animado', 'loop', [withDef(P.amount, 70), P.speed, { ...P.color, def: '#ffffff' }]);
reg('sparkleT', 'Destellos', 'loop', [withDef(P.amount, 70), P.speed, { ...P.color, def: '#fff6c2' }]);
reg('d3T', 'Efecto 3D', 'loop', [withDef(P.amount, 70), P.speed, { ...P.color, def: '#ff3b6b' }]);
reg('vibrateT', 'Vibración', 'loop', [withDef(P.amount, 60), P.speed]);
reg('pulseT', 'Pulsación', 'loop', [withDef(P.amount, 60), P.speed]);

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const E = (p) => 1 - Math.pow(1 - p, 3);
const bounceOut = (x) => {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
const rgbaOf = (hex, a) => {
  const h = String(hex || '#ffffff').replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16) || 0},${parseInt(h.slice(2, 4), 16) || 0},${parseInt(h.slice(4, 6), 16) || 0},${a})`;
};

function star(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
}

/**
 * Dibuja el texto con el efecto `fx` = {id, p:{...}}. `h` = { fontString, setFont } del renderizador.
 * El origen (0,0) es el centro del texto.
 */
export function drawTextFx(ctx, clip, k, L, local, fx, h) {
  const st = clip.style;
  const it = getTextFx(fx.id);
  if (!it) return false;
  const pr = { amount: 70, speed: 100, duration: 1.2, color: '#ffffff', ...(fx.p || {}) };
  const amt = pr.amount / 100;
  const spd = pr.speed / 100;
  const size = st.size * k;
  ctx.save();
  ctx.font = h.fontString(st, k, false);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(st.letterSpacing || 0) * k}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';

  // posiciones de cada carácter
  const units = [];
  let words = 0;
  const top = -L.textH / 2;
  L.lines.forEach((line, li) => {
    const w = ctx.measureText(line).width;
    const x0 = st.align === 'left' ? -L.textW / 2 : st.align === 'right' ? L.textW / 2 - w : -w / 2;
    const y = top + L.lh * (li + 0.5);
    let wi = words;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const pre = ctx.measureText(line.slice(0, i)).width;
      const cw = ctx.measureText(ch).width;
      if (ch === ' ') { words++; wi = words; }
      units.push({ ch, x: x0 + pre, y, w: cw, word: wi, idx: units.length });
    }
    words++;
  });
  const n = Math.max(1, units.length);
  const nWords = Math.max(1, words);
  const dur = Math.max(0.05, pr.duration);
  const pIn = clamp01(local / dur);
  const pOut = clamp01((clip.duration - local) / dur);
  const mode = it.mode;
  const p = mode === 'out' ? pOut : pIn;

  const strokeW = st.strokeWidth * k;
  const paint = (u, ox = 0, oy = 0, o = {}) => {
    if (u.ch === ' ') return;
    ctx.save();
    ctx.translate(u.x + u.w / 2 + ox, u.y + oy);
    if (o.rot) ctx.rotate(o.rot);
    if (o.sc !== undefined) ctx.scale(o.sc, o.sc);
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.textAlign = 'center';
    const fill = o.fill ?? st.color;
    if (o.shadow) { ctx.shadowColor = o.shadow.c; ctx.shadowBlur = o.shadow.b; ctx.shadowOffsetX = o.shadow.x || 0; ctx.shadowOffsetY = o.shadow.y || 0; }
    else if (st.shadow) { ctx.shadowColor = st.shadowColor; ctx.shadowBlur = st.shadowBlur * k; ctx.shadowOffsetX = st.shadowX * k; ctx.shadowOffsetY = st.shadowY * k; }
    if (strokeW > 0 && !o.noStroke) { ctx.lineWidth = strokeW * 2; ctx.strokeStyle = st.strokeColor; ctx.strokeText(u.ch, 0, 0); ctx.shadowColor = 'transparent'; }
    if (o.strokeOnly) { ctx.shadowColor = 'transparent'; ctx.lineWidth = o.strokeOnly.w; ctx.strokeStyle = o.strokeOnly.c; ctx.strokeText(u.ch, 0, 0); }
    else if (!o.noFill) { ctx.fillStyle = fill; ctx.fillText(u.ch, 0, 0); }
    ctx.restore();
  };
  const staggered = (i, total) => clamp01(p * (total + 3) - i) / 1;
  const prog = (i, total) => clamp01((p * (total + 3) - i) / 3);

  switch (fx.id) {
    case 'typewriter': {
      const shown = Math.floor(p * n + 0.0001);
      units.forEach((u, i) => { if (i < shown) paint(u); });
      if (pIn < 1 || Math.floor(local * 2) % 2 === 0) {
        const last = units[Math.min(shown, n - 1)];
        if (last) { const cx = shown >= n ? last.x + last.w : last.x; ctx.fillStyle = st.color; ctx.fillRect(cx + size * 0.04, last.y - size * 0.45, Math.max(2, size * 0.06), size * 0.9); }
      }
      break;
    }
    case 'handwriting':
      units.forEach((u, i) => {
        const q = prog(i, n);
        if (q <= 0) return;
        paint(u, 0, 0, { alpha: 1, noFill: q < 0.55, strokeOnly: q < 1 ? { w: Math.max(1.5, size * 0.03), c: st.color } : null, noStroke: false });
        if (q >= 0.55 && q < 1) { ctx.save(); ctx.globalAlpha = (q - 0.55) / 0.45; paint(u); ctx.restore(); }
      });
      break;
    case 'letters': units.forEach((u, i) => { const q = prog(i, n); if (q > 0) paint(u, 0, (1 - E(q)) * size * 0.3, { alpha: q }); }); break;
    case 'words': units.forEach((u) => { const q = clamp01((p * (nWords + 2) - u.word) / 2); if (q > 0) paint(u, 0, (1 - E(q)) * size * 0.25, { alpha: q }); }); break;
    case 'fadeT': ctx.globalAlpha *= p; units.forEach((u) => paint(u)); break;
    case 'bounceT': units.forEach((u, i) => { const q = prog(i, n); if (q > 0) paint(u, 0, -(1 - bounceOut(q)) * size * 1.2 * amt, { alpha: Math.min(1, q * 4) }); }); break;
    case 'spinT': units.forEach((u, i) => { const q = prog(i, n); if (q > 0) paint(u, 0, 0, { rot: (1 - E(q)) * Math.PI * 2 * amt, sc: Math.max(0.01, E(q)), alpha: q }); }); break;
    case 'slideT': units.forEach((u, i) => { const q = prog(i, n); if (q > 0) paint(u, -(1 - E(q)) * size * 3 * amt, 0, { alpha: Math.min(1, q * 3) }); }); break;
    case 'zoomT': units.forEach((u, i) => { const q = prog(i, n); if (q > 0) paint(u, 0, 0, { sc: 1 + (1 - E(q)) * 2.5 * amt, alpha: q }); }); break;
    case 'maskreveal': {
      ctx.save();
      const w = L.textW + size, hh = L.textH + size;
      ctx.beginPath(); ctx.rect(-w / 2, -hh / 2, w * E(p), hh); ctx.clip();
      units.forEach((u) => paint(u));
      ctx.restore();
      if (p < 1) { ctx.fillStyle = st.color; ctx.fillRect(-w / 2 + w * E(p) - 2, -hh / 2, 3, hh); }
      break;
    }
    case 'disappear': units.forEach((u, i) => { const q = prog(n - 1 - i, n); paint(u, 0, -(1 - q) * size * 0.3 * amt, { alpha: q }); }); break;
    case 'glitchT': {
      const tq = Math.floor(local * spd * 10);
      const j = (amt * size * 0.12);
      const shift = (hash(tq) - 0.5) * j * 2;
      [['#ff0044', -shift - j * 0.4], ['#00f2fe', shift + j * 0.4]].forEach(([c, o]) => {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.8;
        units.forEach((u) => paint(u, o, 0, { fill: c, noStroke: true, shadow: { c: 'transparent', b: 0 } }));
        ctx.restore();
      });
      units.forEach((u) => paint(u, hash(tq + u.idx) > 0.93 ? (hash(tq * 3 + u.idx) - 0.5) * j * 3 : 0, 0));
      break;
    }
    case 'neonT': {
      const fl = 0.75 + 0.25 * Math.sin(local * spd * 9) + (hash(Math.floor(local * spd * 12)) > 0.96 ? -0.4 : 0);
      const c = pr.color;
      for (let r = 3; r >= 1; r--) units.forEach((u) => paint(u, 0, 0, { fill: r === 1 ? '#ffffff' : c, noStroke: true, alpha: r === 1 ? 1 : 0.55 * fl, shadow: { c, b: size * 0.18 * r * amt * 2 * fl } }));
      break;
    }
    case 'shadowT': {
      const a = local * spd * 2;
      const d = size * 0.08 * amt * 2;
      units.forEach((u) => paint(u, 0, 0, { shadow: { c: rgbaOf(pr.color, 0.85), b: size * 0.05, x: Math.cos(a) * d, y: Math.sin(a) * d } }));
      break;
    }
    case 'outlineT': {
      units.forEach((u) => paint(u, 0, 0, { noStroke: true }));
      ctx.save(); ctx.setLineDash([size * 0.25, size * 0.12]); ctx.lineDashOffset = -local * spd * size * 0.8;
      units.forEach((u) => { if (u.ch === ' ') return; ctx.save(); ctx.translate(u.x + u.w / 2, u.y); ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, size * 0.04 * (0.7 + 0.5 * Math.sin(local * spd * 4)) * (0.5 + amt)); ctx.strokeStyle = `hsl(${(local * spd * 90) % 360},100%,70%)`;
        if (pr.color && pr.color !== '#ffffff') ctx.strokeStyle = pr.color; ctx.strokeText(u.ch, 0, 0); ctx.restore(); });
      ctx.restore();
      break;
    }
    case 'sparkleT': {
      units.forEach((u) => paint(u));
      ctx.fillStyle = pr.color; ctx.globalCompositeOperation = 'lighter';
      const N = Math.round(10 + amt * 24);
      for (let i = 0; i < N; i++) {
        const ph = (local * spd * 0.9 + hash(i * 7.3)) % 1; const tw = Math.sin(ph * Math.PI);
        const x = (hash(i * 3.1) - 0.5) * (L.textW + size * 0.4); const y = (hash(i * 5.7) - 0.5) * (L.textH + size * 0.2);
        ctx.globalAlpha = tw; star(ctx, x, y, size * (0.06 + 0.1 * hash(i * 9.1)) * tw * 1.5);
      }
      break;
    }
    case 'd3T': {
      const a = local * spd * 0.8; const dx = Math.cos(a) * size * 0.012; const dy = Math.sin(a) * size * 0.012 + size * 0.01;
      const depth = Math.round(6 + amt * 10);
      for (let d = depth; d >= 1; d--) units.forEach((u) => paint(u, dx * d, dy * d, { fill: pr.color, noStroke: true, shadow: { c: 'transparent', b: 0 } }));
      units.forEach((u) => paint(u));
      break;
    }
    case 'vibrateT': { const tq = Math.floor(local * spd * 40); units.forEach((u) => paint(u, (hash(tq + u.idx) - 0.5) * size * 0.05 * amt * 2, (hash(tq * 2 + u.idx) - 0.5) * size * 0.05 * amt * 2)); break; }
    case 'pulseT': { const s = 1 + Math.pow(0.5 + 0.5 * Math.sin(local * spd * 6), 2) * 0.18 * amt * 2; ctx.scale(s, s); units.forEach((u) => paint(u)); break; }
    default: units.forEach((u) => paint(u));
  }
  ctx.restore();
  return true;
}
