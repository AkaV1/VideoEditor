import { useEffect, useRef, useState } from 'react';
import {
  LuMousePointer2, LuScissors, LuSquareSplitHorizontal, LuTrash2, LuAudioLines, LuMagnet, LuFlag,
  LuZoomIn, LuZoomOut, LuEye, LuEyeOff, LuVolume2, LuVolumeX, LuLock, LuLockOpen, LuType, LuFilm,
  LuMusic2,
} from 'react-icons/lu';
import {
  getState, useStore, seek, pause, selectClip, setTool, toggleSnapping, splitAtPlayhead,
  splitClip, deleteSelected, detachAudio, addMarker, setZoom, toggleTrack, moveClip, trimLeft,
  trimRight, clipEnd,
} from '../store/store.js';
import { allTimes } from '../lib/keyframes.js';
import { snapTime, timeAtClientX, rowAtClientY } from '../lib/snap.js';
import { rulerLabel, clamp } from '../lib/time.js';
import { effectLabel, transitionLabel } from '../lib/presets.js';
import { IconBtn } from './ui.jsx';

const HEADER_W = 88;
const RULER_H = 26;
const ROW_H = { text: 34, video: 56, audio: 42 };

const CLIP_STYLE = {
  video: { bg: '#5a2530', border: '#a03d4d' },
  image: { bg: '#2a4d3f', border: '#3f7a62' },
  audio: { bg: '#5e5018', border: '#a8922e' },
  text: { bg: '#4d3a73', border: '#7459ad' },
  sticker: { bg: '#6a4a2a', border: '#a3743f' },
  effect: { bg: '#733a58', border: '#ad5c88' },
};

// ----------------------------------------------------------------- forma de onda
function Waveform({ peaks, mediaDur, clip, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const w = Math.max(1, Math.min(3000, Math.floor(width)));
    cv.width = w;
    cv.height = Math.max(1, Math.floor(height));
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, cv.height);
    const rate = clip.speed * (clip.audio?.pitch ? Math.pow(2, clip.audio.pitch / 12) : 1);
    const mid = cv.height / 2;
    ctx.fillStyle = 'rgba(255,190,150,0.85)';
    for (let x = 0; x < w; x += 2) {
      const local = (x / w) * clip.duration;
      const src = clip.trimStart + (clip.reverse ? clip.duration - local : local) * rate;
      const idx = clamp(Math.floor((src / mediaDur) * peaks.length), 0, peaks.length - 1);
      const v = (peaks[idx] / 255) * (mid - 2);
      ctx.fillRect(x, mid - v, 1.5, Math.max(1, v * 2));
    }
  }, [peaks, mediaDur, clip.trimStart, clip.duration, clip.speed, clip.reverse, clip.audio?.pitch, width, height]);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

