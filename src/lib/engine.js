// Motor de reproducción: reloj maestro + sincronización de elementos <video> + audio Web Audio
// + dibujo del fotograma en el canvas de la vista previa (y en el canvas de exportación).
import { store, getState, projectSize, pause } from '../store/store.js';
import { Scratch, drawFrame, clipBox, naturalSize } from './render.js';
import { clamp } from './time.js';

const pitchFactor = (c) => (c.type === 'audio' && c.audio.pitch ? Math.pow(2, c.audio.pitch / 12) : 1);
/** Velocidad de lectura de la fuente respecto al tiempo del proyecto. */
export const sourceRate = (c) => c.speed * pitchFactor(c);

class Engine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.els = new Map(); // clipId -> entrada de medio
    this.images = new Map(); // mediaId -> HTMLImageElement
    this.scratch = new Scratch();
    this.measure = document.createElement('canvas').getContext('2d');
    this.audio = null;
    this.dirty = true;
    this.exportTarget = null;
    this.raf = 0;
    this.lastTs = 0;
    this.sig = {};
    this.loop = this.loop.bind(this);
  }

  // ----------------------------------------------------------- ciclo de vida
  attach(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }
  detach() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
    this.ctx = null;
  }
  markDirty() {
    this.dirty = true;
  }
  /** Libera todos los elementos de medio (al cerrar o cambiar de proyecto). */
  reset() {
    for (const id of Array.from(this.els.keys())) this.release(id);
    this.images.clear();
    this.dirty = true;
  }

  // -------------------------------------------------------------------- audio
  ensureAudio() {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain();
      const monitor = ctx.createGain();
      const exportDest = ctx.createMediaStreamDestination();
      master.connect(monitor).connect(ctx.destination);
      master.connect(exportDest);
      this.audio = { ctx, master, monitor, exportDest };
      this.els.forEach((e) => this.connect(e));
    }
    if (this.audio.ctx.state === 'suspended') this.audio.ctx.resume().catch(() => {});
  }

  connect(e) {
    if (!this.audio || e.node) return;
    const { ctx, master } = this.audio;
    try {
      e.node = ctx.createMediaElementSource(e.el);
    } catch {
      return;
    }
    e.hp = ctx.createBiquadFilter();
    e.hp.type = 'highpass';
    e.hp.frequency.value = 10;
    e.lp = ctx.createBiquadFilter();
    e.lp.type = 'lowpass';
    e.lp.frequency.value = 22000;
    e.gain = ctx.createGain();
    e.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    e.node.connect(e.hp);
    e.hp.connect(e.lp);
    e.lp.connect(e.gain);
    if (e.pan) {
      e.gain.connect(e.pan);
      e.pan.connect(master);
    } else e.gain.connect(master);
  }

  setMonitor(v) {
    if (this.audio) this.audio.monitor.gain.value = v;
  }
  get exportAudioTracks() {
    return this.audio ? this.audio.exportDest.stream.getAudioTracks() : [];
  }

  // ------------------------------------------------------------------- medios
  entryFor(clip, media) {
    let e = this.els.get(clip.id);
    if (e) return e;
    const el = document.createElement('video');
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.src = media.url;
    const mark = () => (this.dirty = true);
    el.addEventListener('seeked', mark);
    el.addEventListener('loadeddata', mark);
    e = { el, mediaId: media.id, node: null, lastSeek: -1, lastSeekAt: 0 };
    this.els.set(clip.id, e);
    this.connect(e);
    return e;
  }

  imageFor(media) {
    let img = this.images.get(media.id);
    if (!img) {
      img = new Image();
      img.onload = () => (this.dirty = true);
      img.src = media.url;
      this.images.set(media.id, img);
    }
    return img;
  }

  getSource(clip) {
    const s = getState();
    if (clip.type === 'image') {
      const m = s.media[clip.mediaId];
      if (!m) return null;
      const img = this.imageFor(m);
      return img.complete && img.naturalWidth ? { el: img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    if (clip.type === 'video') {
      const e = this.els.get(clip.id);
      if (!e || !e.el.videoWidth) return null;
      return { el: e.el, w: e.el.videoWidth, h: e.el.videoHeight };
    }
    return null;
  }

  release(id) {
    const e = this.els.get(id);
    if (!e) return;
    e.el.pause();
    try {
      e.node?.disconnect();
      e.hp?.disconnect();
      e.lp?.disconnect();
      e.gain?.disconnect();
      e.pan?.disconnect();
    } catch {
      /* ya desconectado */
    }
    e.el.removeAttribute('src');
    e.el.load();
    this.els.delete(id);
  }

  /** Coloca cada elemento de medio en el punto de la fuente que corresponde a `t`. */
  syncMedia(s, playing, t) {
    const live = new Set();
    for (const track of s.tracks) {
      for (const c of track.clips) {
        if (c.type !== 'video' && c.type !== 'audio') continue;
        live.add(c.id);
        const media = s.media[c.mediaId];
        if (!media) continue;
        const near = t >= c.start - 1.5 && t < c.start + c.duration + 0.3;
        let e = this.els.get(c.id);
        if (!e) {
          if (!near) continue;
          e = this.entryFor(c, media);
        }
        const el = e.el;
        const active = t >= c.start && t < c.start + c.duration;
        const local = t - c.start;
        const rate = sourceRate(c);
        const maxSrc = Math.max(0, (media.duration || 1e9) - 0.02);
        const srcAt = (loc) => clamp(c.reverse ? c.trimStart + (c.duration - loc) * rate : c.trimStart + loc * rate, 0, maxSrc);
        const seekTo = (v, minGap = 0.02) => {
          const now = performance.now();
          if (Math.abs(e.lastSeek - v) < minGap && el.seeking) return;
          if (c.reverse && now - e.lastSeekAt < 70) return;
          e.lastSeek = v;
          e.lastSeekAt = now;
          try {
            el.currentTime = v;
          } catch {
            /* aún sin metadatos */
          }
        };

        if (active) {
          const expected = srcAt(local);
          if (playing && !c.reverse) {
            const pr = clamp(rate, 0.0625, 16);
            if (el.playbackRate !== pr) el.playbackRate = pr;
            if (c.type === 'audio') el.preservesPitch = !c.audio.pitch;
            if (Math.abs(el.currentTime - expected) > 0.35) seekTo(expected, 0.1);
            if (el.paused) el.play().catch(() => {});
          } else {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - expected) > (c.reverse ? 0.02 : 0.04)) seekTo(expected);
          }
        } else {
          if (!el.paused) el.pause();
          if (near && t < c.start) {
            const first = srcAt(0);
            if (Math.abs(el.currentTime - first) > 0.15) seekTo(first, 0.1);
          }
        }

        // Cadena de audio por clip
        if (e.gain) {
          const a = c.audio;
          let g = a.volume / 100;
          if (a.fadeIn > 0 && local < a.fadeIn) g *= clamp(local / a.fadeIn, 0, 1);
          if (a.fadeOut > 0 && local > c.duration - a.fadeOut) g *= clamp((c.duration - local) / a.fadeOut, 0, 1);
          if (track.muted || !active || !playing) g = 0;
          const now = this.audio.ctx.currentTime;
          e.gain.gain.setTargetAtTime(clamp(g, 0, 4), now, 0.012);
          if (e.pan) e.pan.pan.setTargetAtTime(clamp(a.balance / 100, -1, 1), now, 0.02);
          e.hp.frequency.setTargetAtTime(a.denoise > 0 ? 40 + a.denoise * 2 : 10, now, 0.05);
          e.lp.frequency.setTargetAtTime(a.denoise > 0 ? 18000 - a.denoise * 100 : 22000, now, 0.05);
        }
      }
    }
    // limpia lo que ya no existe en la línea de tiempo
    for (const id of [...this.els.keys()]) if (!live.has(id)) this.release(id);
  }

  stopAllMedia() {
    this.els.forEach((e) => e.el.pause());
  }

  // ------------------------------------------------------------------ dibujo
  boxOf(clip) {
    const s = getState();
    const [bw, bh] = projectSize(s.project);
    const src = clip.type === 'video' || clip.type === 'image' ? this.getSource(clip) : null;
    return clipBox(clip, src, bw, bh, 1, this.measure);
  }

  /** Clip visible más alto bajo el punto (x, y) en coordenadas del lienzo base. */
  pick(x, y) {
    const s = getState();
    const t = s.currentTime;
    for (const track of s.tracks) {
      if (track.hidden || track.locked || track.kind === 'audio') continue;
      for (const c of [...track.clips].reverse()) {
        if (c.type === 'effect' || t < c.start || t >= c.start + c.duration) continue;
        const b = this.boxOf(c);
        if (!b) continue;
        const r = (-b.rot * Math.PI) / 180;
        const dx = x - b.cx;
        const dy = y - b.cy;
        const lx = dx * Math.cos(r) - dy * Math.sin(r);
        const ly = dx * Math.sin(r) + dy * Math.cos(r);
        if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return c.id;
      }
    }
    return null;
  }

  drawTo(ctx, W, H, s, t) {
    const [bw] = projectSize(s.project);
    drawFrame(ctx, W, H, bw, s, t, (c) => this.getSource(c), this.scratch, this.measure);
  }

  beginExport(canvas) {
    this.exportTarget = { canvas, ctx: canvas.getContext('2d') };
  }
  endExport() {
    this.exportTarget = null;
  }

  loop(ts) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    let s = getState();

    if (s.isPlaying) {
      const t = s.currentTime + dt;
      if (t >= s.duration) {
        store.setState({ currentTime: s.duration, isPlaying: false });
      } else store.setState({ currentTime: t });
      s = getState();
    }
    const playing = s.isPlaying;
    this.syncMedia(s, playing, s.currentTime);

    if (!this.canvas) return;
    const [bw, bh] = projectSize(s.project);
    const changed =
      this.sig.tracks !== s.tracks ||
      this.sig.project !== s.project ||
      this.sig.t !== s.currentTime ||
      this.sig.media !== s.media;
    if (playing || this.dirty || changed || this.exportTarget) {
      if (this.canvas.width !== bw || this.canvas.height !== bh) {
        this.canvas.width = bw;
        this.canvas.height = bh;
      }
      this.drawTo(this.ctx, bw, bh, s, s.currentTime);
      if (this.exportTarget) {
        const { canvas, ctx } = this.exportTarget;
        this.drawTo(ctx, canvas.width, canvas.height, s, s.currentTime);
      }
      this.sig = { tracks: s.tracks, project: s.project, t: s.currentTime, media: s.media };
      this.dirty = false;
    }
  }
}

export const engine = new Engine();

/** Pausa y silencia todo (al salir o exportar). */
export function stopEngine() {
  pause();
  engine.stopAllMedia();
}

export { naturalSize };
