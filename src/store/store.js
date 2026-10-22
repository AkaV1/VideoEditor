// Estado global de LineCut: pequeño store propio (sin dependencias) con
// historial deshacer/rehacer y todas las acciones de edición.
import { useRef, useSyncExternalStore } from 'react';
import {
  RATIOS,
  DEFAULT_TEXT_STYLE,
  DEFAULT_TRANSFORM,
  DEFAULT_CROP,
  DEFAULT_COLOR,
  DEFAULT_AUDIO,
  TEXT_TEMPLATES,
} from '../lib/presets.js';
import { clamp, uid } from '../lib/time.js';

// ------------------------------------------------------------------ store
function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      if (!next) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const newTrack = (kind, name) => ({
  id: uid('trk'),
  kind, // 'text' | 'video' | 'audio'
  name,
  muted: false,
  hidden: false,
  locked: false,
  clips: [],
});

const portrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

export const freshDocument = () => ({
  project: { name: 'Proyecto sin título', ratio: portrait ? '9:16' : '16:9', res: 1080, fps: 30 },
  tracks: [newTrack('text', 'Texto'), newTrack('video', 'Video'), newTrack('audio', 'Audio')],
  markers: [],
});

export const store = createStore({
  // --- pantalla y proyecto abierto
  view: 'home', // 'home' | 'editor'
  projectId: null,
  saveState: 'saved', // 'saved' | 'pending' | 'error'
  // --- documento (entra en el historial)
  ...freshDocument(),
  // --- biblioteca
  media: {},
  // --- transporte
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  // --- vista
  zoom: 60, // píxeles por segundo en la línea de tiempo
  snapping: true,
  tool: 'select', // 'select' | 'cut'
  selectedId: null,
  previewZoom: 1,
  // --- UI
  assetTab: 'media',
  inspectorTab: null,
  panel: null, // diseño compacto: 'assets' | 'inspector' | null
  drag: null, // arrastre de recursos hacia la línea de tiempo
  toast: null,
  exporting: null, // { progress, status, result }
  // --- historial
  past: [],
  future: [],
});

export const getState = store.getState;
if (typeof window !== 'undefined') window.__linecut = { getState: store.getState };

export function useStore(selector, eq = Object.is) {
  const ref = useRef(null);
  const get = () => {
    const v = selector(store.getState());
    if (ref.current && eq(ref.current.v, v)) return ref.current.v;
    ref.current = { v };
    return v;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}

export const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};

// ---------------------------------------------------------------- helpers
export const trackKindFor = (type) =>
  type === 'audio' ? 'audio' : type === 'video' || type === 'image' ? 'video' : 'text';

export const clipEnd = (c) => c.start + c.duration;

export function calcDuration(tracks) {
  let d = 0;
  for (const t of tracks) for (const c of t.clips) d = Math.max(d, clipEnd(c));
  return d;
}

export function findClip(tracks, id) {
  if (!id) return null;
  for (let ti = 0; ti < tracks.length; ti++) {
    const ci = tracks[ti].clips.findIndex((c) => c.id === id);
    if (ci >= 0) return { clip: tracks[ti].clips[ci], track: tracks[ti], ti, ci };
  }
  return null;
}

const mapClip = (tracks, id, fn) =>
  tracks.map((t) =>
    t.clips.some((c) => c.id === id)
      ? { ...t, clips: t.clips.map((c) => (c.id === id ? fn(c) : c)) }
      : t,
  );

const isFree = (track, start, dur, ignoreId) =>
  track.clips.every(
    (c) => c.id === ignoreId || clipEnd(c) <= start + 1e-6 || c.start >= start + dur - 1e-6,
  );

/** Posición válida más cercana a `start` dentro de la pista (sin solapar clips). */
export function resolveStart(track, ignoreId, start, dur) {
  start = Math.max(0, start);
  if (isFree(track, start, dur, ignoreId)) return start;
  const cands = [];
  for (const c of track.clips) {
    if (c.id === ignoreId) continue;
    cands.push(clipEnd(c), c.start - dur);
  }
  let best = null;
  for (const cand of cands) {
    if (cand < 0) continue;
    if (!isFree(track, cand, dur, ignoreId)) continue;
    if (best === null || Math.abs(cand - start) < Math.abs(best - start)) best = cand;
  }
  return best;
}

// --------------------------------------------------------------- historial
let lastKey = null;
let lastTs = 0;
const snapshot = (s) => ({ project: s.project, tracks: s.tracks, markers: s.markers });

