// Efectos de audio en tiempo real (Web Audio). Cada efecto construye un subgrafo { input, output, stop() }.
// Se aplican por clip entre el filtro y la ganancia, así también salen en la exportación.
import { P, withDef, sel } from './params.js';

export const AUDIO_FX = [];
const BY = new Map();
export const getAudioFx = (id) => BY.get(id) ?? null;
const reg = (id, label, params, build, tags = []) => {
  const it = { kind: 'audio', id, label, params, build, tags };
  AUDIO_FX.push(it);
  BY.set(id, it);
};
const MIX = withDef(P.amount, 100);
MIX.label = 'Mezcla';
const ST = (def, min = -12, max = 12) => ({ id: 'semi', label: 'Semitonos', min, max, def, unit: '', step: 1 });

const impulse = (ctx, sec, decay) => {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let seed = 12345 + c * 777;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / n, decay);
    }
  }
  return b;
};
const curve = (k) => {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
  return c;
};

/** Mezcla seca/húmeda: devuelve { input, output, wetIn, wetOut } */
function wetdry(ctx, mix) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  dry.gain.value = 1 - mix * 0.6 * (mix > 0.5 ? 1 : mix * 2 - mix);
  dry.gain.value = Math.max(0, 1 - mix);
  wet.gain.value = mix;
  input.connect(dry).connect(output);
  const wetIn = ctx.createGain();
  input.connect(wetIn);
  wet.connect(output);
  return { input, output, wetIn, wetOut: wet };
}

/** Cambio de tono real (sin cambiar la duración): dos líneas de retardo moduladas con ventana cruzada. */
function pitchShift(ctx, semi, stops) {
  const r = Math.pow(2, semi / 12);
  const W = 0.09;
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (Math.abs(semi) < 0.01) { input.connect(output); return { input, output }; }
  const sr = ctx.sampleRate;
  const n = Math.floor(W * sr);
  const slope = Math.abs(r - 1) * W;
  const mk = (off) => {
    const dBuf = ctx.createBuffer(1, n, sr), gBuf = ctx.createBuffer(1, n, sr);
    const dd = dBuf.getChannelData(0), gd = gBuf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const ph = (i / n + off) % 1;
      dd[i] = r > 1 ? slope * (1 - ph) : slope * ph;
      gd[i] = Math.sin(Math.PI * ph);
    }
    const dly = ctx.createDelay(1);
    dly.delayTime.value = 0;
    const g = ctx.createGain();
    g.gain.value = 0;
    const sd = ctx.createBufferSource(); sd.buffer = dBuf; sd.loop = true;
    const sg = ctx.createBufferSource(); sg.buffer = gBuf; sg.loop = true;
    sd.connect(dly.delayTime); sg.connect(g.gain);
    sd.start(); sg.start();
    stops.push(() => { try { sd.stop(); sg.stop(); } catch { /* ya parado */ } });
    input.connect(dly); dly.connect(g); g.connect(output);
  };
  mk(0); mk(0.5);
  return { input, output };
}

function lfo(ctx, type, freq, depth, target, stops) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g).connect(target); o.start();
  stops.push(() => { try { o.stop(); } catch { /* ya parado */ } });
  return o;
}

const chain = (ctx, nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return { input: nodes[0], output: nodes[nodes.length - 1] }; };
const filt = (ctx, type, f, q = 0.7, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };

