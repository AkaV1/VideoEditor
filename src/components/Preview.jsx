import { useEffect, useRef, useState } from 'react';
import {
  LuPlay, LuPause, LuSkipBack, LuSkipForward, LuChevronLeft, LuChevronRight, LuMaximize,
  LuRectangleHorizontal, LuRectangleVertical, LuSquare, LuMonitor, LuScan, LuRotateCw,
} from 'react-icons/lu';
import {
  store, getState, useStore, shallowEqual, seek, togglePlay, stepFrames, setProject, selectClip,
  patchGroup, findClip, projectSize,
} from '../store/store.js';
import { engine } from '../lib/engine.js';
import { RATIOS } from '../lib/presets.js';
import { timecode, clamp } from '../lib/time.js';
import { evalTransform } from '../lib/keyframes.js';
import { IconBtn, Dropdown, MenuItem } from './ui.jsx';

const RATIO_ICON = { '16:9': LuRectangleHorizontal, '9:16': LuRectangleVertical, '1:1': LuSquare, '4:3': LuMonitor };

// ------------------------------------------------------- caja de transformación
function SelectionBox({ cs, wrapRef }) {
  const clip = useStore((s) => findClip(s.tracks, s.selectedId)?.clip ?? null);
  const t = useStore((s) => s.currentTime);
  useStore((s) => s.media);
  if (!clip || clip.type === 'audio' || clip.type === 'effect') return null;
  if (t < clip.start || t >= clip.start + clip.duration) return null;
  const b = engine.boxOf(clip);
  if (!b) return null;

  const [bw, bh] = projectSize();
  const clientCenter = () => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: r.left + b.cx * cs, y: r.top + b.cy * cs };
  };

  const startDrag = (e, kind) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const o = { ...evalTransform(clip, getState().currentTime - clip.start) };
    const c = clientCenter();
    const d0 = Math.max(8, Math.hypot(sx - c.x, sy - c.y));
    const a0 = Math.atan2(sy - c.y, sx - c.x);
    const move = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      if (kind === 'move') {
        patchGroup(clip.id, 'transform', {
          x: Math.round(o.x + (ev.clientX - sx) / cs),
          y: Math.round(o.y + (ev.clientY - sy) / cs),
        });
      } else if (kind === 'scale') {
        const d = Math.hypot(ev.clientX - c.x, ev.clientY - c.y);
        patchGroup(clip.id, 'transform', { scale: Math.round(clamp((o.scale * d) / d0, 5, 800)) });
      } else {
        let deg = o.rotation + ((Math.atan2(ev.clientY - c.y, ev.clientX - c.x) - a0) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        const snap = Math.round(deg / 45) * 45;
        if (Math.abs(deg - snap) < 3) deg = snap;
        patchGroup(clip.id, 'transform', { rotation: Math.round(deg) });
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

  const handle = 'absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/60 bg-white';
  const w = b.w * cs;
  const h = b.h * cs;
  return (
    <div
      className="absolute"
      style={{
        left: (b.cx - b.w / 2) * cs,
        top: (b.cy - b.h / 2) * cs,
        width: w,
        height: h,
        transform: `rotate(${b.rot}deg)`,
        touchAction: 'none',
      }}
    >
      <div
        onPointerDown={(e) => startDrag(e, 'move')}
        className="absolute inset-0 cursor-move border-[1.5px] border-accent"
      />
      {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => (
        <div
          key={`${x}${y}`}
          onPointerDown={(e) => startDrag(e, 'scale')}
          className={`${handle} cursor-nwse-resize`}
          style={{ left: x * w, top: y * h, touchAction: 'none', width: 14, height: 14 }}
        />
      ))}
      <div className="absolute left-1/2 -top-7 h-7 w-px -translate-x-1/2 bg-accent" />
      <div
        onPointerDown={(e) => startDrag(e, 'rotate')}
        className="absolute left-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border border-black/60 bg-white text-black"
        style={{ top: -28, touchAction: 'none' }}
      >
        <LuRotateCw size={11} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- monitor
function Monitor() {
  const ratio = useStore((s) => s.project.ratio);
  const zoom = useStore((s) => s.previewZoom);
  const hasClips = useStore((s) => s.duration > 0);
  const boxRef = useRef(null);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [avail, setAvail] = useState({ w: 300, h: 200 });
  const [bw, bh] = RATIOS[ratio];

  useEffect(() => {
    engine.attach(canvasRef.current);
    return () => engine.detach();
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const pad = 12;
  const fitW = Math.max(40, Math.min(avail.w - pad * 2, (avail.h - pad * 2) * (bw / bh)));
  const w = fitW * zoom;
  const h = (fitW * zoom * bh) / bw;
  const cs = w / bw;

  const onBackgroundDown = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const id = engine.pick((e.clientX - r.left) / cs, (e.clientY - r.top) / cs);
    selectClip(id);
  };

  return (
    <div ref={boxRef} className="relative min-h-0 flex-1 overflow-auto bg-[#0b0b0d]">
      <div className="flex min-h-full min-w-full items-center justify-center" style={{ padding: pad }}>
        <div
          ref={wrapRef}
          className="relative shrink-0 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_40px_rgba(0,0,0,0.6)]"
          style={{ width: w, height: h }}
        >
          <canvas ref={canvasRef} width={bw} height={bh} className="block h-full w-full bg-black" />
          <div className="absolute inset-0" onPointerDown={onBackgroundDown} />
          <SelectionBox cs={cs} wrapRef={wrapRef} />
          {!hasClips && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-[12px] text-white/50">
              Importa un video, imagen o añade texto para empezar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- controles
function TimeReadout() {
  const t = useStore((s) => s.currentTime);
  const d = useStore((s) => s.duration);
  const fps = useStore((s) => s.project.fps);
  return (
    <div className="font-mono text-[12px] tabular-nums text-[#dcdce4]">
      <span className="text-accent">{timecode(t, fps)}</span>
      <span className="text-muted"> / {timecode(d, fps)}</span>
    </div>
  );
}

function PlayButton() {
  const playing = useStore((s) => s.isPlaying);
  return (
    <button
      onClick={() => {
        engine.ensureAudio();
        togglePlay();
      }}
      title={playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-accent hover:text-white"
    >
      {playing ? <LuPause size={18} /> : <LuPlay size={18} className="translate-x-px" />}
    </button>
  );
}

export function Transport({ wrapperRef }) {
  const ratio = useStore((s) => s.project.ratio);
  const zoom = useStore((s) => s.previewZoom);
  const RIcon = RATIO_ICON[ratio] ?? LuRectangleHorizontal;

  const fullscreen = () => {
    const el = wrapperRef?.current;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else el?.requestFullscreen?.();
    } catch {
      /* no disponible */
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-1 gap-y-0.5 border-t border-line bg-panel px-2 py-1.5">
      <TimeReadout />
      <div className="flex items-center gap-0.5">
        <IconBtn icon={LuSkipBack} title="Ir al inicio" onClick={() => seek(0)} className="h-8 w-8 max-sm:hidden" />
        <IconBtn icon={LuChevronLeft} title="Cuadro anterior (←)" onClick={() => stepFrames(-1)} className="h-8 w-8" />
        <PlayButton />
        <IconBtn icon={LuChevronRight} title="Cuadro siguiente (→)" onClick={() => stepFrames(1)} className="h-8 w-8" />
        <IconBtn icon={LuSkipForward} title="Ir al final" onClick={() => seek(getState().duration)} className="h-8 w-8 max-sm:hidden" />
      </div>
      <div className="flex items-center gap-0.5">
        <Dropdown
          align="right"
          trigger={() => (
            <button className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-[#cfcfd8] hover:bg-white/10" title="Proporción">
              <RIcon size={15} /> <span className="max-sm:hidden">{ratio}</span>
            </button>
          )}
        >
          {Object.keys(RATIOS).map((r) => (
            <MenuItem key={r} active={r === ratio} onClick={() => setProject({ ratio: r })}>
              {(() => {
                const I = RATIO_ICON[r];
                return <I size={14} />;
              })()}
              {r}
            </MenuItem>
          ))}
        </Dropdown>
        <Dropdown
          align="right"
          className="max-sm:hidden"
          trigger={() => (
            <button className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-[#cfcfd8] hover:bg-white/10" title="Zoom del reproductor">
              <LuScan size={15} /> {zoom === 1 ? 'Ajustar' : `${Math.round(zoom * 100)}%`}
            </button>
          )}
        >
          {[[1, 'Ajustar'], [1.5, '150%'], [2, '200%'], [3, '300%']].map(([z, l]) => (
            <MenuItem key={z} active={z === zoom} onClick={() => store.setState({ previewZoom: z })}>
              {l}
            </MenuItem>
          ))}
        </Dropdown>
        <IconBtn icon={LuMaximize} title="Pantalla completa" onClick={fullscreen} className="h-8 w-8" />
      </div>
    </div>
  );
}

export default function Preview() {
  const ref = useRef(null);
  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col bg-app">
      <Monitor />
      <Transport wrapperRef={ref} />
    </div>
  );
}
