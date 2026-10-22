import { useRef, useState } from 'react';
import {
  LuImport, LuType, LuSticker, LuSparkles, LuArrowLeftRight, LuMusic, LuPlus, LuPlay, LuPause,
  LuFilm, LuImage, LuMusic2, LuUpload, LuLoader,
} from 'react-icons/lu';
import {
  store, useStore, addAsset, toast,
} from '../store/store.js';
import {
  TEXT_TEMPLATES, STICKER_CATEGORIES, EFFECTS, TRANSITIONS, LUTS, DEFAULT_TEXT_STYLE, fontCss,
} from '../lib/presets.js';
import { importFiles } from '../lib/media.js';
import { AUDIO_LIBRARY, ensureLibraryAudio, previewLibraryAudio, stopPreview } from '../lib/synth.js';
import { assetPointerProps } from '../lib/assetDrag.js';
import { shortTime } from '../lib/time.js';
import { engine } from '../lib/engine.js';

export const ASSET_TABS = [
  { id: 'media', label: 'Medios', icon: LuImport },
  { id: 'text', label: 'Texto', icon: LuType },
  { id: 'stickers', label: 'Stickers', icon: LuSticker },
  { id: 'effects', label: 'Efectos', icon: LuSparkles },
  { id: 'transitions', label: 'Transiciones', icon: LuArrowLeftRight },
  { id: 'audio', label: 'Audio', icon: LuMusic },
];

function Title({ children, hint }) {
  return (
    <div className="px-3 pt-3 pb-1.5">
      <div className="text-[12px] font-semibold text-[#d7d7df]">{children}</div>
      {hint && <div className="text-[11px] text-muted leading-snug">{hint}</div>}
    </div>
  );
}

