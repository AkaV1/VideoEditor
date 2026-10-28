// Operaciones de la biblioteca de efectos: aplicar, editar, duplicar, quitar y favoritos.
import { useSyncExternalStore } from 'react';
import { store, patchClip, toast, insertClip, makeEffectClip, findClip, addMarkers } from './store.js';
import { detectBeats } from '../lib/fx/beats.js';
import { uid } from '../lib/time.js';
import { getItem } from '../lib/fx/registry.js';
import { defaultParams } from '../lib/fx/params.js';
import { getParticles } from '../lib/fx/particles.js';
import { getAnim } from '../lib/fx/anim.js';
import { getTextFx } from '../lib/fx/textfx.js';
import { getAudioFx, audioFxParams } from '../lib/fx/audiofx.js';
import { perf } from '../lib/fx/apply.js';

const VISUAL = ['video', 'image', 'text', 'sticker'];
const sel = (id) => { const s = store.getState(); const f = findClip(s.tracks, id ?? s.selectedId); return f ? f.clip : null; };
const dflt = (it) => { const o = {}; for (const d of it.params || []) o[d.id] = d.def; return o; };

/** Resuelve cualquier elemento del catálogo (efecto, filtro, transición, partículas, animación…). */
export function resolveItem(kind, id) {
  if (kind === 'particles') return getParticles(id);
  if (kind === 'anim') return getAnim(id);
  if (kind === 'text') return getTextFx(id);
  if (kind === 'audio') return getAudioFx(id);
  return getItem(kind, id);
}

// ------------------------------------------------------------ capas de efecto
export function addFxLayer(kind, id, { time = null, params = null } = {}) {
  const it = resolveItem(kind, id);
  if (!it) return;
  const s = store.getState();
  const c = makeEffectClip(null, time ?? s.currentTime);
  const clip = { ...c, name: it.label, fxKind: kind, fxId: id, fxParams: { ...defaultParams(it), ...(params || {}) }, duration: kind === 'particles' ? 5 : 3 };
  const cid = insertClip(clip);
  toast(`Capa «${it.label}» añadida`);
  return cid;
}
export function setFxLayerParams(clipId, patch) {
  patchClip(clipId, (c) => ({ ...c, fxParams: { ...c.fxParams, ...patch } }), 'fxlayer');
}

// ------------------------------------------------------------ efectos por clip
export function addClipFx(kind, id, clipId, params = null) {
  const c = sel(clipId);
  const it = resolveItem(kind, id);
  if (!c || !it || !VISUAL.includes(c.type)) return toast('Selecciona un clip de video, imagen o texto');
  patchClip(c.id, (x) => ({ ...x, fx: [...(x.fx || []), { uid: uid('fx'), kind, id, p: { ...dflt(it), ...(params || {}) } }] }));
  return true;
}
const mapFx = (clipId, fn) => patchClip(clipId, (c) => ({ ...c, fx: fn([...(c.fx || [])]) }));
export function updateClipFx(clipId, fuid, patch) {
  patchClip(clipId, (c) => ({ ...c, fx: (c.fx || []).map((f) => (f.uid === fuid ? { ...f, ...(patch.p ? { p: { ...f.p, ...patch.p } } : {}), ...(patch.off !== undefined ? { off: patch.off } : {}) } : f)) }), `fx:${fuid}`);
}
export const removeClipFx = (clipId, fuid) => mapFx(clipId, (l) => l.filter((f) => f.uid !== fuid));
export const clearClipFx = (clipId) => mapFx(clipId, () => []);
export const duplicateClipFx = (clipId, fuid) => mapFx(clipId, (l) => { const i = l.findIndex((f) => f.uid === fuid); if (i >= 0) l.splice(i + 1, 0, { ...l[i], p: { ...l[i].p }, uid: uid('fx') }); return l; });
export const moveClipFx = (clipId, fuid, dir) => mapFx(clipId, (l) => { const i = l.findIndex((f) => f.uid === fuid); const j = i + dir; if (i >= 0 && j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]]; return l; });
export const resetClipFx = (clipId, fuid) => {
  const c = sel(clipId); const f = c?.fx?.find((x) => x.uid === fuid); const it = f && resolveItem(f.kind, f.id);
  if (it) updateClipFx(clipId, fuid, { p: dflt(it) });
};

// ------------------------------------------------------------ animaciones de clip
/** slot: 'in' | 'out' | 'loop'. id null quita la animación. */
export function setAnim(clipId, slot, id, patch = {}) {
  const c = sel(clipId);
  if (!c || !VISUAL.includes(c.type)) return toast('Selecciona un clip de video, imagen o texto');
  const it = id && getAnim(id);
  patchClip(c.id, (x) => {
    const a = { ...(x.anim || {}) };
    if (!id) delete a[slot];
    else {
      const prev = a[slot]?.id === id ? a[slot] : null;
      a[slot] = { id, duration: patch.duration ?? prev?.duration ?? 0.8, p: { ...dflt(it), ...(prev?.p || {}), ...(patch.p || {}) } };
    }
    return { ...x, anim: a };
  }, patch.p || patch.duration ? `anim:${slot}` : null);
}

