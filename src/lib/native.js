// Guardado y uso compartido del video exportado (Android vía Capacitor, o descarga en navegador).
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = (() => {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
})();

const Filesystem = registerPlugin('Filesystem');
const Share = registerPlugin('Share');

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Guarda el archivo y abre la hoja "compartir/guardar" del sistema. */
export async function saveVideo(blob, filename) {
  if (isNative) {
    const data = await blobToBase64(blob);
    const res = await Filesystem.writeFile({ path: filename, data, directory: 'CACHE' });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Guardar o compartir video' });
    return 'Elige dónde guardarlo en la hoja de compartir';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'Descarga iniciada';
}