reg('reverb', 'Reverberación', [{ ...MIX, def: 40 }, { id: 'size', label: 'Tamaño de sala', min: 0.3, max: 4, def: 1.8, unit: ' s', step: 0.1 }], (ctx, p, stops) => {
  const w = wetdry(ctx, p.amount / 100); const c = ctx.createConvolver(); c.buffer = impulse(ctx, p.size, 2.5);
  w.wetIn.connect(c).connect(w.wetOut); return w;
}, ['sala', 'eco', 'espacio']);
reg('echo', 'Eco', [{ ...MIX, def: 50 }, { id: 'time', label: 'Tiempo', min: 0.05, max: 1, def: 0.3, unit: ' s', step: 0.01 }, { id: 'fb', label: 'Repeticiones', min: 0, max: 90, def: 45, unit: '%' }], (ctx, p) => {
  const w = wetdry(ctx, p.amount / 100); const d = ctx.createDelay(2); d.delayTime.value = p.time; const f = ctx.createGain(); f.gain.value = p.fb / 100;
  w.wetIn.connect(d); d.connect(f).connect(d); d.connect(w.wetOut); return w;
});
reg('pitchup', 'Tono agudo', [ST(5, 1, 12)], (ctx, p, stops) => pitchShift(ctx, p.semi, stops), ['voz aguda', 'ardilla']);
reg('pitchdown', 'Tono grave', [ST(-5, -12, -1)], (ctx, p, stops) => pitchShift(ctx, p.semi, stops), ['voz grave']);
reg('chipmunk', 'Voz aguda', [], (ctx, p, stops) => { const ps = pitchShift(ctx, 7, stops); const h = filt(ctx, 'highshelf', 3500, 0.7, 5); ps.output.connect(h); return { input: ps.input, output: h }; }, ['ardilla']);
reg('deepvoice', 'Voz grave', [], (ctx, p, stops) => { const ps = pitchShift(ctx, -6, stops); const l = filt(ctx, 'lowshelf', 200, 0.7, 7); ps.output.connect(l); return { input: ps.input, output: l }; }, ['monstruo']);
reg('robot', 'Voz de robot', [{ ...MIX, def: 100 }, { id: 'freq', label: 'Frecuencia', min: 30, max: 400, def: 90, unit: ' Hz' }], (ctx, p, stops) => {
  const w = wetdry(ctx, p.amount / 100); const m = ctx.createGain(); m.gain.value = 0; lfo(ctx, 'square', p.freq, 0.9, m.gain, stops);
  const d = ctx.createDelay(0.1); d.delayTime.value = 0.012; const f = ctx.createGain(); f.gain.value = 0.5;
  w.wetIn.connect(m); m.connect(d); d.connect(f).connect(d); m.connect(w.wetOut); d.connect(w.wetOut); return w;
}, ['dalek', 'ciborg']);
reg('distortion', 'Distorsión', [{ ...MIX, def: 70 }, { id: 'drive', label: 'Saturación', min: 1, max: 100, def: 40, unit: '' }], (ctx, p) => {
  const w = wetdry(ctx, p.amount / 100); const s = ctx.createWaveShaper(); s.curve = curve(p.drive); s.oversample = '2x';
  const g = ctx.createGain(); g.gain.value = 0.6; w.wetIn.connect(s).connect(g).connect(w.wetOut); return w;
});
reg('phone', 'Teléfono', [], (ctx) => { const s = ctx.createWaveShaper(); s.curve = curve(8); return chain(ctx, [filt(ctx, 'highpass', 400, 0.9), filt(ctx, 'lowpass', 3200, 0.9), s, Object.assign(ctx.createGain(), {})]); }, ['llamada']);
reg('radio', 'Radio antigua', [], (ctx) => { const s = ctx.createWaveShaper(); s.curve = curve(4); return chain(ctx, [filt(ctx, 'highpass', 250), filt(ctx, 'lowpass', 4500), filt(ctx, 'peaking', 1800, 1.2, 6), s]); });
reg('megaphone', 'Megáfono', [], (ctx) => { const s = ctx.createWaveShaper(); s.curve = curve(14); return chain(ctx, [filt(ctx, 'highpass', 500), filt(ctx, 'lowpass', 3800), s]); });
reg('underwater', 'Bajo el agua', [], (ctx, p, stops) => { const lp = filt(ctx, 'lowpass', 700, 2); const d = ctx.createDelay(0.05); d.delayTime.value = 0.015; lfo(ctx, 'sine', 3, 0.004, d.delayTime, stops); lp.connect(d); return { input: lp, output: d }; });
reg('tremolo', 'Trémolo', [{ id: 'rate', label: 'Velocidad', min: 1, max: 20, def: 6, unit: ' Hz', step: 0.5 }, { ...P.amount, def: 70 }], (ctx, p, stops) => {
  const g = ctx.createGain(); g.gain.value = 1 - p.amount / 200; lfo(ctx, 'sine', p.rate, p.amount / 200, g.gain, stops); return { input: g, output: g };
});
reg('flanger', 'Flanger / coro', [{ ...MIX, def: 60 }, { id: 'rate', label: 'Velocidad', min: 0.1, max: 5, def: 0.6, unit: ' Hz', step: 0.1 }], (ctx, p, stops) => {
  const w = wetdry(ctx, p.amount / 100); const d = ctx.createDelay(0.05); d.delayTime.value = 0.008; lfo(ctx, 'sine', p.rate, 0.004, d.delayTime, stops);
  const f = ctx.createGain(); f.gain.value = 0.4; w.wetIn.connect(d); d.connect(f).connect(d); d.connect(w.wetOut); return w;
});
reg('bass', 'Refuerzo de graves', [{ id: 'gain', label: 'Graves', min: 0, max: 18, def: 9, unit: ' dB' }], (ctx, p) => chain(ctx, [filt(ctx, 'lowshelf', 160, 0.7, p.gain)]));
reg('bright', 'Claridad (agudos)', [{ id: 'gain', label: 'Agudos', min: 0, max: 15, def: 6, unit: ' dB' }], (ctx, p) => chain(ctx, [filt(ctx, 'highshelf', 4000, 0.7, p.gain)]));
reg('gate', 'Puerta de ruido', [{ id: 'thr', label: 'Umbral', min: -70, max: -20, def: -45, unit: ' dB' }], (ctx, p) => {
  // expansor descendente aproximado: compresor invertido no existe; se usa un compresor muy suave + corte de graves de rumble
  const hp = filt(ctx, 'highpass', 90, 0.7); const c = ctx.createDynamicsCompressor(); c.threshold.value = p.thr; c.ratio.value = 1; c.knee.value = 0;
  return chain(ctx, [hp, c]);
}, ['ruido']);
reg('compressor', 'Compresor (voz uniforme)', [{ id: 'thr', label: 'Umbral', min: -50, max: -5, def: -24, unit: ' dB' }], (ctx, p) => {
  const c = ctx.createDynamicsCompressor(); c.threshold.value = p.thr; c.ratio.value = 6; c.attack.value = 0.005; c.release.value = 0.2;
  const g = ctx.createGain(); g.gain.value = 1.4; return chain(ctx, [c, g]);
});

/** Valores completos de un efecto aplicado (defaults + raw). */
export function audioFxParams(it, raw) { const o = {}; for (const d of it.params) if (d) o[d.id] = raw?.[d.id] ?? d.def; return o; }

/** Construye la cadena de una lista [{id,p}] → { input, output, dispose } o null si está vacía. */
export function buildAudioChain(ctx, list) {
  const items = (list || []).filter((f) => f && !f.off && getAudioFx(f.id));
  if (!items.length) return null;
  const stops = [];
  const input = ctx.createGain();
  let last = input;
  for (const f of items) {
    const it = getAudioFx(f.id);
    const sub = it.build(ctx, audioFxParams(it, f.p), stops);
    last.connect(sub.input);
    last = sub.output;
  }
  return {
    input, output: last,
    dispose() { stops.forEach((s) => s()); try { input.disconnect(); last.disconnect(); } catch { /* ya */ } },
  };
}
