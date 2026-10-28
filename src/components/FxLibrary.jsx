import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuSearch, LuStar, LuX, LuRotateCcw, LuPlay, LuVolume2, LuGauge, LuLayers, LuWandSparkles,
} from 'react-icons/lu';
import { useStore, toast } from '../store/store.js';
import { Slider, Select, ColorField } from './ui.jsx';
import { ITEMS, FX_CATS, FILTER_CATS, TR_CATS } from '../lib/fx/registry.js';
import { PARTICLES } from '../lib/fx/particles.js';
import { ANIMS } from '../lib/fx/anim.js';
import { TEXTFX } from '../lib/fx/textfx.js';
import { AUDIO_FX } from '../lib/fx/audiofx.js';
import { renderPreview, previewAudioFx, stopAudioPreview } from '../lib/fx/preview.js';
import {
  addClipFx, addFxLayer, applyTransitionFull, setAnim, setTextFx, addAudioFx, toggleFav, useFavs, useLowPerf, setLowPerf, resolveItem,
} from '../store/fxOps.js';
import { engine } from '../lib/engine.js';

export const FX_TYPES = [
  { id: 'fx', label: 'Efectos' },
  { id: 'filter', label: 'Filtros' },
  { id: 'transition', label: 'Transiciones' },
  { id: 'anim', label: 'Animaciones' },
  { id: 'text', label: 'Texto' },
  { id: 'audio', label: 'Audio' },
];

const slotLabel = { in: 'Entrada', out: 'Salida', loop: 'Bucle' };

/** Catálogo por tipo: categorías + elementos con su `kind`. */
function catalog(type) {
  switch (type) {
    case 'fx':
      return {
        cats: [...FX_CATS, { id: 'particulas', label: 'Partículas' }],
        items: [...ITEMS.filter((i) => i.kind === 'fx'), ...PARTICLES.map((p) => ({ ...p, cat: 'particulas' }))],
      };
    case 'filter': return { cats: FILTER_CATS, items: ITEMS.filter((i) => i.kind === 'filter') };
    case 'transition': return { cats: TR_CATS, items: ITEMS.filter((i) => i.kind === 'transition') };
    case 'anim':
      return {
        cats: [{ id: 'io', label: 'Entrada y salida' }, { id: 'loop', label: 'Bucle' }],
        items: ANIMS.map((a) => ({ ...a, kind: 'anim', cat: a.slots.includes('loop') ? 'loop' : 'io' })),
      };
    case 'text':
      return {
        cats: [{ id: 'in', label: 'Entrada' }, { id: 'out', label: 'Salida' }, { id: 'loop', label: 'Continuos' }],
        items: TEXTFX.map((t) => ({ ...t, cat: t.mode })),
      };
    default: return { cats: [], items: AUDIO_FX.map((a) => ({ ...a, cat: 'all' })) };
  }
}

const defaults = (it) => { const o = {}; for (const d of it.params || []) if (d) o[d.id] = d.def; return o; };

/** Editor de parámetros de un elemento (sliders, selectores, colores). */
export function ParamEditor({ item, values, onChange, skip = [] }) {
  const list = (item.params || []).filter((d) => d && !skip.includes(d.id));
  if (!list.length) return <div className="text-[11.5px] text-muted">Sin parámetros.</div>;
  return (
    <div className="flex flex-col gap-1">
      {list.map((d) => {
        const v = values?.[d.id] ?? d.def;
        if (d.type === 'color') return <ColorField key={d.id} label={d.label} value={v} onChange={(x) => onChange({ [d.id]: x })} />;
        if (d.type === 'select') {
          const opts = d.options.map((o) => (Array.isArray(o) ? { value: String(o[0]), label: o[1] } : { value: String(o), label: String(o) }));
          return <Select key={d.id} label={d.label} value={String(v)} options={opts} onChange={(x) => onChange({ [d.id]: Number.isNaN(Number(x)) ? x : Number(x) })} />;
        }
        return <Slider key={d.id} label={d.label} value={v} min={d.min} max={d.max} step={d.step ?? (d.max - d.min > 20 ? 1 : 0.05)} unit={d.unit} onChange={(x) => onChange({ [d.id]: x })} />;
      })}
    </div>
  );
}

