// Biblioteca de audio integrada: música y efectos de sonido generados con Web Audio.
// No hay archivos ni descargas: cada pista se sintetiza al momento y se guarda como WAV.
import { store, addMedia } from '../store/store.js';

const SR = 44100;

// ---------------------------------------------------------- instrumentos
function tone(ctx, dest, { type = 'sine', freq, freqEnd = null, t, dur, vol = 0.3, attack = 0.005, release = 0.08, detune = 0 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, Math.max(t + attack, t + dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseSrc(ctx, dur) {
  const buf = ctx.createBuffer(1, Math.ceil(SR * dur), SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  return s;
}

function noise(ctx, dest, { t, dur, vol = 0.3, type = 'highpass', freq = 4000, freqEnd = null, q = 1, attack = 0.002 }) {
  const s = noiseSrc(ctx, dur);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const kick = (c, d, t, v = 0.9) => tone(c, d, { freq: 150, freqEnd: 42, t, dur: 0.26, vol: v, release: 0.2 });
const snare = (c, d, t, v = 0.5) => {
  noise(c, d, { t, dur: 0.17, vol: v, type: 'bandpass', freq: 1900, q: 0.7 });
  tone(c, d, { type: 'triangle', freq: 200, freqEnd: 120, t, dur: 0.12, vol: v * 0.6 });
};
const hat = (c, d, t, open = false, v = 0.14) => noise(c, d, { t, dur: open ? 0.16 : 0.045, vol: v, type: 'highpass', freq: 7500 });
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ------------------------------------------------------------- catálogo
export const AUDIO_LIBRARY = [
  {
    id: 'pulse', group: 'music', label: 'Pulso 120', desc: 'Ritmo electrónico', duration: 16,
    build(c, d) {
      const bass = [33, 33, 36, 31];
      for (let b = 0; b < 32; b++) {
        const t = b * 0.5;
        kick(c, d, t);
        if (b % 2 === 1) snare(c, d, t);
        hat(c, d, t + 0.25, b % 4 === 3);
        const f = midi(bass[Math.floor(b / 4) % 4] + 12);
        tone(c, d, { type: 'sawtooth', freq: f, t: t + 0.25, dur: 0.22, vol: 0.18 });
      }
    },
  },
  {
    id: 'dream', group: 'music', label: 'Sueño', desc: 'Pad ambiental', duration: 16,
    build(c, d) {
      const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
      chords.forEach((ch, i) => {
        const t = i * 4;
        ch.forEach((n, j) => {
          tone(c, d, { type: 'triangle', freq: midi(n), t, dur: 4.2, vol: 0.11, attack: 1.0, release: 1.6, detune: j * 4 - 4 });
          tone(c, d, { type: 'sine', freq: midi(n + 12), t: t + 0.2, dur: 3.8, vol: 0.05, attack: 1.2, release: 1.6 });
        });
        for (let k = 0; k < 4; k++) tone(c, d, { type: 'sine', freq: midi(ch[k % 3] + 24), t: t + k + 0.5, dur: 0.9, vol: 0.05, attack: 0.01, release: 0.7 });
      });
    },
  },
  {
    id: 'lofi', group: 'music', label: 'Lo-fi', desc: 'Relajado, 80 BPM', duration: 18,
    build(c, d) {
      const beat = 60 / 80;
      const chords = [[50, 53, 57, 60], [43, 47, 50, 53], [48, 52, 55, 59], [45, 48, 52, 55]];
      for (let bar = 0; bar < 6; bar++) {
        const ch = chords[bar % 4];
        const t0 = bar * 4 * beat;
        [0, 1.5, 2.5].forEach((o) => ch.forEach((n) => tone(c, d, { type: 'triangle', freq: midi(n + 12), t: t0 + o * beat, dur: beat * 1.2, vol: 0.07, attack: 0.01, release: 0.5 })));
        kick(c, d, t0, 0.7);
        kick(c, d, t0 + 2.5 * beat, 0.6);
        snare(c, d, t0 + beat, 0.3);
        snare(c, d, t0 + 3 * beat, 0.3);
        for (let h = 0; h < 8; h++) hat(c, d, t0 + h * beat * 0.5, false, 0.07);
        tone(c, d, { type: 'sine', freq: midi(ch[0] - 12), t: t0, dur: beat * 3.6, vol: 0.22, attack: 0.02, release: 0.4 });
      }
      noise(c, d, { t: 0, dur: 18, vol: 0.012, type: 'bandpass', freq: 3000, q: 0.5, attack: 0.5 });
    },
  },
  {
    id: 'arcade', group: 'music', label: 'Arcade', desc: 'Arpegios 8-bit', duration: 12,
    build(c, d) {
      const step = 60 / 140 / 2;
      const prog = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
      for (let i = 0; i < 12 / step; i++) {
        const ch = prog[Math.floor(i / 8) % 4];
        const t = i * step;
        tone(c, d, { type: 'square', freq: midi(ch[i % 3] + 12), t, dur: step * 0.9, vol: 0.1, release: 0.03 });
        if (i % 2 === 0) tone(c, d, { type: 'triangle', freq: midi(ch[0] - 12), t, dur: step * 1.8, vol: 0.2, release: 0.05 });
        if (i % 4 === 0) kick(c, d, t, 0.5);
        if (i % 4 === 2) hat(c, d, t, false, 0.12);
      }
    },
  },
  {
    id: 'whoosh', group: 'sfx', label: 'Whoosh', desc: 'Barrido de aire', duration: 1.2,
    build(c, d) {
      noise(c, d, { t: 0, dur: 1.1, vol: 0.7, type: 'bandpass', freq: 300, freqEnd: 4500, q: 1.2, attack: 0.5 });
      noise(c, d, { t: 0.5, dur: 0.6, vol: 0.4, type: 'bandpass', freq: 4500, freqEnd: 400, q: 1.2, attack: 0.02 });
    },
  },
  { id: 'click', group: 'sfx', label: 'Clic', desc: 'Pulsación', duration: 0.2, build(c, d) { noise(c, d, { t: 0.01, dur: 0.05, vol: 0.8, freq: 3000 }); tone(c, d, { freq: 1600, freqEnd: 900, t: 0.01, dur: 0.06, vol: 0.3 }); } },
  { id: 'pop', group: 'sfx', label: 'Pop', desc: 'Burbuja', duration: 0.3, build(c, d) { tone(c, d, { freq: 700, freqEnd: 160, t: 0.01, dur: 0.18, vol: 0.7, release: 0.1 }); } },
  {
    id: 'ding', group: 'sfx', label: 'Ding', desc: 'Campanilla', duration: 1.6,
    build(c, d) {
      tone(c, d, { freq: 1318, t: 0, dur: 1.5, vol: 0.4, attack: 0.002, release: 1.4 });
      tone(c, d, { freq: 2637, t: 0, dur: 1.0, vol: 0.18, attack: 0.002, release: 0.9 });
      tone(c, d, { freq: 3951, t: 0, dur: 0.6, vol: 0.08, attack: 0.002, release: 0.5 });
    },
  },
  {
    id: 'boom', group: 'sfx', label: 'Impacto', desc: 'Golpe grave', duration: 2,
    build(c, d) {
      tone(c, d, { freq: 120, freqEnd: 30, t: 0, dur: 1.6, vol: 0.9, release: 1.2 });
      noise(c, d, { t: 0, dur: 1.2, vol: 0.6, type: 'lowpass', freq: 900, freqEnd: 80, attack: 0.001 });
    },
  },
  {
    id: 'riser', group: 'sfx', label: 'Subida', desc: 'Tensión creciente', duration: 3,
    build(c, d) {
      tone(c, d, { type: 'sawtooth', freq: 100, freqEnd: 1400, t: 0, dur: 2.9, vol: 0.18, attack: 1.5, release: 0.1 });
      noise(c, d, { t: 0, dur: 2.9, vol: 0.4, type: 'highpass', freq: 400, freqEnd: 6000, attack: 2.6 });
    },
  },
  { id: 'laser', group: 'sfx', label: 'Láser', desc: 'Disparo retro', duration: 0.5, build(c, d) { tone(c, d, { type: 'square', freq: 1900, freqEnd: 180, t: 0, dur: 0.35, vol: 0.3, release: 0.1 }); } },
  {
    id: 'applause', group: 'sfx', label: 'Aplauso', desc: 'Público', duration: 3,
    build(c, d) {
      noise(c, d, { t: 0, dur: 2.9, vol: 0.5, type: 'bandpass', freq: 2200, q: 0.4, attack: 0.3 });
      for (let i = 0; i < 90; i++) noise(c, d, { t: Math.random() * 2.7, dur: 0.04, vol: 0.5, type: 'highpass', freq: 1800 });
    },
  },
];

// -------------------------------------------------------------- render
function toWav(buf) {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const data = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data], { type: 'audio/wav' });
}

function peaksOf(buf, perSec = 30) {
  const data = buf.getChannelData(0);
  const n = Math.max(1, Math.ceil(buf.duration * perSec));
  const step = Math.max(1, Math.floor(data.length / n));
  const out = new Uint8Array(n);
  let max = 0.0001;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(data[j]));
    out[i] = Math.round(m * 255);
    max = Math.max(max, m);
  }
  const g = Math.min(4, 1 / max);
  return out.map((v) => Math.min(255, Math.round(v * g)));
}

const inflight = new Map();

/** Genera (una sola vez) el audio de la biblioteca y lo registra como medio. */
export function ensureLibraryAudio(id) {
  const mediaId = `lib_${id}`;
  if (store.getState().media[mediaId]) return Promise.resolve(mediaId);
  if (inflight.has(id)) return inflight.get(id);
  const def = AUDIO_LIBRARY.find((a) => a.id === id);
  const p = (async () => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, Math.ceil(SR * def.duration), SR);
    const comp = ctx.createDynamicsCompressor();
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp).connect(ctx.destination);
    def.build(ctx, master);
    const buf = await ctx.startRendering();
    const blob = toWav(buf);
    addMedia({
      id: mediaId,
      name: def.label,
      kind: 'audio',
      url: URL.createObjectURL(blob),
      duration: buf.duration,
      width: 0,
      height: 0,
      thumbs: [],
      peaks: peaksOf(buf),
      library: true,
    });
    return mediaId;
  })();
  const guarded = p.finally(() => inflight.delete(id));
  inflight.set(id, guarded);
  return guarded;
}

let previewEl = null;
/** Escucha rápida de una pista de la biblioteca. */
export async function previewLibraryAudio(id) {
  const mediaId = await ensureLibraryAudio(id);
  const m = store.getState().media[mediaId];
  if (previewEl) {
    previewEl.pause();
    if (previewEl.dataset.id === id) {
      previewEl = null;
      return false;
    }
  }
  previewEl = new Audio(m.url);
  previewEl.dataset.id = id;
  previewEl.play().catch(() => {});
  previewEl.onended = () => (previewEl = null);
  return true;
}
export const stopPreview = () => {
  previewEl?.pause();
  previewEl = null;
};
