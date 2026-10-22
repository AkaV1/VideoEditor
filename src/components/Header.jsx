import { LuUndo2, LuRedo2, LuDownload, LuChevronDown } from 'react-icons/lu';
import { useStore, undo, redo, setProject } from '../store/store.js';
import { RESOLUTIONS, FPS_OPTIONS } from '../lib/presets.js';
import { openExportDialog } from '../lib/exporter.js';
import { IconBtn, Dropdown, MenuItem } from './ui.jsx';

export default function Header() {
  const name = useStore((s) => s.project.name);
  const res = useStore((s) => s.project.res);
  const fps = useStore((s) => s.project.fps);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  return (
    <header className="safe-top safe-x shrink-0 border-b border-line bg-[#16161a]">
      <div className="flex h-12 items-center gap-2 px-2 sm:px-3">
        <div className="flex items-center gap-2">
          <img src="logo.png" alt="LineCut" className="h-8 w-8 rounded-lg" draggable={false} />
          <span className="hidden text-[15px] font-bold tracking-tight sm:inline">
            Line<span className="text-brand">Cut</span>
          </span>
        </div>

        <div className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <input
          value={name}
          onChange={(e) => setProject({ name: e.target.value })}
          spellCheck={false}
          className="h-8 min-w-[70px] flex-1 rounded-md bg-transparent px-2 text-[13px] outline-none hover:bg-white/5 focus:bg-white/10 sm:max-w-[240px] sm:flex-none"
          aria-label="Nombre del proyecto"
        />

        <div className="flex items-center">
          <IconBtn icon={LuUndo2} title="Deshacer (Ctrl+Z)" onClick={undo} disabled={!canUndo} className="h-8 w-8" />
          <IconBtn icon={LuRedo2} title="Rehacer (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} className="h-8 w-8" />
        </div>

        <div className="flex-1 max-sm:hidden" />

        <Dropdown
          align="right"
          className="max-sm:hidden"
          trigger={() => (
            <button className="flex h-8 items-center gap-1 rounded-md border border-line px-2 text-[12px] text-[#cfcfd8] hover:bg-white/10">
              {res}P / {fps}fps <LuChevronDown size={14} />
            </button>
          )}
        >
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase text-muted">Resolución</div>
          {RESOLUTIONS.map((r) => (
            <MenuItem key={r} active={r === res} onClick={() => setProject({ res: r })}>
              {r}P
            </MenuItem>
          ))}
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-muted">Fotogramas</div>
          {FPS_OPTIONS.map((f) => (
            <MenuItem key={f} active={f === fps} onClick={() => setProject({ fps: f })}>
              {f} fps
            </MenuItem>
          ))}
        </Dropdown>

        <button
          onClick={openExportDialog}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-black hover:brightness-110 active:brightness-95"
        >
          <LuDownload size={15} />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
}
