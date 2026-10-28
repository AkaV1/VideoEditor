import { useState } from 'react';
import {
  LuAlignLeft, LuAlignCenter, LuAlignRight, LuBold, LuItalic, LuTrash2, LuFlipHorizontal2,
  LuFlipVertical2, LuRotateCcw, LuMousePointer2, LuChevronLeft, LuChevronRight, LuDiamond,
} from 'react-icons/lu';
import {
  store, useStore, findClip, patchGroup, patchClip, setClipSpeed, setClipReverse, deleteClip, setProject,
  projectSize, applyTransition, toggleKeyframe, toggleAllKeyframes, setKeyframeEase, clearKeyframes,
  seekKeyframe,
} from '../store/store.js';
import {
  evalTransform, evalVolume, anyKeyframes, hasKeyframes, kfIndexAt, localTime, propsFor, EASINGS, EPS,
} from '../lib/keyframes.js';
import {
  BLEND_MODES, FONTS, FONT_GROUPS, LUTS, EFFECTS, TRANSITIONS, RATIOS, RESOLUTIONS, FPS_OPTIONS,
  DEFAULT_COLOR, DEFAULT_CROP,
} from '../lib/presets.js';
import { Slider, Toggle, Select, ColorField, Segmented, Section, IconBtn } from './ui.jsx';
import { FxTab, FxLayerEditor } from './FxInspector.jsx';
import { getItem } from '../lib/fx/registry.js';

const TAB_LABELS = {
  video: 'Video',
  basic: 'Básico',
  crop: 'Recorte',
  audio: 'Audio',
  speed: 'Velocidad',
  color: 'Color',
  text: 'Texto',
  effect: 'Efecto',
  fx: 'Efectos',
};

function tabsFor(type) {
  switch (type) {
    case 'video': return ['video', 'crop', 'audio', 'speed', 'color', 'fx'];
    case 'image': return ['video', 'crop', 'color', 'fx'];
    case 'text': return ['text', 'basic', 'fx'];
    case 'sticker': return ['basic', 'fx'];
    case 'audio': return ['audio', 'fx'];
    case 'effect': return ['effect'];
    default: return [];
  }
}

// ---------------------------------------------------------------- keyframes
/** Instante local del cabezal; solo se suscribe al tiempo si el clip tiene keyframes. */
function useLocal(clip) {
  const has = anyKeyframes(clip);
  const now = useStore((s) => (has ? s.currentTime : 0));
  return has ? localTime(clip, now) : 0;
}

const kfState = (clip, prop, local) =>
  !hasKeyframes(clip, prop) ? 'off' : kfIndexAt(clip.keyframes[prop], local) >= 0 ? 'on' : 'near';