// ------------------------------------------------------------ texto animado
export function setTextFx(clipId, id, patch = {}) {
  const c = sel(clipId);
  if (!c || (c.type !== 'text')) return toast('Selecciona un clip de texto');
  const it = getTextFx(id);
  patchClip(c.id, (x) => {
    const list = (x.textFx || []).filter((f) => getTextFx(f.id)?.mode !== it.mode || f.id === id);
    const i = list.findIndex((f) => f.id === id);
    if (i >= 0) list[i] = { ...list[i], p: { ...list[i].p, ...(patch.p || {}) } };
    else list.push({ id, p: dflt(it) });
    return { ...x, textFx: list };
  }, patch.p ? `textfx:${id}` : null);
}
export const removeTextFx = (clipId, id) => patchClip(clipId, (x) => ({ ...x, textFx: (x.textFx || []).filter((f) => f.id !== id) }));

// ------------------------------------------------------------ transiciones
export function setTransitionParams(clipId, side, patch) {
  const key = side === 'out' ? 'transitionOut' : 'transitionIn';
  patchClip(clipId, (c) => (c[key] ? { ...c, [key]: { ...c[key], ...(patch.p ? { p: { ...(c[key].p || {}), ...patch.p } } : {}), ...(patch.duration !== undefined ? { duration: patch.duration } : {}) } } : c), `tr:${key}`);
}

export function applyTransitionFull(type, side, params, duration, clipId) {
  const c = sel(clipId);
  if (!c || !VISUAL.includes(c.type)) return toast('Selecciona un clip de video, imagen o texto');
  const key = side === 'out' ? 'transitionOut' : 'transitionIn';
  const it = getItem('transition', type);
  patchClip(c.id, (x) => ({ ...x, [key]: type === 'none' ? null : { type, duration: duration ?? x[key]?.duration ?? Math.min(1, x.duration / 2), p: { ...(it ? dflt(it) : {}), ...(params || {}) } } }));
}

// ------------------------------------------------------------ audio
export function addAudioFx(id, clipId, params = null) {
  const c = sel(clipId);
  const it = getAudioFx(id);
  if (!c || !it || !(c.type === 'video' || c.type === 'audio')) return toast('Selecciona un clip de video o audio');
  patchClip(c.id, (x) => ({ ...x, audioFx: [...(x.audioFx || []), { uid: uid('afx'), id, p: audioFxParams(it, params || {}) }] }));
  return true;
}
export function updateAudioFx(clipId, fuid, patch) {
  patchClip(clipId, (c) => ({ ...c, audioFx: (c.audioFx || []).map((f) => (f.uid === fuid ? { ...f, ...(patch.p ? { p: { ...f.p, ...patch.p } } : {}), ...(patch.off !== undefined ? { off: patch.off } : {}) } : f)) }), `afx:${fuid}`);
}
export const removeAudioFx = (clipId, fuid) => patchClip(clipId, (c) => ({ ...c, audioFx: (c.audioFx || []).filter((f) => f.uid !== fuid) }));

// ------------------------------------------------------------ favoritos y rendimiento
const KEY = 'linecut.favs';
let favs = new Set();
try { favs = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* sin almacenamiento */ }
const subs = new Set();
let favSnap = [...favs];
export const isFav = (kind, id) => favs.has(`${kind}:${id}`);
export function toggleFav(kind, id) {
  const k = `${kind}:${id}`;
  if (favs.has(k)) favs.delete(k); else favs.add(k);
  favSnap = [...favs];
  try { localStorage.setItem(KEY, JSON.stringify(favSnap)); } catch { /* ignorar */ }
  subs.forEach((f) => f());
}
export const useFavs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => favSnap);

let lowSnap = false;
try { lowSnap = localStorage.getItem('linecut.lowperf') === '1'; } catch { /* nada */ }
perf.low = lowSnap;
const lowSubs = new Set();
export function setLowPerf(v) {
  perf.low = v; lowSnap = v;
  try { localStorage.setItem('linecut.lowperf', v ? '1' : '0'); } catch { /* nada */ }
  lowSubs.forEach((f) => f());
  store.setState({ dirtyFx: Date.now() });
}
export const useLowPerf = () => useSyncExternalStore((f) => { lowSubs.add(f); return () => lowSubs.delete(f); }, () => lowSnap);

/** Marca el ritmo (aprox.) del audio de un clip en la línea de tiempo. */
export async function markBeats(clipId) {
  const c = sel(clipId);
  const m = c && store.getState().media[c.mediaId];
  if (!c || !m || !(c.type === 'video' || c.type === 'audio')) return toast('Selecciona un clip con audio');
  toast('Analizando el ritmo…');
  try {
    const beats = await detectBeats(m.url);
    const times = beats
      .map((t) => c.start + (t - c.trimStart) / (c.speed || 1))
      .filter((t) => t >= c.start && t <= c.start + c.duration);
    if (!times.length) return toast('No se detectaron golpes claros');
    addMarkers(times);
    toast(`${times.length} marcas de ritmo añadidas`);
  } catch {
    toast('No se pudo analizar el audio');
  }
}
