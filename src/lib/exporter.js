// Exportación: se reproduce el proyecto en tiempo real sobre un canvas de la resolución elegida
// y se graba (video del canvas + audio mezclado de Web Audio) con MediaRecorder.
import { loadFonts } from './fonts.js';
import { store, getState, projectSize, seek, play, pause, toast } from '../store/store.js';
import { engine } from './engine.js';

const MIMES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export const pickMime = () =>
  typeof MediaRecorder === 'undefined' ? null : MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const bitrate = (res, fps) => Math.round(({ 480: 2.5e6, 720: 6e6, 1080: 10e6 }[res] ?? 6e6) * (fps / 30));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let session = null;

export function openExportDialog() {
  const s = getState();
  if (s.duration <= 0) return toast('Añade al menos un clip para exportar');
  pause();
  store.setState({ exporting: { phase: 'config' } });
}

export function closeExportDialog() {
  const e = getState().exporting;
  if (e?.phase === 'running') return;
  if (e?.result?.url) URL.revokeObjectURL(e.result.url);
  store.setState({ exporting: null });
}

export function cancelExport() {
  if (session) session.cancelled = true;
}

/** Duración real (s) de un video grabado; null si el navegador no la sabe leer. */
function probeDuration(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d) => {
      v.removeAttribute('src');
      v.load();
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    };
    const t = setTimeout(() => done(null), 6000);
    v.onloadedmetadata = () => {
      if (v.duration === Infinity) {
        v.currentTime = 1e101; // los webm grabados no traen duración: se fuerza al final
        v.ontimeupdate = () => {
          v.ontimeupdate = null;
          clearTimeout(t);
          done(v.duration);
        };
      } else {
        clearTimeout(t);
        done(v.duration);
      }
    };
    v.onerror = () => {
      clearTimeout(t);
      done(null);
    };
    v.src = url;
  });
}

/**
 * Exporta el proyecto. Si el grabador se detiene antes de tiempo (pasa en algunos teléfonos con
 * 1080p/60fps) reintenta una vez con 720p/30fps.
 */
export async function startExport(override = null, attempt = 0) {
  const s = getState();
  const mime = pickMime();
  if (!mime) {
    store.setState({ exporting: { phase: 'error', message: 'Este dispositivo no permite grabar video desde el navegador.' } });
    return;
  }
  const res = override?.res ?? s.project.res;
  const fps = override?.fps ?? s.project.fps;
  const [bw, bh] = projectSize(s.project);
  const k = res / Math.min(bw, bh);
  const W = even(bw * k);
  const H = even(bh * k);
  const duration = s.duration;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';

  session = { cancelled: false };
  const mine = session;
  store.setState({
    exporting: {
      phase: 'running',
      progress: 0,
      status: attempt ? 'Reintentando con menor calidad (720p, 30 fps)…' : 'Preparando…',
    },
  });

  engine.ensureAudio(); // dentro del gesto del usuario, antes de cualquier espera
  await loadFonts(); // el texto debe dibujarse con sus fuentes ya cargadas
  const actx = engine.audio?.ctx;
  if (actx && actx.state !== 'running') {
    try {
      await Promise.race([actx.resume(), wait(1500)]);
    } catch {
      /* se sigue sin audio */
    }
  }
  pause();
  engine.stopAllMedia();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  engine.beginExport(canvas);
  engine.setMonitor(0);

  let recorder = null;
  let retry = false;
  try {
    const stream = canvas.captureStream(fps);
    // Una pista de audio parada hace que el grabador deje de escribir video: solo se añade si el audio corre.
    if (actx && actx.state === 'running') engine.exportAudioTracks.forEach((t) => stream.addTrack(t));
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: bitrate(res, fps),
      audioBitsPerSecond: 128000,
    });
    const chunks = [];
    let recError = null;
    recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    recorder.onerror = (e) => {
      recError = e?.error?.message || e?.message || 'error del grabador';
    };
    const stopped = new Promise((r) => (recorder.onstop = r));

    seek(0);
    await wait(700); // deja que los medios se posicionen en el inicio
    recorder.start(500);
    const wallStart = performance.now();
    play();

    // espera a que termine la reproducción (o a que el grabador se detenga por su cuenta)
    while (getState().isPlaying && !mine.cancelled && recorder.state === 'recording') {
      store.setState({
        exporting: {
          phase: 'running',
          progress: Math.min(0.99, getState().currentTime / duration),
          status: 'Grabando el video en tiempo real… no cierres la app',
        },
      });
      await wait(250);
    }
    const recordedEarly = recorder.state !== 'recording' && getState().isPlaying && !mine.cancelled;
    pause();
    await wait(400);
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    if (mine.cancelled) {
      store.setState({ exporting: null });
      return;
    }
    if (recordedEarly || recError) {
      if (attempt === 0 && (res > 720 || fps > 30)) {
        retry = true;
        return;
      }
      throw new Error(recError ? `el grabador falló (${recError})` : 'el grabador se detuvo antes de terminar');
    }

    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const url = URL.createObjectURL(blob);
    const safe = (s.project.name || 'LineCut').replace(/[^\w\- áéíóúñÁÉÍÓÚÑ]/g, '').trim() || 'LineCut';
    const seconds = await probeDuration(url);
    const wall = (performance.now() - wallStart) / 1000;
    // Si el archivo dura mucho menos que el proyecto, algo falló: se reintenta con menos calidad.
    if (seconds !== null && seconds < duration * 0.85 && wall > duration * 0.85 && attempt === 0 && (res > 720 || fps > 30)) {
      URL.revokeObjectURL(url);
      retry = true;
      return;
    }
    store.setState({
      exporting: {
        phase: 'done',
        progress: 1,
        result: {
          blob, url, name: `${safe}.${ext}`, size: blob.size, W, H, fps,
          seconds, expected: duration, short: seconds !== null && seconds < duration * 0.85,
        },
      },
    });
  } catch (err) {
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {
      /* ya detenido */
    }
    pause();
    store.setState({ exporting: { phase: 'error', message: `No se pudo exportar: ${err?.message || err}` } });
  } finally {
    engine.endExport();
    engine.setMonitor(1);
    engine.stopAllMedia();
    session = null;
    if (retry) setTimeout(() => startExport({ res: Math.min(res, 720), fps: Math.min(fps, 30) }, attempt + 1), 100);
  }
}
