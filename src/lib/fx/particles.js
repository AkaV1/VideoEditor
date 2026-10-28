// Partículas y clima (Canvas 2D). Cada partícula es una función determinista del tiempo (hash + fase),
// así la vista previa, el salto en la línea de tiempo y la exportación dan siempre el mismo resultado.
import { clamp, hash, hash2, hsl, rgba, hexRgb, easeOut, makeX } from './util.js';

export const PARTICLES = [];
const BYID = new Map();
export const getParticles = (id) => BYID.get(id) ?? null;
const P = (id, label, min, max, def, unit = '', step) => ({ id, label, min, max, def, unit, step: step ?? (max - min > 20 ? 1 : 0.05) });
const PSel = (id, label, options, def) => ({ id, label, type: 'select', options: options.map((o) => (Array.isArray(o) ? o : [o.value, o.label])), def });
const AMOUNT = { id: 'amount', label: 'Intensidad', min: 0, max: 100, def: 80, unit: '%' };
const fx = (_cat, id, label, tags, params, draw) => {
  const it = { kind: 'particles', id, label, tags, params: [AMOUNT, ...params], draw };
  PARTICLES.push(it);
  BYID.set(id, it);
};

/** Dibuja el emisor `id` sobre ctx (lienzo W×H, k = escala relativa). params en unidades de UI. */
export function drawParticles(ctx, W, H, k, t, id, raw, scratch) {
  const it = BYID.get(id);
  if (!it) return false;
  const p = {};
  for (const d of it.params) p[d.id] = raw && raw[d.id] !== undefined ? raw[d.id] : d.def;
  p.a = (p.amount ?? 80) / 100 * 1.25;
  const X = makeX(ctx, W, H, k, scratch, { t, opaque: false });
  X.opaque = true; // se dibuja sobre capa propia: sin recorte al contenido
  ctx.save();
  it.draw(X, p);
  ctx.restore();
  return true;
}

/** Edad normalizada (0..1) y número de ciclo de la partícula i. */
const life = (t, i, minL, maxL) => {
  const L = minL + hash(i * 3.7 + 1) * (maxL - minL);
  const x = t / L + hash(i * 1.3 + 5);
  return { age: x - Math.floor(x), cyc: Math.floor(x), L };
};