/** Aplica un cambio al documento. `key` agrupa cambios continuos (sliders, arrastres). */
function mutate(fn, key = null) {
  const s = store.getState();
  const doc = snapshot(s);
  const patch = fn(doc);
  if (!patch) return false;
  const now = Date.now();
  let past = s.past;
  if (!(key && key === lastKey && now - lastTs < 1200)) past = [...s.past, doc].slice(-100);
  lastKey = key;
  lastTs = now;
  const tracks = patch.tracks ?? s.tracks;
  const selectedId = s.selectedId && findClip(tracks, s.selectedId) ? s.selectedId : null;
  const duration = calcDuration(tracks);
  store.setState({
    ...patch,
    past,
    future: [],
    duration,
    selectedId,
    currentTime: Math.min(s.currentTime, duration),
  });
  return true;
}

/** Sustituye todo el documento (abrir / crear / cerrar proyecto). */
export function loadDocument({ projectId, project, tracks, markers, media, view }) {
  lastKey = null;
  store.setState({
    view,
    projectId,
    saveState: 'saved',
    project,
    tracks,
    markers,
    media,
    past: [],
    future: [],
    duration: calcDuration(tracks),
    currentTime: 0,
    isPlaying: false,
    selectedId: null,
    panel: null,
    drag: null,
    exporting: null,
    previewZoom: 1,
  });
}

export function undo() {
  const s = store.getState();
  if (!s.past.length) return;
  const prev = s.past[s.past.length - 1];
  lastKey = null;
  store.setState({
    ...prev,
    past: s.past.slice(0, -1),
    future: [snapshot(s), ...s.future].slice(0, 100),
    duration: calcDuration(prev.tracks),
    selectedId: findClip(prev.tracks, s.selectedId) ? s.selectedId : null,
  });
}

export function redo() {
  const s = store.getState();
  if (!s.future.length) return;
  const next = s.future[0];
  lastKey = null;
  store.setState({
    ...next,
    past: [...s.past, snapshot(s)].slice(-100),
    future: s.future.slice(1),
    duration: calcDuration(next.tracks),
    selectedId: findClip(next.tracks, s.selectedId) ? s.selectedId : null,
  });
}

