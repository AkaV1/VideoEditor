// Utilidades compartidas por los efectos: contexto de dibujo, ruido, remapeo de píxeles y filtros SVG.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (p) => p * p * (3 - 2 * p);
export const easeOut = (p) => 1 - (1 - p) ** 3;
export const easeIn = (p) => p ** 3;
export const easeInOut = (p) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
export const easeOutBack = (p) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};
export const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
export const easeOutBounce = (p) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
  if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
  return n1 * (p -= 2.625 / d1) * p + 0.984375;
};

/** Ruido determinista en [0,1) a partir de un número. */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const hash2 = (a, b) => hash(a * 57.0 + b * 113.0 + 7.3);

/** Ruido suave en el tiempo (valor entre -1 y 1). */
export function wave(t, seed = 0) {
  return 0.5 * (Math.sin(t * 37.0 + seed * 1.7) + Math.sin(t * 23.3 + seed * 3.1 + 1.3));
}
/** Ruido de valor interpolado: cambia suavemente entre muestras aleatorias. */
export function vnoise(t, seed = 0) {
  const i = Math.floor(t);
  const f = smooth(t - i);
  return lerp(hash(i + seed * 31) * 2 - 1, hash(i + 1 + seed * 31) * 2 - 1, f);
}

export function hexRgb(hex) {
  const h = String(hex || '#000').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
export const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${clamp(a, 0, 1).toFixed(3)})`;
export const hsl = (h, s, l, a = 1) => `hsla(${Math.round(h) % 360},${s}%,${l}%,${clamp(a, 0, 1).toFixed(3)})`;

// ------------------------------------------------------------------ lienzos
const pool = new Map();
/** Lienzo pequeño con lectura frecuente (para operaciones por píxel). */
export function pixelCanvas(name, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let it = pool.get(name);
  if (!it) {
    const canvas = document.createElement('canvas');
    it = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
    pool.set(name, it);
  }
  if (it.canvas.width !== w || it.canvas.height !== h) {
    it.canvas.width = w;
    it.canvas.height = h;
  }
  return it;
}

const noiseTiles = [];
/** Baldosas de ruido gris 128×128 (se reutilizan; el movimiento viene del desplazamiento aleatorio). */
export function noiseTile(i = 0, color = false) {
  const idx = (i % 6) + (color ? 6 : 0);
  if (noiseTiles[idx]) return noiseTiles[idx];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let p = 0; p < img.data.length; p += 4) {
    if (color) {
      img.data[p] = Math.random() * 255;
      img.data[p + 1] = Math.random() * 255;
      img.data[p + 2] = Math.random() * 255;
    } else {
      img.data[p] = img.data[p + 1] = img.data[p + 2] = Math.random() * 255;
    }
    img.data[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  noiseTiles[idx] = c;
  return c;
}

/** Rellena el rectángulo con ruido (patrón) usando el modo de mezcla y opacidad indicados. */
export function fillNoise(ctx, W, H, frameIdx, { alpha = 0.2, op = 'overlay', color = false, scale = 1 } = {}) {
  const pat = ctx.createPattern(noiseTile(frameIdx, color), 'repeat');
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.globalCompositeOperation = op;
  const ox = hash(frameIdx * 3.1) * 128;
  const oy = hash(frameIdx * 5.7) * 128;
  ctx.translate(-ox * scale, -oy * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, (W + 256) / scale, (H + 256) / scale);
  ctx.restore();
}

// ----------------------------------------------------------- filtros SVG
let svgRoot = null;
const svgDone = new Set();
/** Registra (una vez) un filtro SVG y devuelve la cadena `url(#id)` para ctx.filter. */
export function svgFilter(id, inner) {
  if (typeof document === 'undefined') return 'none';
  if (!svgRoot) {
    svgRoot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgRoot.setAttribute('width', '0');
    svgRoot.setAttribute('height', '0');
    svgRoot.setAttribute('aria-hidden', 'true');
    svgRoot.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    svgRoot.innerHTML = '<defs></defs>';
    document.body.appendChild(svgRoot);
  }
  if (!svgDone.has(id)) {
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    f.setAttribute('id', id);
    f.setAttribute('color-interpolation-filters', 'sRGB');
    f.setAttribute('x', '0');
    f.setAttribute('y', '0');
    f.setAttribute('width', '100%');
    f.setAttribute('height', '100%');
    f.innerHTML = inner;
    svgRoot.querySelector('defs').appendChild(f);
    svgDone.add(id);
  }
  return `url(#${id})`;
}

// ------------------------------------------------------ contexto de dibujo
/**
 * Contexto que reciben los efectos. `ctx` contiene lo que hay que modificar (la capa de un clip o el
 * fotograma completo); siempre llega con transformación identidad, opacidad 1 y modo normal.
 */
export function makeX(ctx, W, H, k, scratch, extra = {}) {
  const X = {
    ctx, W, H, k, scratch, t: 0, dur: 1, seed: 0, q: 1, p: 0, opaque: false,
    ...extra,
  };
  /** Copia lo dibujado hasta ahora en un lienzo auxiliar y lo devuelve. */
  X.snap = (name = 'fxA') => {
    const s = scratch.get(name, W, H);
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx.globalAlpha = 1;
    s.ctx.globalCompositeOperation = 'source-over';
    s.ctx.filter = 'none';
    s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    s.ctx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, W, H);
    return s.canvas;
  };
  /** Vacía el lienzo y dibuja de nuevo a partir de una copia: fn(copia). */
  X.replace = (fn, name = 'fxA') => {
    const src = X.snap(name);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.clearRect(0, 0, W, H);
    fn(src);
    ctx.restore();
  };
  /**
   * Dibuja encima del contenido con el modo de mezcla `op`. Si la capa tiene transparencia, lo dibujado
   * se recorta al contenido existente (los efectos no «manchan» fuera del clip).
   */
  X.over = (fn, op = 'source-atop') => {
    const mask = !X.opaque && op !== 'source-atop' ? X.snap('fxM') : null;
    ctx.save();
    ctx.globalCompositeOperation = op;
    fn(ctx);
    ctx.restore();
    if (mask) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.filter = 'none';
      ctx.drawImage(mask, 0, 0, W, H, 0, 0, W, H);
      ctx.restore();
    }
  };
  X.tmp = (name, w, h) => scratch.get(name, w, h);
  return X;
}