/** Lienzo con vista previa. Miniaturas: un fotograma; al pasar el dedo/ratón se anima. `live` anima siempre. */
function PreviewCanvas({ item, params, w, h, live = false, side, className = '' }) {
  const ref = useRef(null);
  const state = useRef({ vis: false, hover: false, raf: 0, t0: 0 });
  const prm = useRef(params);
  prm.current = params;
  const low = useLowPerf();
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const st = state.current;
    const draw = (t) => { try { renderPreview(ctx, w, h, item, prm.current, t, { side }); } catch { /* ignorar */ } };
    const loop = (now) => {
      st.raf = 0;
      if (!(live || st.hover) || !st.vis) { draw(0.9); return; }
      if (!st.t0) st.t0 = now;
      draw((now - st.t0) / 1000);
      st.raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!st.raf) st.raf = requestAnimationFrame(loop); };
    const io = new IntersectionObserver(([e]) => { st.vis = e.isIntersecting; if (st.vis) { st.t0 = 0; kick(); } }, { threshold: 0.01 });
    io.observe(cv);
    const on = () => { st.hover = true; st.t0 = 0; kick(); };
    const off = () => { st.hover = false; kick(); };
    cv.addEventListener('pointerenter', on); cv.addEventListener('pointerleave', off);
    return () => { io.disconnect(); cancelAnimationFrame(st.raf); cv.removeEventListener('pointerenter', on); cv.removeEventListener('pointerleave', off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind, item.id, w, h, live, side, low]);
  useEffect(() => { if (!live) { const ctx = ref.current.getContext('2d'); try { renderPreview(ctx, w, h, item, params, 0.9, { side }); } catch { /* ignorar */ } } }, [params]); // eslint-disable-line
  return <canvas ref={ref} width={w} height={h} className={`block w-full ${className}`} />;
}

function Card({ item, fav, onOpen, onFav }) {
  const params = useMemo(() => defaults(item), [item]);
  const audio = item.kind === 'audio';
  return (
    <div onClick={onOpen} className="relative cursor-pointer overflow-hidden rounded-lg border border-line bg-panel2 hover:border-accent/70 active:scale-[0.98] transition">
      {audio ? (
        <div className="flex h-[64px] items-center justify-center bg-[#1d1d24] text-accent"><LuVolume2 size={26} /></div>
      ) : (
        <PreviewCanvas item={item} params={params} w={112} h={64} />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onFav(); }}
        className={`absolute right-1 top-1 rounded-full bg-black/50 p-1 ${fav ? 'text-[#ffd34d]' : 'text-white/70'}`}
        title="Favorito"
      >
        <LuStar size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
      <div className="truncate px-1.5 py-1 text-[11px] text-[#d7d7df]">{item.label}</div>
    </div>
  );
}

