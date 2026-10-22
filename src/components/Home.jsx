import { useCallback, useEffect, useState } from 'react';
import { LuPlus, LuEllipsisVertical, LuPencil, LuCopy, LuTrash2, LuFilm, LuFolderOpen } from 'react-icons/lu';
import { toast } from '../store/store.js';
import {
  newProject, openProject, listAll, renameProject, duplicateProject, removeProject, storageUsage,
} from '../lib/projects.js';
import { shortTime } from '../lib/time.js';
import { Dropdown, MenuItem } from './ui.jsx';

const fmtDate = (t) => {
  const d = new Date(t);
  const diff = Date.now() - t;
  if (diff < 60_000) return 'Ahora mismo';
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000 && new Date().getDate() === d.getDate()) {
    return `Hoy ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
};

const fmtBytes = (n) =>
  n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.round(n / 1e3)} KB`;

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4" onPointerDown={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-[15px] font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Card({ p, onOpen, onRename, onDuplicate, onDelete }) {
  const aspect = { '16:9': '16/9', '9:16': '9/16', '1:1': '1/1', '4:3': '4/3' }[p.ratio] ?? '16/9';
  return (
    <div className="group relative rounded-xl border border-line bg-panel transition-colors hover:border-white/20">
      <button onClick={() => onOpen(p.id)} className="block w-full text-left">
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-t-xl bg-[#0b0b0d]">
          {p.thumb ? (
            <img src={p.thumb} alt="" className="max-h-full max-w-full object-contain" style={{ aspectRatio: aspect }} draggable={false} />
          ) : (
            <LuFilm size={28} className="text-white/20" />
          )}
        </div>
        <div className="px-3 pb-2.5 pt-2 pr-10">
          <div className="truncate text-[13.5px] font-medium">{p.name}</div>
          <div className="mt-0.5 text-[11.5px] text-muted">
            {shortTime(p.duration || 0)} · {p.ratio} · {fmtDate(p.updated)}
          </div>
        </div>
      </button>
      <div className="absolute bottom-1.5 right-1">
        <Dropdown
          align="right"
          trigger={() => (
            <button className="flex h-8 w-8 items-center justify-center rounded-md text-[#cfcfd8] hover:bg-white/10" aria-label="Opciones">
              <LuEllipsisVertical size={17} />
            </button>
          )}
        >
          <MenuItem onClick={() => onOpen(p.id)}>
            <LuFolderOpen size={14} /> Abrir
          </MenuItem>
          <MenuItem onClick={() => onRename(p)}>
            <LuPencil size={14} /> Renombrar
          </MenuItem>
          <MenuItem onClick={() => onDuplicate(p.id)}>
            <LuCopy size={14} /> Duplicar
          </MenuItem>
          <MenuItem onClick={() => onDelete(p)}>
            <LuTrash2 size={14} className="text-red-400" /> <span className="text-red-400">Eliminar</span>
          </MenuItem>
        </Dropdown>
      </div>
    </div>
  );
}

export default function Home() {
  const [items, setItems] = useState(null);
  const [usage, setUsage] = useState(null);
  const [dialog, setDialog] = useState(null); // {type:'rename'|'delete', p}
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setItems(await listAll());
    } catch {
      setItems([]);
      toast('No se pudo leer el almacenamiento');
    }
    storageUsage().then(setUsage);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const guard = (fn) => async (...a) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn(...a);
    } finally {
      setBusy(false);
    }
  };

  const create = guard(newProject);
  const open = guard(openProject);
  const duplicate = guard(async (id) => {
    await duplicateProject(id);
    await refresh();
    toast('Proyecto duplicado');
  });

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="safe-top safe-x shrink-0 border-b border-line bg-[#16161a]">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <img src="logo.png" alt="LineCut" className="h-9 w-9 rounded-lg" draggable={false} />
          <span className="text-[18px] font-bold tracking-tight">
            Line<span className="text-brand">Cut</span>
          </span>
          <div className="flex-1" />
          <button
            onClick={create}
            disabled={busy}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13.5px] font-semibold text-black hover:brightness-110 active:brightness-95 disabled:opacity-60"
          >
            <LuPlus size={17} /> <span>Nuevo proyecto</span>
          </button>
        </div>
      </header>

      <main className="safe-x min-h-0 flex-1 overflow-y-auto py-5">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Mis proyectos</h2>
            {usage && <span className="text-[11px] text-muted">Almacenamiento usado: {fmtBytes(usage.usage)}</span>}
          </div>

          {items === null ? null : items.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
              <img src="logo.png" alt="" className="mb-4 h-16 w-16 rounded-2xl opacity-90" draggable={false} />
              <p className="text-[15px] font-medium">Aún no tienes proyectos</p>
              <p className="mt-1 max-w-xs text-[12.5px] text-muted">
                Crea uno nuevo. Se guarda solo, con sus videos, y lo encontrarás aquí la próxima vez.
              </p>
              <button
                onClick={create}
                className="mt-5 flex h-10 items-center gap-1.5 rounded-lg bg-accent px-5 text-[14px] font-semibold text-black hover:brightness-110"
              >
                <LuPlus size={18} /> Crear proyecto
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <Card
                  key={p.id}
                  p={p}
                  onOpen={open}
                  onDuplicate={duplicate}
                  onRename={(pr) => {
                    setName(pr.name);
                    setDialog({ type: 'rename', p: pr });
                  }}
                  onDelete={(pr) => setDialog({ type: 'delete', p: pr })}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {dialog?.type === 'rename' && (
        <Modal title="Renombrar proyecto" onClose={() => setDialog(null)}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.nextSibling.querySelector('[data-ok]').click()}
            className="h-10 w-full rounded-md border border-line bg-app px-3 text-[14px] outline-none focus:border-accent"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDialog(null)} className="h-9 rounded-md px-3 text-[13px] hover:bg-white/10">
              Cancelar
            </button>
            <button
              data-ok
              onClick={async () => {
                await renameProject(dialog.p.id, name);
                setDialog(null);
                refresh();
              }}
              className="h-9 rounded-md bg-accent px-4 text-[13px] font-semibold text-black"
            >
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {dialog?.type === 'delete' && (
        <Modal title="¿Eliminar proyecto?" onClose={() => setDialog(null)}>
          <p className="text-[13px] text-[#cfcfd8]">
            «{dialog.p.name}» y sus videos guardados se borrarán de este dispositivo. No se puede deshacer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDialog(null)} className="h-9 rounded-md px-3 text-[13px] hover:bg-white/10">
              Cancelar
            </button>
            <button
              onClick={async () => {
                await removeProject(dialog.p.id);
                setDialog(null);
                refresh();
              }}
              className="h-9 rounded-md bg-red-500 px-4 text-[13px] font-semibold text-white"
            >
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