/**
 * Remapea los píxeles: fn(u, v) → [su, sv] (coordenadas de origen normalizadas 0..1, o null si queda vacío).
 * Se calcula a baja resolución (maxDim) y se escala: es lo bastante rápido para tiempo real.
 */
export function remap(X, fn, maxDim = 360) {
  const { ctx, W, H } = X;
  const s = Math.min(1, (maxDim * X.q) / Math.max(W, H));
  const w = Math.max(8, Math.round(W * s));
  const h = Math.max(8, Math.round(H * s));
  const a = pixelCanvas('remapA', w, h);
  a.ctx.setTransform(1, 0, 0, 1, 0, 0);
  a.ctx.globalCompositeOperation = 'copy';
  a.ctx.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, w, h);
  const src = a.ctx.getImageData(0, 0, w, h);
  const out = a.ctx.createImageData(w, h);
  const sd = src.data;
  const od = out.data;
  const tmp = [0, 0];
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const r = fn(u, v, tmp);
      const o = (y * w + x) * 4;
      if (!r) continue;
      let sx = r[0] * w - 0.5;
      let sy = r[1] * h - 0.5;
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      sx -= x0;
      sy -= y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;
      const w00 = (1 - sx) * (1 - sy);
      const w10 = sx * (1 - sy);
      const w01 = (1 - sx) * sy;
      const w11 = sx * sy;
      od[o] = sd[i00] * w00 + sd[i10] * w10 + sd[i01] * w01 + sd[i11] * w11;
      od[o + 1] = sd[i00 + 1] * w00 + sd[i10 + 1] * w10 + sd[i01 + 1] * w01 + sd[i11 + 1] * w11;
      od[o + 2] = sd[i00 + 2] * w00 + sd[i10 + 2] * w10 + sd[i01 + 2] * w01 + sd[i11 + 2] * w11;
      od[o + 3] = sd[i00 + 3] * w00 + sd[i10 + 3] * w10 + sd[i01 + 3] * w01 + sd[i11 + 3] * w11;
    }
  }
  const b = pixelCanvas('remapB', w, h);
  b.ctx.putImageData(out, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b.canvas, 0, 0, w, h, 0, 0, W, H);
  ctx.restore();
}

/** Dibuja una estrella de n puntas (para destellos). */
export function starPath(ctx, cx, cy, r, points = 4, inner = 0.28, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
