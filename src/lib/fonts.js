// Carga de fuentes web: el lienzo solo puede dibujar una fuente cuando ya está cargada.
import manifest from './fonts.json';
import { engine } from './engine.js';

let all = null;

/** Descarga todas las fuentes de la app (una sola vez). Nunca rechaza. */
export function loadFonts() {
  if (all) return all;
  if (typeof document === 'undefined' || !document.fonts) return (all = Promise.resolve());
  all = Promise.all(
    manifest.flatMap((f) => f.weights.map((w) => document.fonts.load(`${w} 40px "${f.family}"`, 'Aáéíñóú¿'))),
  )
    .catch(() => {})
    .then(() => engine.markDirty());
  return all;
}

export function initFonts() {
  if (!document.fonts) return;
  document.fonts.addEventListener?.('loadingdone', () => engine.markDirty());
  loadFonts();
}