fx('particles', 'rain', 'Lluvia', ['lluvia', 'agua', 'tormenta', 'clima'], [P('count', 'Cantidad', 20, 500, 200, ''), P('angle', 'Inclinación', -30, 30, 12, '°'), PSel('tint', 'Oscurecer', [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }], 'yes')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const a = (p.angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  X.over(() => {
    if (p.tint === 'yes') {
      ctx.fillStyle = `rgba(20,30,50,${0.22 * p.a})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 0.35, 0.7);
      const len = (18 + hash(i * 2.2) * 34) * k;
      const x0 = hash2(i, cyc) * (W + H * 0.5) - H * 0.25;
      const travel = H + len * 2;
      const y = age * travel - len;
      const x = x0 + dx * (age * travel);
      ctx.strokeStyle = `rgba(200,220,255,${(0.25 + hash(i * 7.7) * 0.4) * clamp(p.a, 0, 1.2)})`;
      ctx.lineWidth = (0.7 + hash(i * 5.1) * 1.3) * k;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dx * len, y - dy * len);
      ctx.stroke();
    }
  }, 'source-over');
});

fx('particles', 'snow', 'Nieve', ['nieve', 'copos', 'invierno', 'clima'], [P('count', 'Cantidad', 10, 300, 120, ''), P('size', 'Tamaño', 1, 10, 4, ' px')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 4, 9);
      const depth = 0.35 + hash(i * 6.1) * 0.65;
      const x = hash2(i, cyc) * W + Math.sin(age * 12 + i) * 28 * k * depth;
      const y = -10 * k + age * (H + 20 * k);
      const r = (0.6 + depth * p.size * 0.6) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * depth * clamp(p.a, 0, 1.2)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, 'source-over');
});

fx('particles', 'confetti', 'Confeti', ['confeti', 'fiesta', 'celebración', 'cumpleaños'], [P('count', 'Cantidad', 20, 300, 120, '')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const cols = [330, 50, 180, 270, 120, 20, 210];
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 3, 5.5);
      const x = hash2(i, cyc) * W + Math.sin(age * 9 + i) * 40 * k;
      const y = -20 * k + age * (H + 40 * k) * (0.7 + hash(i * 2.9) * 0.6);
      const w = (5 + hash(i * 4.4) * 9) * k;
      const h = w * (0.5 + hash(i * 8.1) * 0.8);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(age * 14 * (hash(i * 9.2) - 0.5) + i);
      ctx.scale(1, Math.cos(age * 18 + i));
      ctx.fillStyle = hsl(cols[i % cols.length], 90, 58, clamp(p.a, 0, 1));
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }, 'source-over');
});

fx('particles', 'sparks', 'Chispas', ['chispas', 'fuego', 'soldadura', 'brasas'], [P('count', 'Cantidad', 10, 200, 60, ''), P('power', 'Fuerza', 20, 100, 60, '%')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const ox = W * 0.5;
  const oy = H * 0.85;
  X.over(() => {
    ctx.lineCap = 'round';
    for (let i = 0; i < p.count; i++) {
      const { age, cyc, L } = life(t, i, 0.7, 1.6);
      const ang = -Math.PI / 2 + (hash2(i, cyc) - 0.5) * 1.6;
      const sp = (0.35 + hash2(i + 9, cyc) * 0.65) * (p.power / 100) * H * 1.1;
      const ts = age * L;
      const x = ox + Math.cos(ang) * sp * ts;
      const y = oy + Math.sin(ang) * sp * ts + 0.5 * H * 1.4 * ts * ts;
      const vx = Math.cos(ang) * sp;
      const vy = Math.sin(ang) * sp + H * 1.4 * ts;
      const al = (1 - age) ** 1.3 * clamp(p.a, 0, 1.2);
      ctx.strokeStyle = `rgba(255,${170 + hash(i) * 70 | 0},${60 + hash(i * 2) * 60 | 0},${al})`;
      ctx.lineWidth = (1 + hash(i * 3.3) * 2) * k;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - vx * 0.035, y - vy * 0.035);
      ctx.stroke();
    }
  }, 'lighter');
});

fx('particles', 'fire', 'Fuego', ['fuego', 'llamas', 'incendio', 'calor'], [P('count', 'Cantidad', 20, 200, 90, ''), P('height', 'Altura', 15, 80, 45, '%')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    const g = ctx.createLinearGradient(0, H, 0, H * (1 - p.height / 100));
    g.addColorStop(0, `rgba(255,90,10,${0.35 * p.a})`);
    g.addColorStop(1, 'rgba(255,90,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * (1 - p.height / 100), W, H * (p.height / 100));
  }, 'screen');
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 0.7, 1.3);
      const bx = hash2(i, cyc) * W;
      const x = bx + Math.sin(age * 9 + i * 2) * 22 * k * age;
      const y = H + 10 * k - age * H * (p.height / 100) * (0.7 + hash(i * 3) * 0.5);
      const r = (46 - 38 * age) * k * (0.6 + hash(i * 5) * 0.8);
      const hue = 52 - 50 * age;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hsl(hue, 100, 62 - 18 * age, 0.55 * (1 - age) * clamp(p.a, 0, 1.2)));
      g.addColorStop(1, hsl(hue - 10, 100, 40, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, 'lighter');
});

fx('particles', 'smoke', 'Humo', ['humo', 'vapor', 'niebla', 'ceniza'], [P('count', 'Cantidad', 5, 60, 22, ''), PSel('tone', 'Color', [{ value: 'gray', label: 'Gris' }, { value: 'white', label: 'Blanco' }, { value: 'black', label: 'Negro' }], 'gray')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const c = p.tone === 'white' ? '240,240,245' : p.tone === 'black' ? '25,25,28' : '140,140,150';
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 3, 6);
      const x = W * (0.2 + hash2(i, cyc) * 0.6) + Math.sin(age * 5 + i) * 50 * k + age * 60 * k;
      const y = H * 1.05 - age * H * 1.0;
      const r = (50 + age * 140) * k;
      const al = Math.sin(age * Math.PI) * 0.32 * clamp(p.a, 0, 1.3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c},${al})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, 'source-over');
});

fx('particles', 'bubbles', 'Burbujas', ['burbujas', 'agua', 'espuma', 'submarino'], [P('count', 'Cantidad', 5, 100, 36, '')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 3, 7);
      const r = (6 + hash(i * 3.3) * 26) * k;
      const x = hash2(i, cyc) * W + Math.sin(age * 10 + i) * 18 * k;
      const y = H + r - age * (H + r * 2);
      const al = clamp(p.a, 0, 1.2);
      ctx.strokeStyle = `rgba(220,245,255,${0.7 * al})`;
      ctx.lineWidth = Math.max(1, 1.6 * k);
      ctx.fillStyle = `rgba(200,235,255,${0.12 * al})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.75 * al})`;
      ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.22, r * 0.12, -0.6, 0, 7); ctx.fill();
    }
  }, 'source-over');
});

fx('particles', 'dust', 'Polvo', ['polvo', 'partículas', 'motas', 'atmósfera'], [P('count', 'Cantidad', 10, 300, 90, '')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const depth = 0.3 + hash(i * 2.2) * 0.7;
      const x = (hash(i * 3.1) * W + t * 12 * k * depth + Math.sin(t * 0.7 + i) * 20 * k) % W;
      const y = (hash(i * 5.3) * H - t * 8 * k * depth + Math.cos(t * 0.5 + i * 2) * 14 * k + H * 4) % H;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.5 + i * 3);
      const r = (0.8 + depth * 2.8) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, `rgba(255,250,235,${0.6 * tw * depth * clamp(p.a, 0, 1.2)})`);
      g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 2, 0, 7); ctx.fill();
    }
  }, 'lighter');
});

fx('particles', 'leaves', 'Hojas', ['hojas', 'otoño', 'viento', 'naturaleza'], [P('count', 'Cantidad', 5, 100, 28, '')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const cols = [28, 38, 18, 48, 8];
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const { age, cyc } = life(t, i, 5, 9);
      const x = hash2(i, cyc) * W * 1.2 - W * 0.1 + Math.sin(age * 8 + i) * 60 * k + age * 120 * k;
      const y = -30 * k + age * (H + 60 * k);
      const s = (9 + hash(i * 4.1) * 14) * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(age * 6 + i) * 1.2 + age * 3);
      ctx.scale(1, 0.55 + 0.45 * Math.cos(age * 7 + i));
      ctx.fillStyle = hsl(cols[i % cols.length], 78, 44, clamp(p.a, 0, 1));
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.9, -s * 0.4, s * 0.7, s * 0.7, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.9, -s * 0.4, 0, -s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,30,10,0.55)';
      ctx.lineWidth = Math.max(1, k);
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
      ctx.restore();
    }
  }, 'source-over');
});

fx('particles', 'lightorbs', 'Partículas luminosas', ['luciérnagas', 'bokeh', 'luces', 'orbes', 'magia'], [P('count', 'Cantidad', 5, 80, 26, ''), P('hue', 'Tono', 0, 360, 45, '°'), P('size', 'Tamaño', 4, 60, 22, ' px')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    for (let i = 0; i < p.count; i++) {
      const x = (hash(i * 3.3) * W + Math.sin(t * (0.3 + hash(i) * 0.5) + i) * 80 * k + W) % W;
      const y = (hash(i * 7.1) * H + Math.cos(t * (0.25 + hash(i * 2) * 0.4) + i * 2) * 60 * k + H) % H;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + hash(i * 5) * 2) + i * 4));
      const r = (p.size * (0.4 + hash(i * 9.9) * 0.9)) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hsl(p.hue + hash(i) * 40, 90, 70, 0.85 * tw * clamp(p.a, 0, 1.2)));
      g.addColorStop(0.45, hsl(p.hue + hash(i) * 40, 90, 60, 0.3 * tw));
      g.addColorStop(1, hsl(p.hue, 90, 50, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  }, 'lighter');
});

fx('particles', 'fog', 'Niebla', ['niebla', 'bruma', 'misterio', 'atmósfera'], [P('density', 'Densidad', 10, 100, 55, '%')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  X.over(() => {
    for (let i = 0; i < 8; i++) {
      const sp = 14 + hash(i * 3.1) * 18;
      const r = (Math.max(W, H) * (0.3 + hash(i * 5.3) * 0.25));
      const x = ((hash(i * 7.9) * W * 1.6 + t * sp * k) % (W * 1.6)) - W * 0.3;
      const y = H * (0.45 + hash(i * 2.2) * 0.5) + Math.sin(t * 0.3 + i) * 18 * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const al = 0.2 * (p.density / 55) * clamp(p.a, 0, 1.3);
      g.addColorStop(0, `rgba(225,232,240,${al})`);
      g.addColorStop(1, 'rgba(225,232,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, 'screen');
});

fx('particles', 'lightning', 'Rayos', ['rayos', 'relámpago', 'tormenta', 'trueno'], [P('rate', 'Frecuencia', 0.2, 3, 0.8, ' /s', 0.1)], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const T = t * p.rate;
  const cyc = Math.floor(T);
  const ph = T - cyc;
  if (hash(cyc * 1.9) < 0.15) return;
  const dur = 0.35;
  if (ph > dur) return;
  const e = 1 - ph / dur;
  const flick = ph < 0.12 ? 1 : 0.5 + 0.5 * Math.sin(ph * 90);
  const bolt = (x, y, len, depth, w) => {
    const pts = [[x, y]];
    let cx = x;
    let cy = y;
    const steps = Math.max(6, Math.round(len / (H * 0.05)));
    for (let i = 0; i < steps; i++) {
      cx += (hash2(cyc + depth * 7, i + len) - 0.5) * W * 0.09;
      cy += len / steps;
      pts.push([cx, cy]);
      if (depth < 2 && hash2(cyc + depth * 3, i * 1.7) > 0.86) bolt(cx, cy, len * 0.45, depth + 1, w * 0.6);
    }
    X.over(() => {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      [[w * 6, `rgba(120,160,255,${0.25 * e * flick})`], [w * 2.5, `rgba(190,215,255,${0.5 * e * flick})`], [w, `rgba(255,255,255,${0.95 * e * flick})`]].forEach(([lw, col]) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw * k;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
      });
    }, 'lighter');
  };
  bolt(W * (0.2 + hash(cyc * 4.1) * 0.6), -10, H * 0.95, 0, 2.2);
  X.over(() => {
    ctx.fillStyle = `rgba(200,220,255,${0.45 * e * e * flick * clamp(p.a, 0, 1.2)})`;
    ctx.fillRect(0, 0, W, H);
  }, 'lighter');
});

fx('particles', 'raindrops', 'Gotas en el cristal', ['gotas', 'cristal', 'ventana', 'lluvia', 'agua'], [P('count', 'Cantidad', 5, 80, 30, '')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const src = X.snap('fxA');
  for (let i = 0; i < p.count; i++) {
    const { age, cyc } = life(t, i, 4, 9);
    const x = hash2(i, cyc) * W;
    const slide = Math.max(0, age - 0.5) * 2;
    const y0 = hash2(i + 20, cyc) * H * 0.8;
    const y = y0 + slide * slide * H * 0.35;
    const r = (7 + hash(i * 4.3) * 13) * k * Math.min(1, age * 6);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(-1.5, -1.5);
    ctx.translate(-x, -y);
    ctx.globalAlpha = clamp(p.a, 0, 1);
    ctx.drawImage(src, 0, 0, W, H, 0, 0, W, H);
    ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * clamp(p.a, 0, 1)})`;
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.6 * clamp(p.a, 0, 1)})`;
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, 7); ctx.fill();
    if (slide > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.12 * clamp(p.a, 0, 1)})`;
      ctx.lineWidth = r * 0.5;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    }
  }
});