// --------------------------------------------------------------------- clip
function ClipBlock({ clip, track, top, height }) {
  const zoom = useStore((s) => s.zoom);
  const selected = useStore((s) => s.selectedId === clip.id);
  const media = useStore((s) => (clip.mediaId ? s.media[clip.mediaId] : null));
  const cut = useStore((s) => s.tool === 'cut');
  const left = clip.start * zoom;
  const width = Math.max(6, clip.duration * zoom);
  const st = CLIP_STYLE[clip.type] ?? CLIP_STYLE.video;
  const mediaDur = media?.duration ?? Infinity;

  const beginDrag = (e, mode) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const o = { start: clip.start, duration: clip.duration };
    const z = getState().zoom;
    let started = false;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!started) {
        if (Math.hypot(dx, dy) < 5) return;
        started = true;
      }
      if (ev.cancelable) ev.preventDefault();
      if (mode === 'move') {
        const ns = snapTime(o.start + dx / z, { excludeId: clip.id, duration: o.duration });
        moveClip(clip.id, ns, rowAtClientY(ev.clientY));
      } else if (mode === 'left') {
        trimLeft(clip.id, snapTime(o.start + dx / z, { excludeId: clip.id }), mediaDur);
      } else {
        trimRight(clip.id, snapTime(o.start + o.duration + dx / z, { excludeId: clip.id }), mediaDur);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    pause();
    if (cut) {
      splitClip(clip.id, timeAtClientX(e.clientX));
      return;
    }
    if (track.locked) {
      selectClip(clip.id);
      return;
    }
    if (e.pointerType === 'touch' && !selected) {
      // en táctil, el primer toque solo selecciona (así se puede desplazar la línea de tiempo)
      const sx = e.clientX;
      const sy = e.clientY;
      const up = (ev) => {
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) selectClip(clip.id);
      };
      const cancel = () => {
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      return;
    }
    selectClip(clip.id);
    beginDrag(e, 'move');
  };

  const handleDown = (mode) => (e) => {
    e.stopPropagation();
    if (track.locked || cut) return;
    selectClip(clip.id);
    beginDrag(e, mode);
  };

  // miniaturas
  let tiles = null;
  if ((clip.type === 'video' || clip.type === 'image') && media?.thumbs?.length) {
    const aspect = media.width && media.height ? media.width / media.height : 16 / 9;
    const th = height - 4;
    const tileW = Math.max(30, Math.round(th * aspect));
    const count = Math.min(160, Math.ceil(width / tileW));
    const eff = width / count;
    tiles = (
      <div className="pointer-events-none absolute inset-0 flex">
        {Array.from({ length: count }, (_, i) => {
          const local = ((i + 0.5) * eff) / zoom;
          const src = clip.trimStart + (clip.reverse ? clip.duration - local : local) * clip.speed;
          const idx =
            clip.type === 'image'
              ? 0
              : clamp(Math.floor((src / (media.duration || 1)) * media.thumbs.length), 0, media.thumbs.length - 1);
          return (
            <img
              key={i}
              src={media.thumbs[idx]}
              alt=""
              draggable={false}
              className="h-full shrink-0 object-cover opacity-90"
              style={{ width: eff }}
            />
          );
        })}
      </div>
    );
  }

  const label =
    clip.type === 'text' ? clip.text || 'Texto'
      : clip.type === 'sticker' ? clip.text
      : clip.type === 'effect' ? effectLabel(clip.effectId)
      : clip.name;

  return (
    <div
      data-clip-id={clip.id}
      onPointerDown={onPointerDown}
      className={`absolute overflow-hidden rounded-md border pointer-events-auto ${cut ? 'cursor-crosshair' : 'cursor-pointer'} ${
        track.hidden ? 'opacity-40' : ''
      }`}
      style={{
        left,
        top: top + 2,
        width,
        height: height - 4,
        background: st.bg,
        borderColor: selected ? '#ff4d58' : st.border,
        borderWidth: selected ? 2 : 1,
        boxShadow: selected ? '0 0 0 1px rgba(255,77,88,0.35)' : undefined,
        touchAction: selected ? 'none' : 'pan-x pan-y',
        zIndex: selected ? 5 : 1,
      }}
    >
      {tiles}
      {allTimes(clip).map((kt) => (
        <span
          key={kt}
          className="pointer-events-none absolute bottom-1 z-[2] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-black/70 bg-[#ffc933]"
          style={{ left: Math.min(width - 6, Math.max(6, kt * zoom)) }}
        />
      ))}
      {media?.peaks && clip.type === 'audio' && (
        <Waveform peaks={media.peaks} mediaDur={media.duration} clip={clip} width={width} height={height - 4} />
      )}
      <div className="pointer-events-none relative flex items-center gap-1 px-1.5 pt-0.5 text-[10.5px] leading-none text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
        <span className="truncate">{label}</span>
        {clip.speed !== 1 && <span className="shrink-0 rounded bg-black/50 px-1">{clip.speed}x</span>}
        {clip.reverse && <span className="shrink-0 rounded bg-black/50 px-1">↺</span>}
        {clip.transitionIn && (
          <span className="shrink-0 rounded bg-accent/80 px-1 text-white" title={transitionLabel(clip.transitionIn.type)}>
            ▶
          </span>
        )}
      </div>
      {selected && !track.locked && (
        <>
          <div
            onPointerDown={handleDown('left')}
            className="absolute inset-y-0 left-0 z-10 flex w-3.5 cursor-ew-resize items-center justify-center bg-accent/90"
            style={{ touchAction: 'none' }}
          >
            <span className="h-4 w-[2px] rounded bg-black/60" />
          </div>
          <div
            onPointerDown={handleDown('right')}
            className="absolute inset-y-0 right-0 z-10 flex w-3.5 cursor-ew-resize items-center justify-center bg-accent/90"
            style={{ touchAction: 'none' }}
          >
            <span className="h-4 w-[2px] rounded bg-black/60" />
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------- cabecera de pista
function TrackHeader({ track }) {
  const KindIcon = track.kind === 'text' ? LuType : track.kind === 'video' ? LuFilm : LuMusic2;
  const small = track.kind === 'text';
  const b = `flex items-center justify-center rounded ${small ? 'h-[22px] w-[20px]' : 'h-6 w-[20px]'} hover:bg-white/10`;
  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 items-center gap-0.5 border-b border-r border-line bg-panel px-1"
      style={{ width: HEADER_W }}
    >
      <KindIcon size={13} className="mr-0.5 shrink-0 text-muted" />
      {track.kind !== 'audio' && (
        <button className={`${b} ${track.hidden ? 'text-accent' : 'text-[#aaa]'}`} title={track.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => toggleTrack(track.id, 'hidden')}>
          {track.hidden ? <LuEyeOff size={13} /> : <LuEye size={13} />}
        </button>
      )}
      {track.kind !== 'text' && (
        <button className={`${b} ${track.muted ? 'text-accent' : 'text-[#aaa]'}`} title={track.muted ? 'Activar sonido' : 'Silenciar'} onClick={() => toggleTrack(track.id, 'muted')}>
          {track.muted ? <LuVolumeX size={13} /> : <LuVolume2 size={13} />}
        </button>
      )}
      <button className={`${b} ${track.locked ? 'text-accent' : 'text-[#aaa]'}`} title={track.locked ? 'Desbloquear' : 'Bloquear'} onClick={() => toggleTrack(track.id, 'locked')}>
        {track.locked ? <LuLock size={13} /> : <LuLockOpen size={13} />}
      </button>
    </div>
  );
}

// ------------------------------------------------------------ regla y cabezal
function Ruler({ contentW }) {
  const zoom = useStore((s) => s.zoom);
  const fps = useStore((s) => s.project.fps);
  const markers = useStore((s) => s.markers);
  const total = contentW / zoom;
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((s) => s * zoom >= 64) ?? 600;
  const minor = (step * zoom) / 5 >= 7;
  const ticks = [];
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(Math.round(t * 1000) / 1000);

  const scrub = (e) => {
    e.preventDefault();
    pause();
    seek(timeAtClientX(e.clientX));
    const move = (ev) => seek(timeAtClientX(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div
      className="relative cursor-pointer overflow-hidden border-b border-line bg-[#1a1a1f]"
      style={{ width: contentW, height: RULER_H, touchAction: 'none' }}
      onPointerDown={scrub}
    >
      {ticks.map((t) => (
        <div key={t} className="pointer-events-none absolute top-0" style={{ left: t * zoom }}>
          <div className="h-2.5 w-px bg-[#6a6a76]" />
          <span className="absolute left-1 top-[7px] whitespace-nowrap text-[9.5px] tabular-nums text-muted">
            {step < 1 ? `${t.toFixed(1)}s` : rulerLabel(t, fps, step)}
          </span>
          {minor &&
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="absolute top-0 h-1.5 w-px bg-[#44444d]" style={{ left: ((step * zoom) / 5) * i }} />
            ))}
        </div>
      ))}
      {markers.map((m) => (
        <div key={m} className="pointer-events-none absolute bottom-0 -translate-x-1/2 text-[#ffb020]" style={{ left: m * zoom }}>
          <LuFlag size={11} fill="currentColor" />
        </div>
      ))}
      <RulerHead />
    </div>
  );
}

function RulerHead() {
  const t = useStore((s) => s.currentTime);
  const zoom = useStore((s) => s.zoom);
  return (
    <div className="pointer-events-none absolute bottom-0 z-10" style={{ left: t * zoom }}>
      <div className="-translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-accent" style={{ marginBottom: -1 }} />
    </div>
  );
}

function Playhead() {
  const t = useStore((s) => s.currentTime);
  const zoom = useStore((s) => s.zoom);
  return (
    <div
      className="pointer-events-none absolute bottom-0 top-0 z-[15] w-[2px] -translate-x-px bg-accent"
      style={{ left: HEADER_W + t * zoom }}
    />
  );
}

function AutoScroll({ scrollRef }) {
  const t = useStore((s) => s.currentTime);
  const zoom = useStore((s) => s.zoom);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = t * zoom;
    const vis = el.clientWidth - HEADER_W;
    if (x > el.scrollLeft + vis - 30 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - vis * 0.35);
  }, [t, zoom, scrollRef]);
  return null;
}

