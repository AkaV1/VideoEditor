import { getState, clipEnd } from '../store/store.js';

/** Imán: ajusta un tiempo (o el final de un clip de `duration`) a bordes, cabezal y marcadores. */
export function snapTime(t, { excludeId = null, duration = 0 } = {}) {
  const s = getState();
  if (!s.snapping) return t;
  const thr = 10 / s.zoom;
  const points = [0, s.currentTime, ...s.markers];
  for (const tr of s.tracks) {
    for (const c of tr.clips) {
      if (c.id === excludeId) continue;
      points.push(c.start, clipEnd(c));
    }
  }
  let best = t;
  let bestD = thr;
  for (const p of points) {
    const d1 = Math.abs(p - t);
    if (d1 < bestD) {
      bestD = d1;
      best = p;
    }
    if (duration) {
      const d2 = Math.abs(p - (t + duration));
      if (d2 < bestD) {
        bestD = d2;
        best = p - duration;
      }
    }
  }
  return Math.max(0, best);
}

/** Tiempo del proyecto bajo una coordenada X de pantalla. */
export function timeAtClientX(x) {
  const el = document.querySelector('[data-timeline-content]');
  if (!el) return 0;
  return Math.max(0, (x - el.getBoundingClientRect().left) / getState().zoom);
}

/** Fila de pista bajo una coordenada Y de pantalla (o null). */
export function rowAtClientY(y) {
  const rows = document.querySelectorAll('[data-track-row]');
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (y >= b.top && y < b.bottom) return r.dataset.trackRow;
  }
  return null;
}