function KeyframeBar({ clip }) {
  const local = useLocal(clip);
  const props = propsFor(clip);
  if (!props.length) return null;
  const count = props.reduce((n, p) => n + (clip.keyframes?.[p]?.length ?? 0), 0);
  const onHere = props.filter((p) => kfIndexAt(clip.keyframes?.[p], local) >= 0);
  const all = onHere.length === props.length;
  const curEase = onHere.length ? clip.keyframes[onHere[0]].find((k) => Math.abs(k.t - local) < EPS)?.e : null;
  return (
    <div className="border-b border-line/70 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <IconBtn icon={LuChevronLeft} title="Keyframe anterior" onClick={() => seekKeyframe(clip.id, -1)} disabled={!count} className="h-8 w-8" />
        <button
          onClick={() => toggleAllKeyframes(clip.id)}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium ${
            all ? 'border-[#ffc933] bg-[#ffc933]/15 text-[#ffc933]' : 'border-line text-[#e1e1e8] hover:bg-white/10'
          }`}
        >
          <LuDiamond size={13} className={all ? 'fill-current' : ''} />
          {all ? 'Quitar keyframe' : 'Añadir keyframe'}
        </button>
        <IconBtn icon={LuChevronRight} title="Keyframe siguiente" onClick={() => seekKeyframe(clip.id, 1)} disabled={!count} className="h-8 w-8" />
      </div>
      {count > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-[11px] text-muted">{count} keyframe{count === 1 ? '' : 's'}</span>
          <div className="flex-1" />
          {onHere.length > 0 && (
            <Segmented
              value={curEase}
              options={EASINGS.map((e) => ({ value: e.id, label: e.label }))}
              onChange={(v) => setKeyframeEase(clip.id, v)}
              className="!h-7"
            />
          )}
          <button className="shrink-0 text-[11px] text-[#e8756f]" onClick={() => clearKeyframes(clip.id)}>
            Borrar todos
          </button>
        </div>
      )}
      {count === 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Mueve el cabezal, pulsa «Añadir keyframe» y cambia posición, escala, rotación u opacidad en otro instante: la
          propiedad se animará entre ambos. También puedes usar el rombo junto a cada control.
        </p>
      )}
    </div>
  );
}

function TransitionSection({ clip, side }) {
  const key = side === 'out' ? 'transitionOut' : 'transitionIn';
  const tr = clip[key];
  return (
    <Section title={side === 'out' ? 'Transición de salida' : 'Transición de entrada'}>
      <Select
        label="Tipo"
        value={tr?.type ?? 'none'}
        options={[...TRANSITIONS, ...(tr && !TRANSITIONS.some((x) => x.id === tr.type) ? [{ id: tr.type, label: getItem('transition', tr.type)?.label ?? tr.type }] : [])].map((x) => ({ value: x.id, label: x.label }))}
        onChange={(v) => applyTransition(v, clip.id, side)}
      />
      {tr && (
        <Slider
          label="Duración"
          value={tr.duration}
          min={0.1}
          max={Math.max(0.2, Math.min(3, clip.duration))}
          step={0.1}
          unit="s"
          onChange={(v) => patchClip(clip.id, (c) => ({ ...c, [key]: { ...c[key], duration: v } }), `trdur:${side}`)}
        />
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ pestañas
function TransformControls({ clip }) {
  const [bw, bh] = projectSize();
  const local = useLocal(clip);
  const t = evalTransform(clip, local);
  const set = (patch) => patchGroup(clip.id, 'transform', patch);
  const kf = (p) => ({ state: kfState(clip, p, local), onToggle: () => toggleKeyframe(clip.id, p) });
  return (
    <>
      <Section title="Transformar">
        <Slider label="Escala" value={t.scale} min={5} max={400} unit="%" onChange={(v) => set({ scale: v })} hardMax={800} kf={kf('scale')} />
        <Slider label="Posición X" value={t.x} min={-bw} max={bw} onChange={(v) => set({ x: v })} kf={kf('x')} />
        <Slider label="Posición Y" value={t.y} min={-bh} max={bh} onChange={(v) => set({ y: v })} kf={kf('y')} />
        <Slider label="Rotación" value={t.rotation} min={-180} max={180} unit="°" onChange={(v) => set({ rotation: v })} kf={kf('rotation')} />
        <Slider label="Opacidad" value={t.opacity} min={0} max={100} unit="%" onChange={(v) => set({ opacity: v })} kf={kf('opacity')} />
        <div className="flex items-center gap-2">
          <span className="w-[84px] shrink-0 text-[12px] text-[#b7b7c2]">Espejo</span>
          <IconBtn icon={LuFlipHorizontal2} title="Espejo horizontal" active={t.flipH} onClick={() => set({ flipH: !t.flipH })} className="h-7 flex-1 border border-line" />
          <IconBtn icon={LuFlipVertical2} title="Espejo vertical" active={t.flipV} onClick={() => set({ flipV: !t.flipV })} className="h-7 flex-1 border border-line" />
        </div>
        <Select
          label="Fusión"
          value={t.blend}
          options={BLEND_MODES.map((b) => ({ value: b.id, label: b.label }))}
          onChange={(v) => set({ blend: v })}
        />
      </Section>
      <TransitionSection clip={clip} side="in" />
      <TransitionSection clip={clip} side="out" />
    </>
  );
}

function CropTab({ clip }) {
  const c = clip.crop;
  const set = (patch) => patchGroup(clip.id, 'crop', patch);
  return (
    <Section
      title="Recorte manual"
      right={
        <button className="flex items-center gap-1 text-[11px] text-accent" onClick={() => set({ ...DEFAULT_CROP })}>
          <LuRotateCcw size={12} /> Restablecer
        </button>
      }
    >
      <Slider label="Arriba" value={c.top} min={0} max={90} unit="%" onChange={(v) => set({ top: v })} />
      <Slider label="Abajo" value={c.bottom} min={0} max={90} unit="%" onChange={(v) => set({ bottom: v })} />
      <Slider label="Izquierda" value={c.left} min={0} max={90} unit="%" onChange={(v) => set({ left: v })} />
      <Slider label="Derecha" value={c.right} min={0} max={90} unit="%" onChange={(v) => set({ right: v })} />
    </Section>
  );
}

function AudioTab({ clip }) {
  const a = clip.audio;
  const local = useLocal(clip);
  const set = (patch) => patchGroup(clip.id, 'audio', patch);
  const fadeMax = Math.max(0.5, Math.min(10, clip.duration));
  return (
    <>
      <Section title="Volumen">
        <Slider
          label="Volumen"
          value={evalVolume(clip, local)}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => set({ volume: v })}
          kf={{ state: kfState(clip, 'volume', local), onToggle: () => toggleKeyframe(clip.id, 'volume') }}
        />
        <Slider label="Fade in" value={a.fadeIn} min={0} max={fadeMax} step={0.1} unit="s" onChange={(v) => set({ fadeIn: v })} />
        <Slider label="Fade out" value={a.fadeOut} min={0} max={fadeMax} step={0.1} unit="s" onChange={(v) => set({ fadeOut: v })} />
      </Section>
      <Section title="Mezcla">
        <Slider label="Balance" value={a.balance} min={-100} max={100} onChange={(v) => set({ balance: v })} />
        {clip.type === 'video' && (
          <Slider label="Reducir ruido" value={a.denoise} min={0} max={100} unit="%" onChange={(v) => set({ denoise: v })} />
        )}
      </Section>
      {clip.type === 'audio' && (
        <Section title="Velocidad y tono">
          <Slider label="Velocidad" value={clip.speed} min={0.25} max={4} step={0.05} unit="x" hardMax={100} onChange={(v) => setClipSpeed(clip.id, v)} />
          <Slider label="Tono" value={a.pitch} min={-12} max={12} unit=" st" onChange={(v) => set({ pitch: v })} />
          <p className="text-[11px] leading-snug text-muted">
            El tono se mueve en semitonos y también acelera o frena el audio, como un disco.
          </p>
        </Section>
      )}
    </>
  );
}

function SpeedTab({ clip }) {
  return (
    <Section title="Velocidad constante">
      <Slider label="Velocidad" value={clip.speed} min={0.1} max={10} step={0.05} unit="x" hardMax={100} onChange={(v) => setClipSpeed(clip.id, v)} />
      <div className="grid grid-cols-5 gap-1.5">
        {[0.25, 0.5, 1, 2, 4].map((v) => (
          <button
            key={v}
            onClick={() => setClipSpeed(clip.id, v)}
            className={`h-7 rounded border text-[12px] ${clip.speed === v ? 'border-accent bg-accent/15 text-accent' : 'border-line text-[#cfcfd8] hover:bg-white/10'}`}
          >
            {v}x
          </button>
        ))}
      </div>
      <Toggle label="Invertir (reproducir al revés)" checked={clip.reverse} onChange={(v) => setClipReverse(clip.id, v)} />
      <p className="text-[11px] leading-snug text-muted">
        Cambiar la velocidad ajusta la duración del clip. En reversa el audio se silencia mientras reproduces.
      </p>
    </Section>
  );
}

function ColorTab({ clip }) {
  const c = clip.color;
  const set = (patch) => patchGroup(clip.id, 'color', patch);
  return (
    <>
      <Section
        title="Ajustes de color"
        right={
          <button className="flex items-center gap-1 text-[11px] text-accent" onClick={() => set({ ...DEFAULT_COLOR })}>
            <LuRotateCcw size={12} /> Restablecer
          </button>
        }
      >
        <Slider label="Brillo" value={c.brightness} min={-100} max={100} onChange={(v) => set({ brightness: v })} />
        <Slider label="Contraste" value={c.contrast} min={-100} max={100} onChange={(v) => set({ contrast: v })} />
        <Slider label="Saturación" value={c.saturation} min={-100} max={100} onChange={(v) => set({ saturation: v })} />
        <Slider label="Exposición" value={c.exposure} min={-100} max={100} onChange={(v) => set({ exposure: v })} />
        <Slider label="Sombras" value={c.shadows} min={-100} max={100} onChange={(v) => set({ shadows: v })} />
        <Slider label="Iluminación" value={c.highlights} min={-100} max={100} onChange={(v) => set({ highlights: v })} />
        <Slider label="Temperatura" value={c.temperature} min={-100} max={100} onChange={(v) => set({ temperature: v })} />
      </Section>
      <Section title="Filtros (LUT)">
        <div className="grid grid-cols-3 gap-1.5">
          {LUTS.map((l) => (
            <button
              key={l.id}
              onClick={() => set({ lut: l.id })}
              className={`overflow-hidden rounded-md border text-[10.5px] ${c.lut === l.id ? 'border-accent' : 'border-line hover:border-white/30'}`}
            >
              <div className="h-8" style={{ background: l.swatch }} />
              <div className="truncate px-1 py-0.5 text-[#c9c9d2]">{l.label}</div>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

function FontPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const cur = FONTS.find((f) => f.id === value) ?? FONTS[0];
  return (
    <div>
      <div className="flex items-center gap-2 min-h-[28px]">
        <span className="w-[84px] shrink-0 text-[12px] text-[#b7b7c2]">Fuente</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-8 min-w-0 flex-1 items-center justify-between rounded border border-line bg-app px-2 text-[14px] hover:border-white/30"
          style={{ fontFamily: cur.css }}
        >
          <span className="truncate">{cur.label}</span>
          <span className="ml-1 text-[10px] text-muted">{open ? '▲' : '▼'}</span>
        </button>
      </div>
      {open && (
        <div className="mt-1.5 max-h-[230px] overflow-y-auto rounded-md border border-line bg-app p-1.5">
          {FONT_GROUPS.map((g) => (
            <div key={g}>
              <div className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{g}</div>
              <div className="grid grid-cols-2 gap-1">
                {FONTS.filter((f) => f.group === g).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onChange(f.id);
                      setOpen(false);
                    }}
                    className={`truncate rounded border px-2 py-1.5 text-left text-[14px] ${
                      f.id === value ? 'border-accent bg-accent/15 text-accent' : 'border-line text-[#e1e1e8] hover:bg-white/10'
                    }`}
                    style={{ fontFamily: f.css }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TextTab({ clip }) {
  const st = clip.style;
  const set = (patch) => patchClip(clip.id, (c) => ({ ...c, style: { ...c.style, ...patch } }), `style:${Object.keys(patch).join(',')}`);
  return (
    <>
      <Section title="Contenido">
        <textarea
          value={clip.text}
          onChange={(e) => patchClip(clip.id, (c) => ({ ...c, text: e.target.value }), 'text')}
          rows={2}
          className="w-full resize-none rounded-md border border-line bg-app p-2 text-[13px] outline-none focus:border-accent"
          placeholder="Escribe tu texto"
        />
        <FontPicker value={st.font} onChange={(v) => set({ font: v })} />
        <Slider label="Tamaño" value={st.size} min={10} max={300} onChange={(v) => set({ size: v })} />
        <div className="flex items-center gap-2">
          <Segmented
            className="flex-1"
            value={st.align}
            options={[
              { value: 'left', icon: LuAlignLeft, title: 'Izquierda' },
              { value: 'center', icon: LuAlignCenter, title: 'Centro' },
              { value: 'right', icon: LuAlignRight, title: 'Derecha' },
            ]}
            onChange={(v) => set({ align: v })}
          />
          <IconBtn icon={LuBold} title="Negrita" active={st.bold} onClick={() => set({ bold: !st.bold })} className="h-7 w-8 border border-line" />
          <IconBtn icon={LuItalic} title="Cursiva" active={st.italic} onClick={() => set({ italic: !st.italic })} className="h-7 w-8 border border-line" />
        </div>
        <ColorField label="Relleno" value={st.color} onChange={(v) => set({ color: v })} />
      </Section>
      <Section title="Borde">
        <Slider label="Grosor" value={st.strokeWidth} min={0} max={30} onChange={(v) => set({ strokeWidth: v })} />
        {st.strokeWidth > 0 && <ColorField label="Color" value={st.strokeColor} onChange={(v) => set({ strokeColor: v })} />}
      </Section>
      <Section title="Sombra">
        <Toggle label="Activar sombra" checked={st.shadow} onChange={(v) => set({ shadow: v })} />
        {st.shadow && (
          <>
            <ColorField label="Color" value={st.shadowColor} onChange={(v) => set({ shadowColor: v })} />
            <Slider label="Desenfoque" value={st.shadowBlur} min={0} max={60} onChange={(v) => set({ shadowBlur: v })} />
            <Slider label="Desplazar X" value={st.shadowX} min={-40} max={40} onChange={(v) => set({ shadowX: v })} />
            <Slider label="Desplazar Y" value={st.shadowY} min={-40} max={40} onChange={(v) => set({ shadowY: v })} />
          </>
        )}
      </Section>
      <Section title="Fondo">
        <Toggle label="Mostrar fondo" checked={st.bgEnabled} onChange={(v) => set({ bgEnabled: v })} />
        {st.bgEnabled && (
          <>
            <ColorField label="Color" value={st.bgColor} onChange={(v) => set({ bgColor: v })} />
            <Slider label="Opacidad" value={st.bgOpacity} min={0} max={100} unit="%" onChange={(v) => set({ bgOpacity: v })} />
          </>
        )}
      </Section>
      <Section title="Espaciado">
        <Slider label="Entre letras" value={st.letterSpacing} min={-5} max={40} onChange={(v) => set({ letterSpacing: v })} />
        <Slider label="Entre líneas" value={st.lineSpacing} min={0.8} max={3} step={0.05} onChange={(v) => set({ lineSpacing: v })} />
      </Section>
    </>
  );
}

function EffectTab({ clip }) {
  if (clip.fxKind) return <FxLayerEditor clip={clip} />;
  return (
    <Section title="Efecto de video">
      <div className="grid grid-cols-3 gap-1.5">
        {EFFECTS.map((e) => (
          <button
            key={e.id}
            onClick={() => patchClip(clip.id, (c) => ({ ...c, effectId: e.id }))}
            className={`overflow-hidden rounded-md border text-[10.5px] ${clip.effectId === e.id ? 'border-accent' : 'border-line hover:border-white/30'}`}
          >
            <div className="h-8" style={{ background: e.swatch }} />
            <div className="truncate px-1 py-0.5 text-[#c9c9d2]">{e.label}</div>
          </button>
        ))}
      </div>
      <Slider label="Intensidad" value={clip.intensity ?? 100} min={0} max={150} unit="%" onChange={(v) => patchClip(clip.id, (c) => ({ ...c, intensity: v }), 'intensity')} />
      <p className="text-[11px] leading-snug text-muted">
        El efecto afecta a todas las capas que están debajo de su pista durante la duración del clip.
      </p>
    </Section>
  );
}

function ProjectPanel() {
  const project = useStore((s) => s.project);
  return (
    <div>
      <div className="flex flex-col items-center gap-1 border-b border-line/70 px-4 py-5 text-center text-muted">
        <LuMousePointer2 size={22} />
        <p className="text-[12px] leading-snug">Selecciona un clip en la línea de tiempo o en la vista previa para editar sus propiedades.</p>
      </div>
      <Section title="Proyecto">
        <Select
          label="Proporción"
          value={project.ratio}
          options={Object.keys(RATIOS).map((r) => ({ value: r, label: r }))}
          onChange={(v) => setProject({ ratio: v })}
        />
        <Select
          label="Resolución"
          value={String(project.res)}
          options={RESOLUTIONS.map((r) => ({ value: String(r), label: `${r}P` }))}
          onChange={(v) => setProject({ res: Number(v) })}
        />
        <Select
          label="Fotogramas"
          value={String(project.fps)}
          options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))}
          onChange={(v) => setProject({ fps: Number(v) })}
        />
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- inspector
export default function Inspector({ padRight = false }) {
  const clip = useStore((s) => findClip(s.tracks, s.selectedId)?.clip ?? null);
  const stored = useStore((s) => s.inspectorTab);
  if (!clip) return <div className="h-full overflow-y-auto bg-panel"><ProjectPanel /></div>;

  const tabs = tabsFor(clip.type);
  const tab = tabs.includes(stored) ? stored : tabs[0];
  const setTab = (t) => store.setState({ inspectorTab: t });

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex shrink-0 items-center border-b border-line" style={padRight ? { paddingRight: 36 } : undefined}>
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 border-b-2 px-2.5 py-2.5 text-[12px] ${tab === t ? 'border-accent text-accent' : 'border-transparent text-[#a9a9b4] hover:text-white'}`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <IconBtn icon={LuTrash2} title="Eliminar clip" onClick={() => deleteClip(clip.id)} className="mx-1 h-8 w-8 shrink-0 text-[#e8756f]" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" key={`${clip.id}:${tab}`}>
        {(tab === 'video' || tab === 'basic' || tab === 'audio') && <KeyframeBar clip={clip} />}
        {tab === 'video' && <TransformControls clip={clip} />}
        {tab === 'basic' && <TransformControls clip={clip} />}
        {tab === 'crop' && <CropTab clip={clip} />}
        {tab === 'audio' && <AudioTab clip={clip} />}
        {tab === 'speed' && <SpeedTab clip={clip} />}
        {tab === 'color' && <ColorTab clip={clip} />}
        {tab === 'text' && <TextTab clip={clip} />}
        {tab === 'effect' && <EffectTab clip={clip} />}
        {tab === 'fx' && <FxTab clip={clip} />}
      </div>
    </div>
  );
}
