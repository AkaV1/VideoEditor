// Guardado y uso compartido del video exportado (Android vía Capacitor, o descarga en navegador).
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = (() => {
  try {
    return !!Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
})();

export const isDesktop = typeof window !== 'undefined' && !!window.linecutDesktop;

const Filesystem = registerPlugin('Filesystem');
const Share = registerPlugin('Share');
const Gallery = registerPlugin('Gallery'); // plugin propio (se añade al proyecto Android en patch-android.mjs)

const CHUNK = 3 * 512 * 1024; // múltiplo de 3 → cada trozo es base64 válido por sí solo

/** Guarda el video en la galería (Movies/LineCut) sin pasar por la hoja de compartir. */
export async function saveToGallery(blob, filename, onProgress) {
  if (!isNative) throw new Error('Solo disponible en la app');
  await Gallery.begin({ name: filename, mime: blob.type || 'video/mp4' });
  try {
    for (let off = 0; off < blob.size; off += CHUNK) {
      await Gallery.append({ data: await blobToBase64(blob.slice(off, off + CHUNK)) });
      onProgress?.(Math.min(1, (off + CHUNK) / blob.size));
    }
    return await Gallery.finish();
  } catch (e) {
    await Gallery.abort().catch(() => {});
    throw e;
  }
}

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