// ------------------------------------------------------------------- toast
let toastTimer = null;
export function toast(msg) {
  store.setState({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => store.setState({ toast: null }), 2200);
}

// ---------------------------------------------------------------- proyecto
export const projectSize = (project = store.getState().project) => RATIOS[project.ratio] ?? RATIOS['16:9'];

export function setProject(patch) {
  mutate((d) => ({ project: { ...d.project, ...patch } }), 'project');
}

// ----------------------------------------------------------------- medios
export function addMedia(item) {
  store.setState((s) => ({ media: { ...s.media, [item.id]: item } }));
  return item.id;
}
export function updateMedia(id, patch) {
  store.setState((s) => (s.media[id] ? { media: { ...s.media, [id]: { ...s.media[id], ...patch } } } : null));
}

// ----------------------------------------------------------------- clips
const baseClip = (type, extra) => ({
  id: uid('clip'),
  type,
  name: '',
  start: 0,
  duration: 3,
  trimStart: 0,
  speed: 1,
  reverse: false,
  transform: { ...DEFAULT_TRANSFORM },
  crop: { ...DEFAULT_CROP },
  color: { ...DEFAULT_COLOR },
  audio: { ...DEFAULT_AUDIO },
  transitionIn: null, // { type, duration }
  ...extra,
});

export function makeMediaClip(media, start) {
  return baseClip(media.kind, {
    mediaId: media.id,
    name: media.name,
    start,
    duration: media.kind === 'image' ? 5 : Math.max(0.1, media.duration || 5),
  });
}

export function makeTextClip(template, start) {
  const tpl = template ?? TEXT_TEMPLATES[0];
  return baseClip('text', {
    name: tpl.label,
    text: tpl.text,
    style: { ...DEFAULT_TEXT_STYLE, ...tpl.style },
    start,
    duration: 3,
  });
}

export function makeStickerClip(emoji, start) {
  return baseClip('sticker', {
    name: 'Sticker',
    text: emoji,
    style: { ...DEFAULT_TEXT_STYLE, size: 160, bold: false },
    start,
    duration: 3,
  });
}

export function makeEffectClip(effectId, start) {
  return baseClip('effect', { name: 'Efecto', effectId, intensity: 100, start, duration: 3 });
}

/** Coloca un clip en una pista compatible; si no hay hueco crea una pista nueva. */
function placeClip(tracks, clip, preferTrackId) {
  const kind = trackKindFor(clip.type);
  const idxs = tracks.map((t, i) => (t.kind === kind ? i : -1)).filter((i) => i >= 0);
  // la pista principal de video es la más baja; las demás son superposiciones
  const ordered = kind === 'video' ? [...idxs].reverse() : idxs;
  if (preferTrackId) {
    const pi = tracks.findIndex((t) => t.id === preferTrackId);
    if (pi >= 0 && tracks[pi].kind === kind) ordered.unshift(pi);
  }
  for (const i of ordered) {
    const t = tracks[i];
    if (t.locked) continue;
    const start = resolveStart(t, clip.id, clip.start, clip.duration);
    if (start !== null && Math.abs(start - clip.start) < 1e-6) {
      const placed = { ...clip, start };
      const out = tracks.map((tr, j) => (j === i ? { ...tr, clips: [...tr.clips, placed] } : tr));
      return { tracks: out, trackId: t.id, clip: placed };
    }
  }
  // hueco no disponible: pista nueva
  const count = tracks.filter((t) => t.kind === kind).length + 1;
  const nt = newTrack(kind, kind === 'video' ? `Capa ${count}` : kind === 'audio' ? `Audio ${count}` : `Texto ${count}`);
  nt.clips = [clip];
  let out;
  if (kind === 'audio') out = [...tracks, nt];
  else if (kind === 'text') out = [nt, ...tracks];
  else {
    const firstVideo = tracks.findIndex((t) => t.kind === 'video');
    out = [...tracks.slice(0, firstVideo), nt, ...tracks.slice(firstVideo)];
  }
  return { tracks: out, trackId: nt.id, clip };
}

export function insertClip(clip, preferTrackId = null) {
  let placedId = null;
  mutate((d) => {
    const r = placeClip(d.tracks, clip, preferTrackId);
    placedId = r.clip.id;
    return { tracks: r.tracks };
  });
  if (placedId) store.setState({ selectedId: placedId });
  return placedId;
}

/** Punto único para añadir recursos desde cualquier panel o desde el arrastre. */
export function addAsset(payload, { time = null, trackId = null } = {}) {
  const s = store.getState();
  const start = time ?? s.currentTime;
  let clip = null;
  if (payload.kind === 'media') {
    const m = s.media[payload.id];
    if (!m) return;
    clip = makeMediaClip(m, start);
  } else if (payload.kind === 'text') {
    clip = makeTextClip(TEXT_TEMPLATES.find((t) => t.id === payload.id), start);
  } else if (payload.kind === 'sticker') {
    clip = makeStickerClip(payload.emoji, start);
  } else if (payload.kind === 'effect') {
    clip = makeEffectClip(payload.id, start);
  } else if (payload.kind === 'audio') {
    const m = s.media[payload.id];
    if (!m) return;
    clip = makeMediaClip(m, start);
  } else if (payload.kind === 'filter') {
    return applyFilter(payload.id, payload.clipId);
  } else if (payload.kind === 'transition') {
    return applyTransition(payload.id, payload.clipId);
  }
  if (clip) return insertClip(clip, trackId);
}

export function selectClip(id) {
  store.setState({ selectedId: id });
}

export function patchClip(id, fn, key = null) {
  mutate((d) => {
    if (!findClip(d.tracks, id)) return null;
    return { tracks: mapClip(d.tracks, id, fn) };
  }, key ? `${key}:${id}` : null);
}

/** Cambia un grupo de propiedades de un sub-objeto: patchGroup(id,'transform',{x:10}) */
export function patchGroup(id, group, patch) {
  patchClip(id, (c) => ({ ...c, [group]: { ...c[group], ...patch } }), `${group}:${Object.keys(patch).join(',')}`);
}

export function deleteClip(id) {
  mutate((d) => ({
    tracks: d.tracks.map((t) => (t.clips.some((c) => c.id === id) ? { ...t, clips: t.clips.filter((c) => c.id !== id) } : t)),
  }));
}
export function deleteSelected() {
  const s = store.getState();
  if (!s.selectedId) return toast('Selecciona un clip primero');
  deleteClip(s.selectedId);
}

export function splitClip(id, t) {
  mutate((d) => {
    const f = findClip(d.tracks, id);
    if (!f) return null;
    const c = f.clip;
    if (t <= c.start + 0.05 || t >= clipEnd(c) - 0.05) return null;
    const d1 = t - c.start;
    const d2 = clipEnd(c) - t;
    const isMedia = c.type === 'video' || c.type === 'audio';
    const left = { ...c, duration: d1, audio: { ...c.audio, fadeOut: 0 } };
    const right = {
      ...c,
      id: uid('clip'),
      start: t,
      duration: d2,
      transitionIn: null,
      audio: { ...c.audio, fadeIn: 0 },
    };
    if (isMedia || c.type === 'image') {
      if (!c.reverse) right.trimStart = c.trimStart + d1 * c.speed;
      else left.trimStart = c.trimStart + d2 * c.speed;
    }
    const tracks = d.tracks.map((tr, i) =>
      i === f.ti ? { ...tr, clips: tr.clips.flatMap((x) => (x.id === id ? [left, right] : [x])) } : tr,
    );
    return { tracks };
  });
}

export function splitAtPlayhead() {
  const s = store.getState();
  let target = s.selectedId ? findClip(s.tracks, s.selectedId) : null;
  if (!target || s.currentTime <= target.clip.start || s.currentTime >= clipEnd(target.clip)) {
    // sin selección válida: corta el clip visible/audible en el cabezal (el de la pista más alta)
    target = null;
    for (const t of s.tracks) {
      if (t.locked) continue;
      const c = t.clips.find((c) => s.currentTime > c.start + 0.05 && s.currentTime < clipEnd(c) - 0.05);
      if (c) {
        target = { clip: c };
        break;
      }
    }
  }
  if (!target) return toast('No hay ningún clip bajo el cabezal');
  splitClip(target.clip.id, s.currentTime);
}

/** Mueve un clip (con cambio de pista opcional). Devuelve la posición final. */
export function moveClip(id, start, trackId) {
  mutate((d) => {
    const f = findClip(d.tracks, id);
    if (!f) return null;
    const c = f.clip;
    let target = d.tracks.find((t) => t.id === trackId) ?? f.track;
    if (target.kind !== f.track.kind || target.locked) target = f.track;
    const pos = resolveStart(target, id, start, c.duration);
    if (pos === null) return null;
    if (target.id === f.track.id && Math.abs(pos - c.start) < 1e-9) return null;
    const moved = { ...c, start: pos };
    const tracks = d.tracks.map((t) => {
      if (t.id === f.track.id && t.id === target.id) return { ...t, clips: t.clips.map((x) => (x.id === id ? moved : x)) };
      if (t.id === f.track.id) return { ...t, clips: t.clips.filter((x) => x.id !== id) };
      if (t.id === target.id) return { ...t, clips: [...t.clips, moved] };
      return t;
    });
    return { tracks };
  }, `move:${id}`);
}

/*
 * Mapa tiempo-del-clip -> tiempo-de-la-fuente:
 *   normal : trimStart + local * speed
 *   inversa: trimStart + (duration - local) * speed
 * En ambos casos el rango de fuente usado es [trimStart, trimStart + duration * speed].
 */

/** Recorta por la izquierda: `time` = nuevo inicio en la línea de tiempo. */
export function trimLeft(id, time, mediaDuration = Infinity) {
  mutate((d) => {
    const f = findClip(d.tracks, id);
    if (!f) return null;
    const c = f.clip;
    const isMedia = c.type === 'video' || c.type === 'audio';
    const prevEnd = Math.max(0, ...f.track.clips.filter((x) => x.id !== id && clipEnd(x) <= c.start + 1e-6).map(clipEnd));
    let minStart = prevEnd;
    if (isMedia) {
      // normal: no puede ir antes del inicio de la fuente; inversa: no puede pasar del final de la fuente
      minStart = c.reverse
        ? Math.max(minStart, clipEnd(c) - (mediaDuration - c.trimStart) / c.speed)
        : Math.max(minStart, c.start - c.trimStart / c.speed);
    }
    const ns = clamp(time, minStart, clipEnd(c) - 0.1);
    const delta = ns - c.start;
    const trimStart = isMedia && !c.reverse ? c.trimStart + delta * c.speed : c.trimStart;
    return { tracks: mapClip(d.tracks, id, (x) => ({ ...x, start: ns, duration: clipEnd(c) - ns, trimStart })) };
  }, `trimL:${id}`);
}

/** Recorta por la derecha: `time` = nuevo final en la línea de tiempo. */
export function trimRight(id, time, mediaDuration = Infinity) {
  mutate((d) => {
    const f = findClip(d.tracks, id);
    if (!f) return null;
    const c = f.clip;
    const isMedia = c.type === 'video' || c.type === 'audio';
    const next = Math.min(Infinity, ...f.track.clips.filter((x) => x.id !== id && x.start >= clipEnd(c) - 1e-6).map((x) => x.start));
    let maxEnd = next;
    if (isMedia) maxEnd = Math.min(maxEnd, c.start + Math.max(0.1, (mediaDuration - c.trimStart) / c.speed));
    const ne = clamp(time, c.start + 0.1, Math.max(c.start + 0.1, maxEnd));
    return { tracks: mapClip(d.tracks, id, (x) => ({ ...x, duration: ne - c.start })) };
  }, `trimR:${id}`);
}

export function setClipSpeed(id, speed) {
  speed = clamp(speed, 0.1, 100);
  mutate((d) => {
    const f = findClip(d.tracks, id);
    if (!f) return null;
    const c = f.clip;
    let dur = Math.max(0.1, (c.duration * c.speed) / speed);
    const next = Math.min(Infinity, ...f.track.clips.filter((x) => x.id !== id && x.start >= clipEnd(c) - 1e-6).map((x) => x.start));
    dur = Math.min(dur, next - c.start);
    return { tracks: mapClip(d.tracks, id, (x) => ({ ...x, speed, duration: dur })) };
  }, `speed:${id}`);
}

export function setClipReverse(id, reverse) {
  patchClip(id, (c) => ({ ...c, reverse }));
}

export function applyFilter(lutId, clipId) {
  const s = store.getState();
  const id = clipId ?? s.selectedId;
  const f = findClip(s.tracks, id);
  if (!f || !(f.clip.type === 'video' || f.clip.type === 'image')) return toast('Selecciona un clip de video o imagen');
  patchGroup(id, 'color', { lut: lutId });
}

export function applyTransition(type, clipId) {
  const s = store.getState();
  const id = clipId ?? s.selectedId;
  const f = findClip(s.tracks, id);
  if (!f || f.clip.type === 'audio' || f.clip.type === 'effect') return toast('Selecciona un clip de video, imagen o texto');
  patchClip(id, (c) => ({
    ...c,
    transitionIn: type === 'none' ? null : { type, duration: c.transitionIn?.duration ?? Math.min(1, c.duration / 2) },
  }));
}

/** Separa el audio de un clip de video a una pista de audio. */
export function detachAudio(id) {
  const s = store.getState();
  const f = findClip(s.tracks, id ?? s.selectedId);
  if (!f || f.clip.type !== 'video') return toast('Selecciona un clip de video');
  const c = f.clip;
  const audioClip = {
    ...c,
    id: uid('clip'),
    type: 'audio',
    name: `${c.name} (audio)`,
    transitionIn: null,
    audio: { ...c.audio },
  };
  mutate((d) => {
    const placed = placeClip(d.tracks, audioClip, null);
    return {
      tracks: mapClip(placed.tracks, c.id, (x) => ({ ...x, audio: { ...x.audio, volume: 0 } })),
    };
  });
  toast('Audio separado en una pista nueva');
}

export function toggleTrack(trackId, prop) {
  mutate((d) => ({ tracks: d.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: !t[prop] } : t)) }));
}

