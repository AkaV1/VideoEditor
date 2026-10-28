import {
  LuCopy, LuTrash2, LuChevronUp, LuChevronDown, LuEye, LuEyeOff, LuRotateCcw, LuWandSparkles,
} from 'react-icons/lu';
import { useStore } from '../store/store.js';
import { Section, Slider, IconBtn } from './ui.jsx';
import { ParamEditor } from './FxLibrary.jsx';
import { getItem } from '../lib/fx/registry.js';
import { getAnim } from '../lib/fx/anim.js';
import { getTextFx } from '../lib/fx/textfx.js';
import { getAudioFx } from '../lib/fx/audiofx.js';
import {
  updateClipFx, removeClipFx, duplicateClipFx, moveClipFx, resetClipFx, clearClipFx, setAnim, setTextFx, removeTextFx,
  setTransitionParams, applyTransitionFull, updateAudioFx, removeAudioFx, setFxLayerParams, resolveItem, useLowPerf, setLowPerf, markBeats,
} from '../store/fxOps.js';
import { patchClip } from '../store/store.js';

function Row({ title, children, actions }) {
  return (
    <div className="rounded-lg border border-line bg-panel2 p-2">
      <div className="mb-1 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#e0e0e8]">{title}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}
const ic = (icon, title, onClick, extra = '') => <IconBtn key={title} icon={icon} title={title} onClick={onClick} size={15} className={`h-6 w-6 ${extra}`} />;

/** Parámetros de una capa de efecto (clip de tipo «effect» creado desde la biblioteca). */
export function FxLayerEditor({ clip }) {
  const it = resolveItem(clip.fxKind, clip.fxId);
  if (!it) return null;
  return (
    <Section title={it.label}>
      <ParamEditor item={it} values={clip.fxParams} onChange={(p) => setFxLayerParams(clip.id, p)} />
      <button onClick={() => patchClip(clip.id, (c) => ({ ...c, fxParams: Object.fromEntries((it.params || []).map((d) => [d.id, d.def])) }))} className="mt-1 flex items-center gap-1 text-[11.5px] text-muted hover:text-white"><LuRotateCcw size={13} /> Restablecer</button>
      <p className="text-[11px] leading-snug text-muted">La capa afecta a todo lo que hay debajo durante la duración del clip.</p>
    </Section>
  );
}

/** Lista de todo lo aplicado al clip: efectos, filtros, animaciones, texto animado, transiciones y audio. */
export function FxTab({ clip }) {
  const low = useLowPerf();
  const fx = clip.fx || [];
  const anim = clip.anim || {};
  const visual = clip.type !== 'audio';
  const slotName = { in: 'Entrada', out: 'Salida', loop: 'Bucle' };
  const nothing = !fx.length && !Object.keys(anim).length && !(clip.textFx || []).length && !clip.transitionIn?.p && !clip.transitionOut?.p && !(clip.audioFx || []).length;
  return (
    <div className="flex flex-col gap-3 p-3">
      {nothing && (
        <div className="rounded-lg border border-dashed border-line p-4 text-center text-[12px] text-muted">
          <LuWandSparkles className="mx-auto mb-1" size={20} />
          Aún no hay efectos en este clip. Ábrelos desde la pestaña «Biblioteca» del panel de recursos.
        </div>
      )}
      {visual && fx.length > 0 && (
        <Section title="Efectos y filtros" right={<button onClick={() => clearClipFx(clip.id)} className="text-[11px] text-[#e8756f]">Quitar todos</button>}>
          {fx.map((f, i) => {
            const it = getItem(f.kind, f.id);
            if (!it) return null;
            return (
              <Row
                key={f.uid}
                title={it.label}
                actions={[
                  ic(f.off ? LuEyeOff : LuEye, f.off ? 'Activar' : 'Desactivar', () => updateClipFx(clip.id, f.uid, { off: !f.off })),
                  ic(LuChevronUp, 'Subir', () => moveClipFx(clip.id, f.uid, -1), i === 0 ? 'opacity-30' : ''),
                  ic(LuChevronDown, 'Bajar', () => moveClipFx(clip.id, f.uid, 1), i === fx.length - 1 ? 'opacity-30' : ''),
                  ic(LuCopy, 'Duplicar', () => duplicateClipFx(clip.id, f.uid)),
                  ic(LuRotateCcw, 'Restablecer', () => resetClipFx(clip.id, f.uid)),
                  ic(LuTrash2, 'Quitar', () => removeClipFx(clip.id, f.uid), 'text-[#e8756f]'),
                ]}
              >
                <div className={f.off ? 'pointer-events-none opacity-40' : ''}>
                  <ParamEditor item={it} values={f.p} onChange={(p) => updateClipFx(clip.id, f.uid, { p })} />
                </div>
              </Row>
            );
          })}
        </Section>
      )}
      {visual && Object.keys(anim).length > 0 && (
        <Section title="Animaciones">
          {Object.entries(anim).map(([slot, a]) => {
            const it = getAnim(a.id);
            if (!it) return null;
            return (
              <Row key={slot} title={`${slotName[slot]} · ${it.label}`} actions={[ic(LuTrash2, 'Quitar', () => setAnim(clip.id, slot, null), 'text-[#e8756f]')]}>
                {slot !== 'loop' && <Slider label="Duración" value={a.duration} min={0.2} max={Math.max(0.3, Math.min(3, clip.duration))} step={0.1} unit=" s" onChange={(v) => setAnim(clip.id, slot, a.id, { duration: v })} />}
                <ParamEditor item={it} values={a.p} skip={[]} onChange={(p) => setAnim(clip.id, slot, a.id, { p })} />
              </Row>
            );
          })}
        </Section>
      )}
      {clip.type === 'text' && (clip.textFx || []).length > 0 && (
        <Section title="Texto animado">
          {clip.textFx.map((f) => {
            const it = getTextFx(f.id);
            if (!it) return null;
            return (
              <Row key={f.id} title={it.label} actions={[ic(LuTrash2, 'Quitar', () => removeTextFx(clip.id, f.id), 'text-[#e8756f]')]}>
                <ParamEditor item={it} values={f.p} onChange={(p) => setTextFx(clip.id, f.id, { p })} />
              </Row>
            );
          })}
        </Section>
      )}
      {visual && ['in', 'out'].map((side) => {
        const tr = side === 'in' ? clip.transitionIn : clip.transitionOut;
        const it = tr && getItem('transition', tr.type);
        if (!it || !(it.params || []).length) return null;
        return (
          <Section key={side} title={`Transición de ${side === 'in' ? 'entrada' : 'salida'} · ${it.label}`}>
            <ParamEditor item={it} values={tr.p} onChange={(p) => setTransitionParams(clip.id, side, { p })} />
            <button onClick={() => applyTransitionFull(tr.type, side, null, tr.duration, clip.id)} className="mt-1 flex items-center gap-1 text-[11.5px] text-muted hover:text-white"><LuRotateCcw size={13} /> Restablecer</button>
          </Section>
        );
      })}
      {(clip.audioFx || []).length > 0 && (
        <Section title="Efectos de audio">
          {clip.audioFx.map((f) => {
            const it = getAudioFx(f.id);
            if (!it) return null;
            return (
              <Row key={f.uid} title={it.label} actions={[ic(f.off ? LuEyeOff : LuEye, 'Activar/desactivar', () => updateAudioFx(clip.id, f.uid, { off: !f.off })), ic(LuTrash2, 'Quitar', () => removeAudioFx(clip.id, f.uid), 'text-[#e8756f]')]}>
                <ParamEditor item={it} values={f.p} onChange={(p) => updateAudioFx(clip.id, f.uid, { p })} />
              </Row>
            );
          })}
        </Section>
      )}
      {(clip.type === 'video' || clip.type === 'audio') && (
        <button onClick={() => markBeats(clip.id)} className="rounded-lg border border-line bg-panel2 px-3 py-2 text-left text-[12px] text-[#d7d7df]">
          Marcar el ritmo en la línea de tiempo
          <span className="block text-[10.5px] text-muted">Detección aproximada de golpes de graves; úsalas para cortar o poner efectos al compás.</span>
        </button>
      )}
      <label className="flex items-center gap-2 text-[11.5px] text-muted">
        <input type="checkbox" checked={low} onChange={(e) => setLowPerf(e.target.checked)} />
        Modo de bajo rendimiento
      </label>
    </div>
  );
}
void useStore;
