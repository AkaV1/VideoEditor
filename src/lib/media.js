// Importación de archivos locales: duración, dimensiones, miniaturas y forma de onda.
import { uid } from './time.js';
import { addMedia, updateMedia, toast, getState } from '../store/store.js';
import { putBlob } from './db.js';

const EXT = {
  video: /\.(mp4|m4v|mov|webm|mkv|3gp|avi|ogv)$/i,
  audio: /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|amr)$/i,
  image: /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i,
};

export function kindOf(file) {
  const t = file.type || '';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/')) return 'image';
  for (const k of Object.keys(EXT)) if (EXT[k].test(file.name || '')) return k;
  return null;
}

const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

function probeElement(kind, url) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const el = document.createElement(kind === 'audio' ? 'audio' : 'video');
      el.preload = 'metadata';
      el.muted = true;
      el.playsInline = true;
      const done = () => {
        const out = { duration: el.duration, width: el.videoWidth || 0, height: el.videoHeight || 0 };
        el.removeAttribute('src');
        el.load();
        resolve(out);
      };
      el.onloadedmetadata = () => {
        if (el.duration === Infinity || Number.isNaN(el.duration)) {
          // algunos webm grabados no traen duración: se fuerza al final
          el.currentTime = 1e101;
          el.ontimeupdate = () => {
            el.ontimeupdate = null;
            el.currentTime = 0;
            done();
          };
        } else done();
      };
      el.onerror = () => reject(new Error('No se pudo leer el archivo'));
      el.src = url;
    }),
    15000,
    'Tiempo agotado leyendo el archivo',
  );
}

function probeImage(url) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = url;
    }),
    15000,
    'Tiempo agotado leyendo la imagen',
  );
}

async function makeThumbs(url, duration, aspect) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.playsInline = true;
  video.src = url;
  try {
    await withTimeout(
      new Promise((res, rej) => {
        video.onloadeddata = res;
        video.onerror = () => rej(new Error('thumb'));
      }),
      10000,
      'thumb',
    );
  } catch {
    return [];
  }
  const h = 64;
  const w = Math.max(24, Math.round(h * (aspect || 16 / 9)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const interval = Math.max(1, duration / 24);
  const count = Math.max(1, Math.min(24, Math.ceil(duration / interval)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const time = Math.min(duration - 0.05, i * interval + 0.05);
    try {
      await withTimeout(
        new Promise((res) => {
          video.onseeked = res;
          video.currentTime = Math.max(0, time);
        }),
        4000,
        'seek',
      );
      ctx.drawImage(video, 0, 0, w, h);
      out.push(canvas.toDataURL('image/jpeg', 0.6));
    } catch {
      out.push(out[out.length - 1] ?? null);
    }
  }
  video.removeAttribute('src');
  video.load();
  return out.filter(Boolean);
}

async function makeImagePoster(url) {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const h = 96;
    const w = Math.max(24, Math.round((h * img.naturalWidth) / (img.naturalHeight || 1)));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

async function makePeaks(file, duration) {
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) return null;
  const decoder = new Ctx(1, 44100, 44100);
  const buf = await decoder.decodeAudioData(await file.arrayBuffer());
  const data = buf.getChannelData(0);
  const n = Math.min(20000, Math.max(1, Math.ceil(buf.duration * 30)));
  const step = Math.max(1, Math.floor(data.length / n));
  const stride = Math.max(1, Math.floor(step / 24));
  const peaks = new Uint8Array(n);
  let max = 0.0001;
  for (let i = 0; i < n; i++) {
    let m = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j += stride) {
      const v = Math.abs(data[j]);
      if (v > m) m = v;
    }
    peaks[i] = Math.min(255, Math.round(m * 255));
    if (m > max) max = m;
  }
  // normaliza para que las ondas pequeñas también se vean
  const gain = Math.min(4, 1 / max);
  for (let i = 0; i < n; i++) peaks[i] = Math.min(255, Math.round(peaks[i] * gain));
  return { peaks, duration: buf.duration || duration };
}

export async function importFile(file) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`Formato no compatible: ${file.name}`);
  const url = URL.createObjectURL(file);
  const id = uid('med');
  const name = (file.name || 'Medio').replace(/\.[^.]+$/, '');
  let info;
  try {
    info = kind === 'image' ? await probeImage(url) : await probeElement(kind, url);
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  const item = {
    id,
    name,
    kind,
    url,
    duration: kind === 'image' ? 5 : info.duration || 0,
    width: info.width || 0,
    height: info.height || 0,
    thumbs: kind === 'image' ? [url] : [],
    peaks: null,
  };
  addMedia(item);

  // Copia del archivo en el almacenamiento de la app para poder reabrir el proyecto
  const pid = getState().projectId;
  if (pid) {
    putBlob(pid, id, file).catch(() => toast('No hay espacio para guardar este medio en el proyecto'));
  }
  if (kind === 'image') {
    makeImagePoster(url).then((poster) => poster && updateMedia(id, { poster }));
  }

  // Trabajo secundario: no bloquea la edición
  if (kind === 'video') {
    makeThumbs(url, item.duration, item.width / (item.height || 1)).then((thumbs) => {
      if (thumbs.length) updateMedia(id, { thumbs });
    });
  }
  if (kind !== 'image' && file.size < 120 * 1024 * 1024) {
    makePeaks(file, item.duration)
      .then((r) => r && updateMedia(id, { peaks: r.peaks }))
      .catch(() => {});
  }
  return id;
}

export async function importFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  const ids = [];
  for (const f of files) {
    try {
      ids.push(await importFile(f));
    } catch (e) {
      toast(e.message || 'No se pudo importar el archivo');
    }
  }
  if (ids.length) toast(ids.length === 1 ? 'Medio importado' : `${ids.length} medios importados`);
  return ids;
}
