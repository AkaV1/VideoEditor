// Ciclo de vida de proyectos: crear, abrir, guardar automáticamente, duplicar, borrar.
import { store, getState, loadDocument, freshDocument, pause, toast } from '../store/store.js';
import { engine } from './engine.js';
import { uid } from './time.js';
import { ensureLibraryAudio, stopPreview } from './synth.js';
import * as db from './db.js';

const isLib = (m) => m.library || String(m.id).startsWith('lib_');

function serializeMedia(media) {
  const out = {};
  for (const m of Object.values(media)) {
    if (isLib(m)) {
      out[m.id] = { id: m.id, kind: 'audio', library: true };
      continue;
    }
    const { url, ...rest } = m; // eslint-disable-line no-unused-vars
    out[m.id] = { ...rest, thumbs: m.kind === 'image' ? [] : m.thumbs };
  }
  return out;
}

function pickThumb(s) {
  const clips = s.tracks
    .filter((t) => t.kind === 'video')
    .flatMap((t) => t.clips)
    .sort((a, b) => a.start - b.start);
  for (const c of clips) {
    const m = s.media[c.mediaId];
    const t = m && (m.poster || m.thumbs?.find((x) => x?.startsWith('data:')));
    if (t) return t;
  }
  return null;
}

let saving = Promise.resolve();
let timer = null;

function buildRecord(s, prev) {
  return {
    id: s.projectId,
    name: s.project.name || 'Proyecto sin título',
    ratio: s.project.ratio,
    created: prev?.created ?? Date.now(),
    updated: Date.now(),
    duration: s.duration,
    thumb: pickThumb(s) ?? prev?.thumb ?? null,
    doc: { project: s.project, tracks: s.tracks, markers: s.markers },
    media: serializeMedia(s.media),
  };
}

/** Guarda ya el proyecto abierto. */
export function saveNow() {
  clearTimeout(timer);
  timer = null;
  const s = getState();
  if (!s.projectId || s.view !== 'editor') return saving;
  saving = saving
    .then(async () => {
      const prev = await db.getProject(s.projectId);
      await db.putProject(buildRecord(s, prev));
      if (getState().projectId === s.projectId) store.setState({ saveState: timer ? 'pending' : 'saved' });
    })
    .catch(() => {
      store.setState({ saveState: 'error' });
    });
  return saving;
}

function schedule() {
  store.setState({ saveState: 'pending' });
  clearTimeout(timer);
  timer = setTimeout(saveNow, 900);
}

export function initAutosave() {
  db.requestPersistence();
  let last = null;
  store.subscribe(() => {
    const s = getState();
    if (s.view !== 'editor' || !s.projectId) {
      last = null;
      return;
    }
    const cur = [s.projectId, s.project, s.tracks, s.markers, s.media];
    if (last && last.every((v, i) => Object.is(v, cur[i]))) return;
    const first = !last || last[0] !== cur[0];
    last = cur;
    if (!first) schedule();
  });
  const flush = () => {
    if (document.hidden) saveNow();
  };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('pagehide', saveNow);
  window.addEventListener('popstate', () => {
    if (getState().view === 'editor') closeProject();
  });
}

// ------------------------------------------------------------------ abrir
function releaseMedia(media) {
  for (const m of Object.values(media)) if (m.url && m.url.startsWith('blob:')) URL.revokeObjectURL(m.url);
}

function enterEditor() {
  try {
    history.pushState({ lc: 'editor' }, '');
  } catch {
    /* sin historial */
  }
}

export async function newProject() {
  const id = uid('prj');
  const doc = freshDocument();
  const old = getState().media;
  engine.reset();
  releaseMedia(old);
  loadDocument({ projectId: id, ...doc, media: {}, view: 'editor' });
  enterEditor();
  await saveNow();
}

export async function openProject(id) {
  const rec = await db.getProject(id);
  if (!rec) {
    toast('No se encontró el proyecto');
    return;
  }
  const media = {};
  let missing = 0;
  const libs = [];
  for (const m of Object.values(rec.media || {})) {
    if (m.library) {
      libs.push(m.id.replace(/^lib_/, ''));
      continue;
    }
    const blob = await db.getBlob(id, m.id);
    if (!blob) {
      missing++;
      continue;
    }
    const url = URL.createObjectURL(blob);
    media[m.id] = { ...m, url, thumbs: m.kind === 'image' ? [url] : m.thumbs || [] };
  }
  const old = getState().media;
  engine.reset();
  releaseMedia(old);
  loadDocument({ projectId: id, ...rec.doc, media, view: 'editor' });
  enterEditor();
  libs.forEach((l) => ensureLibraryAudio(l).catch(() => {}));
  if (missing) toast(`${missing} medio(s) no se pudieron recuperar`);
}

export async function closeProject() {
  pause();
  stopPreview();
  const s = getState();
  const empty = !s.tracks.some((t) => t.clips.length);
  if (empty && s.projectId && Object.keys(s.media).length === 0) {
    clearTimeout(timer);
    await saving;
    await db.deleteProject(s.projectId); // un proyecto vacío no se conserva
  } else {
    await saveNow();
  }
  const old = getState().media;
  engine.reset();
  releaseMedia(old);
  loadDocument({ projectId: null, ...freshDocument(), media: {}, view: 'home' });
}

/** Vuelve al inicio (usa el historial para que el botón «atrás» sea coherente). */
export function goHome() {
  if (history.state?.lc === 'editor') history.back();
  else closeProject();
}

// ------------------------------------------------------- gestión desde inicio
export const listAll = async () => (await db.listProjects()).sort((a, b) => b.updated - a.updated);

export async function renameProject(id, name) {
  const rec = await db.getProject(id);
  if (!rec) return;
  const nm = name.trim() || 'Proyecto sin título';
  rec.name = nm;
  rec.doc = { ...rec.doc, project: { ...rec.doc.project, name: nm } };
  rec.updated = Date.now();
  await db.putProject(rec);
}

export async function duplicateProject(id) {
  const rec = await db.getProject(id);
  if (!rec) return;
  const nid = uid('prj');
  const nm = `${rec.name} (copia)`;
  await db.copyBlobs(id, nid, Object.keys(rec.media || {}).filter((k) => !rec.media[k].library));
  await db.putProject({
    ...rec,
    id: nid,
    name: nm,
    doc: { ...rec.doc, project: { ...rec.doc.project, name: nm } },
    created: Date.now(),
    updated: Date.now(),
  });
}

export const removeProject = (id) => db.deleteProject(id);
export { storageUsage } from './db.js';
