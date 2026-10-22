// Arrastrar recursos del panel hacia la línea de tiempo con eventos de puntero
// (funciona con ratón y con táctil: en táctil se activa con una pulsación larga).
import { store, getState, addAsset } from '../store/store.js';
import { snapTime, timeAtClientX, rowAtClientY } from './snap.js';

export function dropAt(payload, x, y) {
  const area = document.querySelector('[data-timeline-area]');
  if (!area) return false;
  const r = area.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;

  if (payload.kind === 'filter' || payload.kind === 'transition') {
    const clipEl = document.elementFromPoint(x, y)?.closest('[data-clip-id]');
    if (!clipEl) return false;
    addAsset({ ...payload, clipId: clipEl.dataset.clipId });
    return true;
  }
  const time = snapTime(timeAtClientX(x));
  addAsset(payload, { time, trackId: rowAtClientY(y) });
  return true;
}

/** Devuelve props para un elemento de la lista de recursos. */
export function assetPointerProps(payload, onTap) {
  return {
    onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      const touch = e.pointerType === 'touch';
      let dragging = false;
      let moved = false;
      let timer = null;

      const begin = (x, y) => {
        dragging = true;
        store.setState({ drag: { payload, x, y } });
        if (navigator.vibrate) navigator.vibrate(12);
      };
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('touchmove', block);
      };
      const block = (ev) => {
        if (dragging && ev.cancelable) ev.preventDefault();
      };
      const move = (ev) => {
        if (!dragging) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
            moved = true;
            if (touch) cleanup(); // el usuario está desplazando la lista
            else begin(ev.clientX, ev.clientY);
          }
          return;
        }
        store.setState({ drag: { payload, x: ev.clientX, y: ev.clientY } });
      };
      const up = (ev) => {
        cleanup();
        if (dragging) {
          store.setState({ drag: null });
          if (!dropAt(payload, ev.clientX, ev.clientY)) {
            /* soltado fuera de la línea de tiempo: no se añade nada */
          }
        } else if (!moved) onTap?.();
      };
      const cancel = () => {
        cleanup();
        if (dragging) store.setState({ drag: null });
      };

      if (touch) timer = setTimeout(() => !moved && begin(sx, sy), 300);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('touchmove', block, { passive: false });
    },
    onContextMenu: (e) => e.preventDefault(),
    style: { touchAction: 'pan-y' },
    'data-asset': '1',
  };
}

export const currentDrag = () => getState().drag;
