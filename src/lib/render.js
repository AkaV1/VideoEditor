// Dibujo de un fotograma del proyecto en un canvas 2D.
// Es una función pura respecto al estado: la usan la vista previa y la exportación.
import { blendOp, fontCss, lutCss } from './presets.js';
import { clamp } from './time.js';
import { evalTransform } from './keyframes.js';

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/** Lienzos auxiliares reutilizables (evita crear canvas en cada fotograma). */
export class Scratch {
  constructor() {
    this.items = new Map();
  }
  get(name, w, h) {
    w = Math.max(1, Math.ceil(w));
    h = Math.max(1, Math.ceil(h));
    let it = this.items.get(name);
    if (!it) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      it = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: false }) };
      this.items.set(name, it);
    } else if (it.canvas.width < w || it.canvas.height < h) {
      it.canvas.width = Math.max(it.canvas.width, w);
      it.canvas.height = Math.max(it.canvas.height, h);
    }
    return it;
  }
}

const easeOut = (p) => 1 - Math.pow(1 - p, 3);

// ------------------------------------------------------------------ color
export function colorFilter(c) {
  const bf = Math.max(0, (1 + c.brightness / 100) * (1 + c.exposure / 125));
  const cf = Math.max(0, 1 + c.contrast / 100);
  const sf = Math.max(0, 1 + c.saturation / 100);
  const parts = [];
  if (Math.abs(bf - 1) > 1e-3) parts.push(`brightness(${bf.toFixed(3)})`);
  if (Math.abs(cf - 1) > 1e-3) parts.push(`contrast(${cf.toFixed(3)})`);
  if (Math.abs(sf - 1) > 1e-3) parts.push(`saturate(${sf.toFixed(3)})`);
  const lut = lutCss(c.lut);
  if (lut) parts.push(lut);
  return parts.join(' ');
}
const needsAdvancedColor = (c) => !!(c.temperature || c.shadows || c.highlights);

// ------------------------------------------------------------------ texto
export function fontString(st, k, emoji = false) {
  const family = emoji ? EMOJI_FONT : fontCss(st.font);
  return `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${Math.max(1, st.size * k)}px ${family}`;
}

