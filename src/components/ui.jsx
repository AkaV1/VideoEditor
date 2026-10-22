import { useEffect, useRef, useState } from 'react';
import { clamp } from '../lib/time.js';

export function IconBtn({ icon: Icon, title, onClick, active, disabled, className = '', size = 18, children, ...rest }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1 rounded-md transition-colors select-none
        ${disabled ? 'opacity-35 cursor-not-allowed' : 'hover:bg-white/10 active:bg-white/15 cursor-pointer'}
        ${active ? 'bg-accent/15 text-accent' : 'text-[#cfcfd8]'} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={size} />}
      {children}
    </button>
  );
}

export function Section({ title, children, right }) {
  return (
    <div className="px-3 py-2.5 border-b border-line/70">
      {title && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</span>
          {right}
        </div>
      )}
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

const fmt = (v, step) => {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return Number(v).toFixed(d);
};

/** Rombo de keyframe: 'off' sin animar · 'near' animada, sin keyframe aquí · 'on' keyframe en el cabezal. */
export function KfDiamond({ state = 'off', onClick, size = 14, title }) {
  const on = state === 'on';
  const near = state === 'near';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (on ? 'Quitar keyframe' : 'Añadir keyframe')}
      aria-label={title ?? (on ? 'Quitar keyframe' : 'Añadir keyframe')}
      aria-pressed={on}
      className="flex h-6 w-5 shrink-0 items-center justify-center"
    >
      <svg width={size} height={size} viewBox="0 0 14 14">
        <path
          d="M7 1.2 12.8 7 7 12.8 1.2 7z"
          fill={on ? '#ffc933' : 'none'}
          stroke={on || near ? '#ffc933' : '#7a7a86'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, hardMax = null, kf = null }) {
  const v = Number.isFinite(value) ? value : 0;
  const fill = ((clamp(v, min, max) - min) / (max - min)) * 100;
  const [draft, setDraft] = useState(null);
  return (
    <div className="flex items-center gap-2 min-h-[26px]">
      <span className="flex w-[84px] shrink-0 items-center justify-between text-[12px] text-[#b7b7c2] leading-tight">
        <span className="min-w-0">{label}</span>
        {kf && <KfDiamond state={kf.state} onClick={kf.onToggle} />}
      </span>
      <input
        type="range"
        className="flex-1 min-w-0"
        style={{ '--fill': `${fill}%` }}
        min={min}
        max={max}
        step={step}
        value={clamp(v, min, max)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="flex items-center rounded bg-app border border-line px-1.5 h-6 w-[62px] shrink-0">
        <input
          className="w-full bg-transparent text-[12px] text-right outline-none tabular-nums"
          value={draft ?? fmt(v, step)}
          inputMode="decimal"
          onFocus={(e) => {
            setDraft(fmt(v, step));
            e.target.select();
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseFloat(e.target.value.replace(',', '.'));
            if (Number.isFinite(n)) onChange(clamp(n, min, hardMax ?? max));
          }}
          onBlur={() => setDraft(null)}
        />
        {unit && <span className="ml-0.5 text-[10px] text-muted">{unit}</span>}
      </span>
    </div>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-2 min-h-[26px] text-left"
    >
      <span className="text-[12px] text-[#b7b7c2]">{label}</span>
      <span className={`relative h-[18px] w-[32px] rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-[#3a3a44]'}`}>
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`}
        />
      </span>
    </button>
  );
}

export function Select({ label, value, options, onChange }) {
  return (
    <label className="flex items-center gap-2 min-h-[28px]">
      {label && <span className="w-[84px] shrink-0 text-[12px] text-[#b7b7c2]">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 h-7 rounded border border-line bg-app px-1.5 text-[12px] text-[#e8e8ee] outline-none focus:border-accent"
      >
        {options.map((o) => (
          <option key={o.value ?? o.id} value={o.value ?? o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ColorField({ label, value, onChange }) {
  const hex = (value || '#ffffff').slice(0, 7);
  const transparent = (value || '').length === 9 && value.slice(7) === '00';
  return (
    <label className="flex items-center gap-2 min-h-[28px]">
      <span className="w-[84px] shrink-0 text-[12px] text-[#b7b7c2]">{label}</span>
      <span className="relative h-6 w-10 overflow-hidden rounded border border-line checker">
        {!transparent && <span className="absolute inset-0" style={{ background: hex }} />}
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="text-[11px] uppercase text-muted">{transparent ? 'transp.' : hex}</span>
    </label>
  );
}

export function Segmented({ value, options, onChange, className = '' }) {
  return (
    <div className={`flex rounded-md bg-app p-0.5 border border-line ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-6 px-2 rounded text-[12px] flex items-center justify-center gap-1 ${
            value === o.value ? 'bg-accent/20 text-accent' : 'text-[#b7b7c2] hover:text-white'
          }`}
        >
          {o.icon ? <o.icon size={14} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Menú desplegable simple que se cierra al tocar fuera. */
export function Dropdown({ trigger, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={`absolute z-[80] mt-1 min-w-[150px] rounded-lg border border-line bg-panel2 py-1 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/10 ${
        active ? 'text-accent' : 'text-[#dcdce4]'
      }`}
    >
      {children}
    </button>
  );
}