// -------------------------------------------------------------- barra de herramientas
function Toolbar() {
  const tool = useStore((s) => s.tool);
  const snapping = useStore((s) => s.snapping);
  const zoom = useStore((s) => s.zoom);
  const hasSel = useStore((s) => !!s.selectedId);
  const z2v = (z) => (Math.log(z / 6) / Math.log(400 / 6)) * 100;
  const v2z = (v) => 6 * Math.pow(400 / 6, v / 100);
  const b = 'h-8 w-8 shrink-0';
  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-[#1a1a1f] px-1.5 py-1">
      <IconBtn icon={LuMousePointer2} title="Selección (V)" active={tool === 'select'} onClick={() => setTool('select')} className={b} />
      <IconBtn icon={LuScissors} title="Cuchilla: toca un clip para cortar (B)" active={tool === 'cut'} onClick={() => setTool('cut')} className={b} />
      <IconBtn icon={LuSquareSplitHorizontal} title="Dividir en el cabezal (S)" onClick={splitAtPlayhead} className={b} />
      <IconBtn icon={LuTrash2} title="Eliminar (Supr)" onClick={deleteSelected} disabled={!hasSel} className={b} />
      <IconBtn icon={LuAudioLines} title="Separar audio" onClick={() => detachAudio()} className={b} />
      <div className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconBtn icon={LuMagnet} title="Imán (ajuste automático)" active={snapping} onClick={toggleSnapping} className={b} />
      <IconBtn icon={LuFlag} title="Marcador (M)" onClick={() => addMarker(getState().currentTime)} className={b} />
      <div className="flex-1" />
      <IconBtn icon={LuZoomOut} title="Alejar" onClick={() => setZoom(zoom / 1.4)} className={b} />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={clamp(z2v(zoom), 0, 100)}
        onChange={(e) => setZoom(v2z(parseFloat(e.target.value)))}
        style={{ '--fill': `${clamp(z2v(zoom), 0, 100)}%`, width: 90 }}
        className="shrink-0"
        aria-label="Zoom de la línea de tiempo"
      />
      <IconBtn icon={LuZoomIn} title="Acercar" onClick={() => setZoom(zoom * 1.4)} className={b} />
    </div>
  );
}

