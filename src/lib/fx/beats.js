// Detección aproximada de golpes (beats) por flujo de energía. Sirve para colocar marcas de ritmo en la línea de tiempo.
export async function detectBeats(url, { maxSeconds = 300 } = {}) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) throw new Error('Sin Web Audio');
  const buf = await (await fetch(url)).arrayBuffer();
  const tmp = new (window.AudioContext || window.webkitAudioContext)();
  let audio;
  try { audio = await tmp.decodeAudioData(buf); } finally { tmp.close?.(); }
  const sr = audio.sampleRate;
  const n = Math.min(audio.length, Math.floor(maxSeconds * sr));
  const ch = audio.getChannelData(0);
  const hop = 512;
  const frames = Math.floor(n / hop);
  const env = new Float32Array(frames);
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) { const x = ch[f * hop + i]; lp += 0.12 * (x - lp); e += lp * lp; } // graves: ritmo
    env[f] = Math.sqrt(e / hop);
  }
  const flux = new Float32Array(frames);
  for (let f = 8; f < frames; f++) {
    let m = 0; for (let k = 1; k <= 8; k++) m += env[f - k];
    flux[f] = Math.max(0, env[f] - m / 8);
  }
  const win = Math.round(sr / hop); // ~1 s
  const beats = [];
  let last = -1;
  for (let f = 8; f < frames - 1; f++) {
    const a = Math.max(0, f - win), b = Math.min(frames, f + win);
    let mean = 0, sq = 0; for (let i = a; i < b; i++) { mean += flux[i]; sq += flux[i] * flux[i]; }
    mean /= b - a; const sd = Math.sqrt(Math.max(0, sq / (b - a) - mean * mean));
    if (flux[f] > mean + 1.2 * sd && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] > 1e-4) {
      const t = (f * hop) / sr;
      if (t - last > 0.25) { beats.push(+t.toFixed(3)); last = t; }
    }
  }
  return beats;
}
