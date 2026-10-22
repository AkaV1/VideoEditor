// Keyframes: animan propiedades de un clip en el tiempo.
// clip.keyframes = { x: [{ t, v, e }], ... }  — `t` en segundos desde el inicio del clip;
// `e` es la suavidad del tramo que sale de ese keyframe: 'linear' | 'smooth' | 'hold'.
import { clamp } from './time.js';

/** Propiedad animable → grupo del clip donde vive su valor base. */
export const KF_PROPS = {
  x: 'transform',
  y: 'transform',
  scale: 'transform',
  rotation: 'transform',
  opacity: 'transform',
  volume: 'audio',
};

export const KF_LABELS = {
  x: 'Posición X',
  y: 'Posición Y',
  scale: 'Escala',
  rotation: 'Rotación',
  opacity: 'Opacidad',
  volume: 'Volumen',
};

export const EASINGS = [
  { id: 'linear', label: 'Lineal' },
  { id: 'smooth', label: 'Suave' },
  { id: 'hold', label: 'Mantener' },
];

/** Propiedades que se pueden animar según el tipo de clip. */
export function propsFor(clip) {
  if (clip.type === 'audio') return ['volume'];
  if (clip.type === 'effect') return [];
  const base = ['x', 'y', 'scale', 'rotation', 'opacity'];
  return clip.type === 'video' ? [...base, 'volume'] : base;
}

export const EPS = 0.02; // dos keyframes más cerca que esto cuentan como el mismo

const ease = (k, p) => (k === 'hold' ? 0 : k === 'smooth' ? p * p * (3 - 2 * p) : p);

export function hasKeyframes(clip, prop) {
  const k = clip.keyframes?.[prop];
  return !!(k && k.length);
}

export function anyKeyframes(clip) {
  const k = clip.keyframes;
  return !!k && Object.values(k).some((a) => a && a.length);
}

/** Valor de la propiedad en el instante local `local` (segundos desde el inicio del clip). */
export function valueAt(clip, prop, local) {
  const list = clip.keyframes?.[prop];
  const base = clip[KF_PROPS[prop]]?.[prop];
  if (!list || !list.length) return base;
  if (local <= list[0].t) return list[0].v;
  const last = list[list.length - 1];
  if (local >= last.t) return last.v;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    if (local >= a.t && local <= b.t) {
      const p = b.t === a.t ? 1 : (local - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * ease(a.e, p);
    }
  }
  return base;
}

/** transform del clip con los keyframes aplicados en `local`. */
export function evalTransform(clip, local) {
  const tf = clip.transform;
  if (!anyKeyframes(clip)) return tf;
  let out = tf;
  for (const p of ['x', 'y', 'scale', 'rotation', 'opacity']) {
    if (hasKeyframes(clip, p)) {
      if (out === tf) out = { ...tf };
      out[p] = valueAt(clip, p, local);
    }
  }
  return out;
}

export const evalVolume = (clip, local) => valueAt(clip, 'volume', local);

/** Instante local limitado al clip. */
export const localTime = (clip, t) => clamp(t - clip.start, 0, clip.duration);

/** Índice del keyframe en `local` (con tolerancia) o -1. */
export const kfIndexAt = (list, local) => (list ? list.findIndex((k) => Math.abs(k.t - local) < EPS) : -1);

/** Todos los instantes (únicos, ordenados) con algún keyframe. */
export function allTimes(clip) {
  const out = [];
  for (const list of Object.values(clip.keyframes || {})) {
    for (const k of list || []) if (!out.some((t) => Math.abs(t - k.t) < EPS)) out.push(k.t);
  }
  return out.sort((a, b) => a - b);
}

/** Lista nueva con el keyframe de `local` fijado (inserta o reemplaza). */
export function setKf(list, local, v, e) {
  const arr = list ? [...list] : [];
  const i = kfIndexAt(arr, local);
  if (i >= 0) arr[i] = { ...arr[i], v, ...(e ? { e } : {}) };
  else {
    arr.push({ t: local, v, e: e || 'smooth' });
    arr.sort((a, b) => a.t - b.t);
  }
  return arr;
}

/** Divide los keyframes de un clip en `d1` (segundos locales) para los dos trozos resultantes. */
export function splitKeyframes(clip, d1) {
  const left = {};
  const right = {};
  for (const [prop, list] of Object.entries(clip.keyframes || {})) {
    if (!list || !list.length) continue;
    const mid = valueAt(clip, prop, d1);
    const before = list.filter((k) => k.t < d1 - EPS);
    const after = list.filter((k) => k.t > d1 + EPS);
    const at = list.find((k) => Math.abs(k.t - d1) <= EPS);
    const e = at?.e ?? [...before].pop()?.e ?? 'smooth';
    left[prop] = [...before, ...(after.length || at ? [{ t: d1, v: mid, e }] : [])];
    right[prop] = [
      ...(before.length || at ? [{ t: 0, v: mid, e: at?.e ?? e }] : []),
      ...after.map((k) => ({ ...k, t: k.t - d1 })),
    ];
    if (!left[prop].length) delete left[prop];
    if (!right[prop].length) delete right[prop];
  }
  return [left, right];
}

/** Desplaza todos los keyframes `dt` segundos (recorte por la izquierda) y descarta los negativos. */
export function shiftKeyframes(kfs, dt, clipDuration) {
  if (!kfs) return kfs;
  const out = {};
  for (const [prop, list] of Object.entries(kfs)) {
    const moved = (list || []).map((k) => ({ ...k, t: k.t + dt }));
    let kept = moved.filter((k) => k.t >= -EPS && k.t <= clipDuration + EPS);
    // si recortamos keyframes del principio, deja uno en 0 con el valor interpolado
    const lead = moved.filter((k) => k.t < -EPS);
    if (lead.length && !kept.some((k) => k.t < EPS)) {
      const a = lead[lead.length - 1];
      const b = moved.find((k) => k.t > -EPS);
      const p = b ? (0 - a.t) / (b.t - a.t) : 1;
      kept = [{ t: 0, v: b ? a.v + (b.v - a.v) * ease(a.e, p) : a.v, e: a.e }, ...kept];
    }
    kept = kept.map((k) => ({ ...k, t: clamp(k.t, 0, clipDuration) }));
    if (kept.length) out[prop] = kept;
  }
  return out;
}

/** Cambia la escala temporal (cambio de velocidad). */
export function scaleKeyframes(kfs, ratio) {
  if (!kfs) return kfs;
  const out = {};
  for (const [prop, list] of Object.entries(kfs)) out[prop] = (list || []).map((k) => ({ ...k, t: k.t * ratio }));
  return out;
}