/** Tarjeta de recurso: toque = añadir, arrastre = soltar en la línea de tiempo. */
function Card({ payload, onTap, children, className = '', title }) {
  const props = assetPointerProps(payload, () => {
    engine.ensureAudio();
    onTap();
  });
  return (
    <div
      {...props}
      title={title}
      className={`relative cursor-pointer overflow-hidden rounded-lg border border-line bg-panel2 hover:border-accent/70 active:scale-[0.98] transition ${className}`}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ Medios
function MediaTab() {
  const media = useStore((s) => s.media);
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const items = Object.values(media).filter((m) => !m.library);

  return (
    <div className="flex h-full flex-col">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        className="hidden"
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          importFiles(e.dataTransfer.files);
        }}
        className={`m-3 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-5 text-center transition ${
          over ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60 hover:bg-white/5'
        }`}
      >
        <LuUpload size={24} className="text-accent" />
        <div className="text-[13px] font-medium">Importar medios</div>
        <div className="text-[11px] text-muted">Toca o arrastra videos, audios e imágenes</div>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-muted">
          Tus medios aparecerán aquí. Toca uno para añadirlo en la posición del cabezal o arrástralo a una pista.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => (
            <Card
              key={m.id}
              payload={{ kind: m.kind === 'audio' ? 'audio' : 'media', id: m.id }}
              onTap={() => addAsset({ kind: m.kind === 'audio' ? 'audio' : 'media', id: m.id })}
              title={m.name}
            >
              <div className="relative aspect-video bg-black">
                {m.thumbs?.[0] ? (
                  <img src={m.thumbs[0]} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted">
                    {m.kind === 'audio' ? <LuMusic2 size={22} /> : m.kind === 'image' ? <LuImage size={22} /> : <LuFilm size={22} />}
                  </div>
                )}
                {m.kind !== 'image' && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] tabular-nums">
                    {shortTime(m.duration)}
                  </span>
                )}
                <span className="absolute right-1 top-1 rounded-full bg-accent p-0.5 text-black opacity-90">
                  <LuPlus size={12} />
                </span>
              </div>
              <div className="truncate px-1.5 py-1 text-[11px] text-[#c9c9d2]">{m.name}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- Texto
function TextPreview({ tpl }) {
  const st = { ...DEFAULT_TEXT_STYLE, ...tpl.style };
  const css = {
    fontFamily: fontCss(st.font),
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    color: st.color.length === 9 && st.color.endsWith('00') ? 'transparent' : st.color,
    fontSize: tpl.text.length > 8 ? 15 : 20,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    letterSpacing: st.letterSpacing * 0.2,
    WebkitTextStroke: st.strokeWidth ? `${Math.min(1, st.strokeWidth * 0.2)}px ${st.strokeColor}` : undefined,
    textShadow: st.shadow ? `${st.shadowX * 0.3}px ${st.shadowY * 0.3}px ${st.shadowBlur * 0.4}px ${st.shadowColor}` : undefined,
    background: st.bgEnabled ? st.bgColor : undefined,
    padding: st.bgEnabled ? '2px 8px' : undefined,
    borderRadius: 4,
    whiteSpace: 'nowrap',
  };
  return <span style={css}>{tpl.text}</span>;
}

function TextTab() {
  return (
    <div className="overflow-y-auto h-full">
      <Title hint="Toca para añadir al cabezal o arrastra a una pista de texto">Texto básico</Title>
      <div className="px-3">
        <Card payload={{ kind: 'text', id: 'basic' }} onTap={() => addAsset({ kind: 'text', id: 'basic' })}>
          <div className="flex items-center justify-center gap-2 py-3 text-[13px]">
            <LuPlus size={14} className="text-accent" /> Añadir texto
          </div>
        </Card>
      </div>
      <Title>Plantillas</Title>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {TEXT_TEMPLATES.slice(1).map((t) => (
          <Card key={t.id} payload={{ kind: 'text', id: t.id }} onTap={() => addAsset({ kind: 'text', id: t.id })} title={t.label}>
            <div className="flex h-16 items-center justify-center bg-[#15151a] px-1">
              <TextPreview tpl={t} />
            </div>
            <div className="px-1.5 py-1 text-[11px] text-[#c9c9d2]">{t.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Stickers
function StickersTab() {
  const [cat, setCat] = useState(STICKER_CATEGORIES[0].id);
  const items = STICKER_CATEGORIES.find((c) => c.id === cat).items;
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pt-3 pb-2">
        {STICKER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${cat === c.id ? 'bg-accent text-black font-medium' : 'bg-panel2 text-[#c9c9d2] hover:bg-white/10'}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto px-3 pb-3 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((e) => (
          <Card key={e} payload={{ kind: 'sticker', emoji: e }} onTap={() => addAsset({ kind: 'sticker', emoji: e })}>
            <div className="flex aspect-square items-center justify-center text-[30px] leading-none">{e}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Efectos
function EffectsTab() {
  const selectedHasVisual = useStore((s) => {
    for (const t of s.tracks) for (const c of t.clips) if (c.id === s.selectedId) return c.type === 'video' || c.type === 'image';
    return false;
  });
  const lut = useStore((s) => {
    for (const t of s.tracks) for (const c of t.clips) if (c.id === s.selectedId) return c.color?.lut ?? null;
    return null;
  });
  return (
    <div className="overflow-y-auto h-full">
      <Title hint="Se aplican al clip de video o imagen seleccionado">Filtros</Title>
      <div className="grid grid-cols-3 gap-2 px-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-4">
        {LUTS.map((l) => (
          <Card
            key={l.id}
            payload={{ kind: 'filter', id: l.id }}
            onTap={() => addAsset({ kind: 'filter', id: l.id })}
            className={selectedHasVisual && lut === l.id ? '!border-accent' : ''}
          >
            <div className="aspect-[4/3]" style={{ background: l.swatch }} />
            <div className="truncate px-1 py-1 text-center text-[11px] text-[#c9c9d2]">{l.label}</div>
          </Card>
        ))}
      </div>
      <Title hint="Se añaden como capa de efecto sobre todo lo que hay debajo">Efectos de video</Title>
      <div className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-4">
        {EFFECTS.map((e) => (
          <Card key={e.id} payload={{ kind: 'effect', id: e.id }} onTap={() => addAsset({ kind: 'effect', id: e.id })}>
            <div className="aspect-[4/3]" style={{ background: e.swatch }} />
            <div className="truncate px-1 py-1 text-center text-[11px] text-[#c9c9d2]">{e.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Transiciones
function TransitionsTab() {
  const current = useStore((s) => {
    for (const t of s.tracks) for (const c of t.clips) if (c.id === s.selectedId) return c.transitionIn?.type ?? 'none';
    return null;
  });
  return (
    <div className="overflow-y-auto h-full">
      <Title hint="Selecciona un clip y toca una transición, o arrástrala sobre un clip. Se aplica al inicio del clip.">
        Transiciones
      </Title>
      <div className="grid grid-cols-3 gap-2 px-3 pb-3 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-4">
        {TRANSITIONS.map((t) => (
          <Card
            key={t.id}
            payload={{ kind: 'transition', id: t.id }}
            onTap={() => addAsset({ kind: 'transition', id: t.id })}
            className={current === t.id ? '!border-accent' : ''}
          >
            <div className="flex aspect-[4/3] items-center justify-center bg-[#15151a]">
              <TransitionGlyph id={t.id} />
            </div>
            <div className="truncate px-1 py-1 text-center text-[11px] text-[#c9c9d2]">{t.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TransitionGlyph({ id }) {
  // pequeña animación en CSS de lo que hace cada transición
  const base = 'h-7 w-9 rounded-sm bg-gradient-to-br from-accent to-[#3a7bd5]';
  const map = {
    none: <div className="h-7 w-9 rounded-sm border border-dashed border-muted" />,
    fade: <div className={`${base} opacity-60`} />,
    zoomIn: <div className={`${base} scale-125`} />,
    zoomOut: <div className={`${base} scale-75`} />,
    slideLeft: <div className={`${base} translate-x-2`} />,
    slideRight: <div className={`${base} -translate-x-2`} />,
    slideUp: <div className={`${base} translate-y-2`} />,
    wipeRight: <div className={`${base}`} style={{ clipPath: 'inset(0 40% 0 0)' }} />,
    wipeDown: <div className={`${base}`} style={{ clipPath: 'inset(0 0 40% 0)' }} />,
    spin: <div className={`${base} rotate-45`} />,
  };
  return map[id] ?? map.fade;
}

// ------------------------------------------------------------------- Audio
function AudioTab() {
  const [busy, setBusy] = useState(null);
  const [playing, setPlaying] = useState(null);

  const add = async (id) => {
    setBusy(id);
    try {
      const mediaId = await ensureLibraryAudio(id);
      addAsset({ kind: 'audio', id: mediaId });
    } catch {
      toast('No se pudo generar el audio');
    }
    setBusy(null);
  };
  const preview = async (id) => {
    engine.ensureAudio();
    try {
      const on = await previewLibraryAudio(id);
      setPlaying(on ? id : null);
    } catch {
      toast('No se pudo reproducir');
    }
  };

  const group = (g, title) => (
    <>
      <Title hint={g === 'music' ? 'Pistas generadas en tu dispositivo' : null}>{title}</Title>
      <div className="space-y-1.5 px-3">
        {AUDIO_LIBRARY.filter((a) => a.group === g).map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel2 px-2 py-1.5">
            <button
              onClick={() => preview(a.id)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-accent hover:text-black"
              title="Escuchar"
            >
              {playing === a.id ? <LuPause size={15} /> : <LuPlay size={15} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{a.label}</div>
              <div className="truncate text-[11px] text-muted">
                {a.desc} · {a.duration >= 10 ? Math.round(a.duration) : a.duration.toFixed(1)} s
              </div>
            </div>
            <button
              onClick={() => add(a.id)}
              disabled={busy === a.id}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-black disabled:opacity-60"
              title="Añadir a la línea de tiempo"
            >
              {busy === a.id ? <LuLoader size={15} className="animate-spin" /> : <LuPlus size={16} />}
            </button>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="overflow-y-auto h-full pb-3" onPointerLeave={() => {}}>
      {group('music', 'Música')}
      {group('sfx', 'Efectos de sonido')}
    </div>
  );
}

// ------------------------------------------------------------------ Panel
export function AssetsPanel() {
  const tab = useStore((s) => s.assetTab);
  return (
    <div className="h-full min-h-0 overflow-hidden bg-panel">
      {tab === 'media' && <MediaTab />}
      {tab === 'text' && <TextTab />}
      {tab === 'stickers' && <StickersTab />}
      {tab === 'effects' && <EffectsTab />}
      {tab === 'transitions' && <TransitionsTab />}
      {tab === 'audio' && <AudioTab />}
    </div>
  );
}

/** Barra vertical de pestañas (escritorio). */
export function AssetTabsVertical() {
  const tab = useStore((s) => s.assetTab);
  return (
    <nav className="flex w-[68px] shrink-0 flex-col gap-0.5 border-r border-line bg-[#18181d] py-1.5">
      {ASSET_TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => {
            stopPreview();
            store.setState({ assetTab: t.id });
          }}
          className={`mx-1 flex flex-col items-center gap-0.5 rounded-lg py-2 text-[10.5px] ${
            tab === t.id ? 'bg-accent/15 text-accent' : 'text-[#a9a9b4] hover:bg-white/5 hover:text-white'
          }`}
        >
          <t.icon size={19} />
          {t.label}
        </button>
      ))}
    </nav>
  );
}