fx('particles', 'splashes', 'Salpicaduras', ['salpicaduras', 'gotas', 'impacto', 'pintura', 'agua'], [P('count', 'Gotas por salpicadura', 8, 40, 18, ''), PSel('color', 'Color', [{ value: '#8fd3ff', label: 'Agua' }, { value: '#ff3b5c', label: 'Rojo' }, { value: '#ffd23b', label: 'Amarillo' }, { value: '#ffffff', label: 'Blanco' }], '#8fd3ff')], (X, p) => {
  const { ctx, W, H, k, t } = X;
  const [r, g, b] = hexRgb(p.color);
  X.over(() => {
    for (let s = 0; s < 4; s++) {
      const period = 1.6 + hash(s * 2.3) * 1.2;
      const x = t / period + hash(s * 5.1);
      const cyc = Math.floor(x);
      const ph = x - cyc;
      const ox = (0.15 + hash2(s, cyc) * 0.7) * W;
      const oy = (0.25 + hash2(s + 9, cyc) * 0.55) * H;
      const e = easeOut(clamp(ph / 0.7, 0, 1));
      const fade = 1 - clamp((ph - 0.25) / 0.75, 0, 1);
      if (fade <= 0) continue;
      ctx.strokeStyle = rgba(r, g, b, 0.6 * fade * clamp(p.a, 0, 1));
      ctx.lineWidth = Math.max(1, 3 * k * (1 - e));
      ctx.beginPath(); ctx.arc(ox, oy, e * 70 * k, 0, 7); ctx.stroke();
      for (let i = 0; i < p.count; i++) {
        const ang = hash2(s * 31 + i, cyc) * Math.PI * 2;
        const sp = (0.3 + hash2(s * 17 + i, cyc + 3) * 0.9) * 160 * k;
        const tt = ph * 1.2;
        const x1 = ox + Math.cos(ang) * sp * tt;
        const y1 = oy + Math.sin(ang) * sp * tt + 420 * k * tt * tt;
        ctx.fillStyle = rgba(r, g, b, 0.9 * fade * clamp(p.a, 0, 1));
        ctx.beginPath(); ctx.arc(x1, y1, (1 + hash(i * 3.3) * 3) * k * (1 - ph * 0.5), 0, 7); ctx.fill();
      }
    }
  }, 'source-over');
});