// ---------------------------------------------------------------- marcadores
export function addMarker(time) {
  mutate((d) => {
    const t = Math.round(time * 100) / 100;
    if (d.markers.some((m) => Math.abs(m - t) < 0.05)) return { markers: d.markers.filter((m) => Math.abs(m - t) >= 0.05) };
    return { markers: [...d.markers, t].sort((a, b) => a - b) };
  });
}

// ---------------------------------------------------------------- transporte
export function seek(t) {
  const s = store.getState();
  store.setState({ currentTime: clamp(t, 0, s.duration) });
}
export function play() {
  const s = store.getState();
  if (s.duration <= 0) return toast('Añade un clip para reproducir');
  const t = s.currentTime >= s.duration - 0.02 ? 0 : s.currentTime;
  store.setState({ isPlaying: true, currentTime: t });
}
export function pause() {
  store.setState({ isPlaying: false });
}
export function togglePlay() {
  store.getState().isPlaying ? pause() : play();
}
export function stepFrames(n) {
  const s = store.getState();
  pause();
  seek(s.currentTime + n / s.project.fps);
}

// ------------------------------------------------------------------- vista
export const setZoom = (z) => store.setState({ zoom: clamp(z, 6, 400) });
export const setTool = (tool) => store.setState({ tool });
export const toggleSnapping = () => store.setState((s) => ({ snapping: !s.snapping }));