export function layoutText(ctx, clip, k) {
  const st = clip.style;
  const emoji = clip.type === 'sticker';
  ctx.save();
  ctx.font = fontString(st, k, emoji);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(st.letterSpacing || 0) * k}px`;
  const size = st.size * k;
  const lines = String(clip.text ?? '').split('\n');
  const widths = lines.map((l) => ctx.measureText(l).width);
  ctx.restore();
  const lh = size * (emoji ? 1.15 : st.lineSpacing);
  const textW = Math.max(size * 0.5, ...widths);
  const textH = lh * lines.length;
  const pad = st.bgEnabled ? size * 0.25 : 0;
  const strokePad = (st.strokeWidth || 0) * k;
  return { lines, widths, lh, textW, textH, pad, w: textW + pad * 2 + strokePad * 2, h: textH + pad * 2 + strokePad };
}

function hexWithAlpha(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawText(ctx, clip, k, L) {
  const st = clip.style;
  const emoji = clip.type === 'sticker';
  const size = st.size * k;
  ctx.save();
  if (st.bgEnabled) {
    ctx.fillStyle = hexWithAlpha(st.bgColor, st.bgOpacity / 100);
    const r = size * 0.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-L.w / 2, -L.h / 2, L.w, L.h, r);
    else ctx.rect(-L.w / 2, -L.h / 2, L.w, L.h);
    ctx.fill();
  }
  ctx.font = fontString(st, k, emoji);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(st.letterSpacing || 0) * k}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = st.align || 'center';
  ctx.lineJoin = 'round';
  const x = st.align === 'left' ? -L.textW / 2 : st.align === 'right' ? L.textW / 2 : 0;
  const top = -L.textH / 2;
  const hasStroke = !emoji && st.strokeWidth > 0;
  L.lines.forEach((line, i) => {
    const y = top + L.lh * (i + 0.5);
    if (hasStroke) {
      ctx.shadowColor = st.shadow ? st.shadowColor : 'transparent';
      ctx.shadowBlur = (st.shadow ? st.shadowBlur : 0) * k;
      ctx.shadowOffsetX = (st.shadow ? st.shadowX : 0) * k;
      ctx.shadowOffsetY = (st.shadow ? st.shadowY : 0) * k;
      ctx.lineWidth = st.strokeWidth * k * 2;
      ctx.strokeStyle = st.strokeColor;
      ctx.strokeText(line, x, y);
      ctx.shadowColor = 'transparent';
    } else if (st.shadow) {
      ctx.shadowColor = st.shadowColor;
      ctx.shadowBlur = st.shadowBlur * k;
      ctx.shadowOffsetX = st.shadowX * k;
      ctx.shadowOffsetY = st.shadowY * k;
    }
    ctx.fillStyle = st.color;
    ctx.fillText(line, x, y);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
}

// ------------------------------------------------------- geometría de clip
/** Tamaño natural (escala 100%) en píxeles del lienzo, sin transformaciones. */
export function naturalSize(clip, src, W, H, k, measureCtx) {
  if (clip.type === 'text' || clip.type === 'sticker') {
    const L = layoutText(measureCtx, clip, k);
    return { w: L.w, h: L.h };
  }
  if (clip.type === 'video' || clip.type === 'image') {
    if (!src || !src.w || !src.h) return null;
    const c = clip.crop;
    const sW = src.w * (1 - (c.left + c.right) / 100);
    const sH = src.h * (1 - (c.top + c.bottom) / 100);
    if (sW <= 1 || sH <= 1) return null;
    const fit = Math.min(W / sW, H / sH);
    return { w: sW * fit, h: sH * fit };
  }
  return null;
}

/** Caja del clip en el lienzo: centro, tamaño y rotación (ya con escala y posición). */
export function clipBox(clip, src, W, H, k, measureCtx, t = null) {
  const n = naturalSize(clip, src, W, H, k, measureCtx);
  if (!n) return null;
  const tf = t === null ? clip.transform : evalTransform(clip, t - clip.start);
  const s = tf.scale / 100;
  return {
    cx: W / 2 + tf.x * k,
    cy: H / 2 + tf.y * k,
    w: n.w * s,
    h: n.h * s,
    rot: tf.rotation,
  };
}

// ------------------------------------------------------------------ clips
function drawVisual(ctx, clip, src, W, H, scratch) {
  const sw = src.w;
  const sh = src.h;
  if (!sw || !sh) return;
  const c = clip.crop;
  const sx = (sw * c.left) / 100;
  const sy = (sh * c.top) / 100;
  const sW = sw * (1 - (c.left + c.right) / 100);
  const sH = sh * (1 - (c.top + c.bottom) / 100);
  if (sW <= 1 || sH <= 1) return;
  const fit = Math.min(W / sW, H / sH);
  const dw = sW * fit;
  const dh = sH * fit;
  const col = clip.color;
  const f = colorFilter(col);

  if (!needsAdvancedColor(col)) {
    if (f) ctx.filter = f;
    ctx.drawImage(src.el, sx, sy, sW, sH, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
    return;
  }

  // Ruta con lienzo auxiliar: temperatura, sombras e iluminación
  const tw = Math.ceil(dw);
  const th = Math.ceil(dh);
  const s = scratch.get('color', tw, th);
  const sc = s.ctx;
  sc.save();
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, s.canvas.width, s.canvas.height);
  sc.filter = f || 'none';
  sc.drawImage(src.el, sx, sy, sW, sH, 0, 0, tw, th);
  sc.filter = 'none';
  if (col.temperature) {
    sc.globalCompositeOperation = 'source-atop';
    sc.fillStyle = col.temperature > 0
      ? `rgba(255,150,40,${(col.temperature / 100) * 0.3})`
      : `rgba(60,130,255,${(-col.temperature / 100) * 0.3})`;
    sc.fillRect(0, 0, tw, th);
  }
  if (col.shadows) {
    sc.globalCompositeOperation = 'soft-light';
    sc.fillStyle = col.shadows > 0
      ? `rgba(255,255,255,${(col.shadows / 100) * 0.6})`
      : `rgba(0,0,0,${(-col.shadows / 100) * 0.6})`;
    sc.fillRect(0, 0, tw, th);
  }
  if (col.highlights) {
    sc.globalCompositeOperation = col.highlights > 0 ? 'color-dodge' : 'multiply';
    sc.fillStyle = col.highlights > 0
      ? `rgba(255,255,255,${(col.highlights / 100) * 0.22})`
      : `rgba(190,190,190,${(-col.highlights / 100) * 0.55})`;
    sc.fillRect(0, 0, tw, th);
  }
  sc.restore();
  ctx.drawImage(s.canvas, 0, 0, tw, th, -dw / 2, -dh / 2, dw, dh);
}

function drawClip(ctx, W, H, k, clip, t, src, scratch, measureCtx) {
  const local = t - clip.start;
  const tf = evalTransform(clip, local);
  let alpha = tf.opacity / 100;
  let sc = tf.scale / 100;
  let dx = tf.x * k;
  let dy = tf.y * k;
  let rot = (tf.rotation * Math.PI) / 180;
  let wipe = null;

  const tr = clip.transitionIn;
  if (tr && tr.duration > 0 && local < tr.duration) {
    const p = clamp(local / tr.duration, 0, 1);
    const e = easeOut(p);
    switch (tr.type) {
      case 'fade': alpha *= p; break;
      case 'zoomIn': sc *= 0.55 + 0.45 * e; alpha *= e; break;
      case 'zoomOut': sc *= 1.5 - 0.5 * e; alpha *= e; break;
      case 'slideLeft': dx += (1 - e) * W; break;
      case 'slideRight': dx -= (1 - e) * W; break;
      case 'slideUp': dy += (1 - e) * H; break;
      case 'wipeRight': wipe = [0, 0, W * e, H]; break;
      case 'wipeDown': wipe = [0, 0, W, H * e]; break;
      case 'spin': rot += (1 - e) * Math.PI; sc *= e; alpha *= e; break;
      default: break;
    }
  }
  if (alpha <= 0.001 || sc === 0) return;

  const isText = clip.type === 'text' || clip.type === 'sticker';
  let L = null;
  if (isText) L = layoutText(measureCtx, clip, k);
  else if (!src) return;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.globalCompositeOperation = blendOp(tf.blend);
  if (wipe) {
    ctx.beginPath();
    ctx.rect(wipe[0], wipe[1], wipe[2], wipe[3]);
    ctx.clip();
  }
  ctx.translate(W / 2 + dx, H / 2 + dy);
  ctx.rotate(rot);
  ctx.scale(sc * (tf.flipH ? -1 : 1), sc * (tf.flipV ? -1 : 1));
  if (isText) drawText(ctx, clip, k, L);
  else drawVisual(ctx, clip, src, W, H, scratch);
  ctx.restore();
}

// ---------------------------------------------------------------- efectos
function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

let noiseTile = null;
function getNoise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

function applyEffect(ctx, W, H, k, clip, local, scratch) {
  const p = clamp((clip.intensity ?? 100) / 100, 0, 1.5);
  const copy = () => {
    const s = scratch.get('fx', W, H);
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx.globalCompositeOperation = 'source-over';
    s.ctx.clearRect(0, 0, W, H);
    s.ctx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, W, H);
    return s.canvas;
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  switch (clip.effectId) {
    case 'blur': {
      const src = copy();
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.filter = `blur(${(12 * p * k).toFixed(1)}px)`;
      ctx.drawImage(src, 0, 0);
      break;
    }
    case 'glitch': {
      const src = copy();
      const r = rng(Math.floor(local * 12) + 7);
      for (let i = 0; i < 6; i++) {
        const y = r() * H;
        const h = r() * H * 0.12 + 4;
        const dx = (r() - 0.5) * W * 0.14 * p;
        ctx.drawImage(src, 0, y, W, h, dx, y, W, h);
      }
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(0,242,254,${0.06 * p})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'rgbsplit': {
      const src = copy();
      const t = scratch.get('fx2', W, H);
      const off = 7 * k * p * (1 + 0.5 * Math.sin(local * 8));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      [['#ff0000', -off], ['#00ff00', 0], ['#0000ff', off]].forEach(([col, o]) => {
        t.ctx.setTransform(1, 0, 0, 1, 0, 0);
        t.ctx.globalCompositeOperation = 'source-over';
        t.ctx.clearRect(0, 0, W, H);
        t.ctx.drawImage(src, 0, 0);
        t.ctx.globalCompositeOperation = 'multiply';
        t.ctx.fillStyle = col;
        t.ctx.fillRect(0, 0, W, H);
        ctx.drawImage(t.canvas, 0, 0, W, H, o, 0, W, H);
      });
      break;
    }
    case 'shake': {
      const src = copy();
      const dx = Math.sin(local * 53) * 12 * k * p;
      const dy = Math.cos(local * 47) * 12 * k * p;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.scale(1.06, 1.06);
      ctx.drawImage(src, -W / 2, -H / 2);
      break;
    }
    case 'pulse': {
      const src = copy();
      const s = 1 + 0.08 * p * (0.5 + 0.5 * Math.sin(local * Math.PI * 4));
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.drawImage(src, -W / 2, -H / 2);
      break;
    }
    case 'flash': {
      const a = Math.max(0, 1 - ((local * 2) % 1) * 2.5) * 0.85 * Math.min(1, p);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'vignette': {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, 0.85 * p)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'grain': {
      const tile = getNoise();
      const pat = ctx.createPattern(tile, 'repeat');
      ctx.globalAlpha = Math.min(1, 0.2 * p);
      ctx.globalCompositeOperation = 'overlay';
      ctx.translate(Math.random() * 128, Math.random() * 128);
      ctx.fillStyle = pat;
      ctx.fillRect(-128, -128, W + 256, H + 256);
      break;
    }
    case 'cinebars': {
      const bh = H * 0.13 * Math.min(1, p);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bh);
      ctx.fillRect(0, H - bh, W, bh);
      break;
    }
    case 'mirror': {
      const src = copy();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H);
      break;
    }
    case 'pixel': {
      const src = copy();
      const px = Math.max(2, Math.round(10 * k * (0.4 + p)));
      const sw = Math.max(1, Math.round(W / px));
      const sh = Math.max(1, Math.round(H / px));
      const t = scratch.get('fx2', sw, sh);
      t.ctx.setTransform(1, 0, 0, 1, 0, 0);
      t.ctx.clearRect(0, 0, sw, sh);
      t.ctx.drawImage(src, 0, 0, W, H, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t.canvas, 0, 0, sw, sh, 0, 0, W, H);
      break;
    }
    case 'glow': {
      const src = copy();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, 0.7 * p);
      ctx.filter = `blur(${(14 * k).toFixed(1)}px) brightness(1.3)`;
      ctx.drawImage(src, 0, 0);
      break;
    }
    case 'hue': {
      const src = copy();
      ctx.filter = `hue-rotate(${Math.round((local * 160) % 360)}deg) saturate(${1 + 0.4 * p})`;
      ctx.drawImage(src, 0, 0);
      break;
    }
    case 'invert': {
      const src = copy();
      ctx.filter = `invert(${Math.min(1, p)})`;
      ctx.drawImage(src, 0, 0);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// --------------------------------------------------------------- fotograma
/**
 * Dibuja el proyecto en `ctx` (canvas de W×H) en el instante `t`.
 * `getSource(clip)` devuelve {el, w, h} para clips de video/imagen listos para dibujar.
 */
export function drawFrame(ctx, W, H, baseW, state, t, getSource, scratch, measureCtx) {
  const k = W / baseW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const tracks = state.tracks;
  for (let i = tracks.length - 1; i >= 0; i--) {
    const tr = tracks[i];
    if (tr.hidden || tr.kind === 'audio') continue;
    for (const c of tr.clips) {
      if (t < c.start || t >= c.start + c.duration) continue;
      if (c.type === 'effect') applyEffect(ctx, W, H, k, c, t - c.start, scratch);
      else drawClip(ctx, W, H, k, c, t, c.type === 'text' || c.type === 'sticker' ? null : getSource(c), scratch, measureCtx);
    }
  }
}
