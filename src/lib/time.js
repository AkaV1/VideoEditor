export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');

/** HH:MM:SS:FF */
export function timecode(t, fps = 30) {
  t = Math.max(0, t || 0);
  const total = Math.floor(t);
  const ff = Math.min(fps - 1, Math.floor((t - total) * fps + 1e-6));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(ff)}`;
}

/** M:SS para etiquetas cortas */
export function shortTime(t) {
  t = Math.max(0, t || 0);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${pad(s)}`;
}

export function rulerLabel(t, fps = 30, step = 1) {
  if (step < 1) {
    const total = Math.floor(t);
    const ff = Math.round((t - total) * fps);
    return `${pad(total % 60)}s${pad(ff)}f`;
  }
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m > 0 ? `${m}:${pad(s)}` : `${s}s`;
}

let n = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