// ------------------------------------------------------------------- principal
export default function Timeline() {
  const tracks = useStore((s) => s.tracks);
  const zoom = useStore((s) => s.zoom);
  const duration = useStore((s) => s.duration);
  const scrollRef = useRef(null);
  const [vw, setVw] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => setVw(el.clientWidth));
    ro.observe(el);
    setVw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const contentW = Math.max((duration + 8) * zoom, vw - HEADER_W + 40);
  const tops = [];
  let totalH = 0;
  for (const t of tracks) {
    tops.push(totalH);
    totalH += ROW_H[t.kind];
  }

  const emptyClick = (e) => {
    selectClip(null);
    seek(timeAtClientX(e.clientX));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <Toolbar />
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" data-timeline-area>
        <div className="relative" style={{ width: HEADER_W + contentW, minHeight: '100%' }} onClick={(e) => e.target === e.currentTarget && emptyClick(e)}>
          <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-40 shrink-0 border-b border-r border-line bg-panel" style={{ width: HEADER_W }} />
            <Ruler contentW={contentW} />
          </div>

          <div className="relative">
            {tracks.map((t) => (
              <div key={t.id} data-track-row={t.id} className="flex" style={{ height: ROW_H[t.kind] }}>
                <TrackHeader track={t} />
                <div
                  className={`border-b border-line/50 ${t.kind === 'video' ? 'bg-[#1b1b21]' : 'bg-[#18181d]'}`}
                  style={{ width: contentW }}
                  onClick={emptyClick}
                />
              </div>
            ))}

            <div
              data-timeline-content
              className="pointer-events-none absolute top-0"
              style={{ left: HEADER_W, width: contentW, height: totalH, zIndex: 10 }}
            >
              {tracks.map((t, i) =>
                t.clips.map((c) => <ClipBlock key={c.id} clip={c} track={t} top={tops[i]} height={ROW_H[t.kind]} />),
              )}
            </div>

            {duration === 0 && (
              <div className="pointer-events-none absolute z-10 flex items-center text-[12px] text-muted" style={{ left: HEADER_W + 14, top: tops[tracks.findIndex((t) => t.kind === 'video')] ?? 0, height: ROW_H.video }}>
                Toca un medio o arrástralo hasta aquí
              </div>
            )}
          </div>
          <Playhead />
        </div>
        <AutoScroll scrollRef={scrollRef} />
      </div>
    </div>
  );
}

export { clipEnd };