function Detail({ item, onClose }) {
  const sel = useStore((s) => s.selectedId);
  const [vals, setVals] = useState(() => defaults(item));
  const [dur, setDur] = useState(item.kind === 'anim' ? 0.8 : 1);
  const [side, setSide] = useState('in');
  const low = useLowPerf();
  const kind = item.kind;
  const patch = (p) => setVals((v) => ({ ...v, ...p }));
  useEffect(() => () => stopAudioPreview(), []);
  const needClip = () => { if (!sel) { toast('Selecciona un clip en la línea de tiempo'); return false; } engine.ensureAudio?.(); return true; };
  const slots = kind === 'anim' ? item.slots : [];
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{item.label}</div>
          <div className="truncate text-[10.5px] text-muted">{FX_TYPES.find((t) => (t.id === kind) || (t.id === 'fx' && kind === 'particles'))?.label}</div>
        </div>
        <button onClick={onClose} className="rounded p-1.5 text-[#a9a9b4] hover:bg-white/10"><LuX size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {kind === 'audio' ? (
          <button onClick={() => previewAudioFx(item.id, vals)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-panel2 py-6 text-[13px] text-accent">
            <LuPlay size={18} /> Escuchar con voz de prueba
          </button>
        ) : (
          <PreviewCanvas item={item} params={kind === 'text' ? { ...vals } : vals} w={low ? 192 : 320} h={low ? 108 : 180} live side={side} className="mb-3 rounded-lg border border-line" />
        )}
        <ParamEditor item={item} values={vals} onChange={patch} />
        {(kind === 'transition' || (kind === 'anim' && !slots.includes('loop'))) && (
          <div className="mt-1">
            <Slider label="Duración" value={dur} min={0.2} max={3} step={0.1} unit=" s" onChange={setDur} />
          </div>
        )}
        {kind === 'transition' && (
          <div className="mt-2 flex gap-2 text-[12px]">
            {['in', 'out'].map((s) => (
              <button key={s} onClick={() => setSide(s)} className={`flex-1 rounded border py-1.5 ${side === s ? 'border-accent text-accent' : 'border-line text-[#a9a9b4]'}`}>{s === 'in' ? 'Vista de entrada' : 'Vista de salida'}</button>
            ))}
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
          <LuGauge size={14} />
          <input type="checkbox" checked={low} onChange={(e) => setLowPerf(e.target.checked)} />
          Modo de bajo rendimiento (sin realimentación, previa reducida)
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 border-t border-line p-2.5">
        <button onClick={() => setVals(defaults(item))} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[12px] text-[#c4c4cd]"><LuRotateCcw size={14} /> Restablecer</button>
        {(kind === 'fx' || kind === 'filter') && (
          <>
            <button onClick={() => needClip() && addClipFx(kind, item.id, null, vals) && toast('Aplicado al clip')} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white"><LuWandSparkles size={14} /> Aplicar al clip</button>
            <button onClick={() => addFxLayer(kind, item.id, { params: vals })} className="flex items-center gap-1 rounded-lg border border-accent/60 px-3 py-2 text-[12px] text-accent"><LuLayers size={14} /> Como capa</button>
          </>
        )}
        {kind === 'particles' && (
          <button onClick={() => addFxLayer('particles', item.id, { params: vals })} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white"><LuLayers size={14} /> Añadir como capa</button>
        )}
        {kind === 'transition' && ['in', 'out'].map((s) => (
          <button key={s} onClick={() => needClip() && (applyTransitionFull(item.id, s, vals, dur), toast(s === 'in' ? 'Transición de entrada aplicada' : 'Transición de salida aplicada'))} className={`flex flex-1 items-center justify-center rounded-lg px-3 py-2 text-[12.5px] font-semibold ${s === 'in' ? 'bg-accent text-white' : 'border border-accent/60 text-accent'}`}>
            {s === 'in' ? 'Aplicar a la entrada' : 'Aplicar a la salida'}
          </button>
        ))}
        {kind === 'anim' && slots.map((s) => (
          <button key={s} onClick={() => needClip() && (setAnim(null, s, item.id, { p: vals, duration: dur }), toast(`Animación de ${slotLabel[s].toLowerCase()} aplicada`))} className="flex flex-1 items-center justify-center rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white first:bg-accent [&:nth-child(n+4)]:bg-transparent">
            {slotLabel[s]}
          </button>
        ))}
        {kind === 'text' && (
          <button onClick={() => needClip() && (setTextFx(null, item.id, { p: vals }), toast('Efecto de texto aplicado'))} className="flex flex-1 items-center justify-center rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white">Aplicar al texto</button>
        )}
        {kind === 'audio' && (
          <button onClick={() => needClip() && addAudioFx(item.id, null, vals) && toast('Efecto de audio aplicado')} className="flex flex-1 items-center justify-center rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white">Aplicar al clip</button>
        )}
      </div>
    </div>
  );
}

export function FxLibrary() {
  const [type, setType] = useState('fx');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [open, setOpen] = useState(null);
  const favs = useFavs();
  const favSet = useMemo(() => new Set(favs), [favs]);
  const cat0 = useMemo(() => catalog(type), [type]);
  const needle = q.trim().toLowerCase();
  const items = cat0.items.filter((i) => {
    if (cat !== 'all' && i.cat !== cat) return false;
    if (onlyFav && !favSet.has(`${i.kind}:${i.id}`)) return false;
    if (!needle) return true;
    return i.label.toLowerCase().includes(needle) || (i.tags || []).some((t) => t.toLowerCase().includes(needle));
  });
  useEffect(() => { stopAudioPreview(); }, [type]);
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-line px-2.5 pb-2 pt-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-app px-2">
          <LuSearch size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" />
          <button onClick={() => setOnlyFav((v) => !v)} className={`p-1 ${onlyFav ? 'text-[#ffd34d]' : 'text-muted'}`} title="Solo favoritos"><LuStar size={16} fill={onlyFav ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {FX_TYPES.map((t) => (
            <button key={t.id} onClick={() => { setType(t.id); setCat('all'); }} className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${type === t.id ? 'bg-accent text-white' : 'bg-panel2 text-[#b7b7c2]'}`}>{t.label}</button>
          ))}
        </div>
        {cat0.cats.length > 0 && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {[{ id: 'all', label: 'Todo' }, ...cat0.cats].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] ${cat === c.id ? 'border-accent text-accent' : 'border-line text-muted'}`}>{c.label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {items.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-muted">{onlyFav ? 'Aún no tienes favoritos en esta sección.' : 'Sin resultados.'}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
            {items.map((it) => (
              <Card key={`${it.kind}:${it.id}`} item={it} fav={favSet.has(`${it.kind}:${it.id}`)} onFav={() => toggleFav(it.kind, it.id)} onOpen={() => setOpen(it)} />
            ))}
          </div>
        )}
        <div className="px-1 pb-2 pt-3 text-center text-[10.5px] text-muted">{items.length} elementos</div>
      </div>
      {open && <Detail key={`${open.kind}:${open.id}`} item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export { resolveItem };
