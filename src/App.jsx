import { useEffect, useState } from 'react';
import { LuX, LuSlidersHorizontal } from 'react-icons/lu';
import {
  store, getState, useStore, undo, redo, togglePlay, seek, stepFrames, setTool, splitAtPlayhead,
  deleteSelected, addMarker, selectClip, pause,
} from './store/store.js';
import { engine } from './lib/engine.js';
import { stopPreview } from './lib/synth.js';
import Header from './components/Header.jsx';
import Preview from './components/Preview.jsx';
import Timeline from './components/Timeline.jsx';
import Inspector from './components/Inspector.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import Home from './components/Home.jsx';
import { AssetsPanel, AssetTabsVertical, ASSET_TABS } from './components/AssetsPanel.jsx';

// ------------------------------------------------------------ diseño responsive
function useLayout() {
  const q = () => ({
    desktop: window.matchMedia('(min-width: 1024px) and (min-height: 540px)').matches,
    landscape: window.matchMedia('(orientation: landscape)').matches,
  });
  const [m, setM] = useState(q);
  useEffect(() => {
    const on = () => setM(q());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return m;
}

// ------------------------------------------------------------------ atajos
function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === ' ') {
        e.preventDefault();
        engine.ensureAudio();
        togglePlay();
      } else if (k === 'v') setTool('select');
      else if (k === 'b') setTool('cut');
      else if (k === 's' && !mod) splitAtPlayhead();
      else if (k === 'm') addMarker(getState().currentTime);
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'ArrowLeft') stepFrames(e.shiftKey ? -10 : -1);
      else if (e.key === 'ArrowRight') stepFrames(e.shiftKey ? 10 : 1);
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(getState().duration);
      else if (e.key === 'Escape') selectClip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// -------------------------------------------------------- fantasma del arrastre
function DragGhost() {
  const drag = useStore((s) => s.drag);
  if (!drag) return null;
  const p = drag.payload;
  const label =
    p.kind === 'sticker' ? p.emoji
      : p.kind === 'text' ? 'Texto'
      : p.kind === 'effect' ? 'Efecto'
      : p.kind === 'filter' ? 'Filtro'
      : p.kind === 'transition' ? 'Transición'
      : p.kind === 'audio' ? '♪ Audio'
      : 'Clip';
  return (
    <div
      className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-accent bg-panel2/95 px-3 py-2 text-[13px] shadow-2xl"
      style={{ left: drag.x, top: drag.y }}
    >
      {label}
    </div>
  );
}

function Toast() {
  const msg = useStore((s) => s.toast);
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[150] -translate-x-1/2 rounded-full bg-[#2b2b33] px-4 py-2 text-[13px] shadow-xl ring-1 ring-white/10">
      {msg}
    </div>
  );
}

// ------------------------------------------------------------ navegación inferior
function BottomNav() {
  const panel = useStore((s) => s.panel);
  const tab = useStore((s) => s.assetTab);
  const hasSel = useStore((s) => !!s.selectedId);
  const item = (active, onClick, Icon, label, dot) => (
    <button
      key={label}
      onClick={onClick}
      className={`relative flex min-w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[10.5px] ${
        active ? 'text-accent' : 'text-[#a9a9b4]'
      }`}
    >
      <Icon size={19} />
      {label}
      {dot && <span className="absolute right-3 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
  );
  return (
    <nav className="safe-bottom safe-x shrink-0 border-t border-line bg-[#16161a]">
      <div className="flex overflow-x-auto">
        {ASSET_TABS.map((t) =>
          item(
            panel === 'assets' && tab === t.id,
            () => {
              stopPreview();
              if (panel === 'assets' && tab === t.id) store.setState({ panel: null });
              else store.setState({ panel: 'assets', assetTab: t.id });
            },
            t.icon,
            t.label,
          ),
        )}
        {item(
          panel === 'inspector',
          () => store.setState({ panel: panel === 'inspector' ? null : 'inspector' }),
          LuSlidersHorizontal,
          'Propiedades',
          hasSel,
        )}
      </div>
    </nav>
  );
}

function PanelBody({ className = '' }) {
  const panel = useStore((s) => s.panel);
  if (!panel) return null;
  return (
    <div className={`relative flex min-h-0 flex-col border-t border-line bg-panel ${className}`}>
      <button
        onClick={() => {
          stopPreview();
          store.setState({ panel: null });
        }}
        className="absolute right-1.5 top-1.5 z-10 rounded-full bg-black/40 p-1 text-white hover:bg-black/70"
        aria-label="Cerrar panel"
      >
        <LuX size={16} />
      </button>
      <div className="min-h-0 flex-1">{panel === 'assets' ? <AssetsPanel /> : <Inspector padRight />}</div>
    </div>
  );
}

// ---------------------------------------------------------------- layouts
function Desktop() {
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0" style={{ flex: '0 0 56%' }}>
          <aside className="flex w-[380px] shrink-0 border-r border-line bg-panel">
            <AssetTabsVertical />
            <div className="min-w-0 flex-1">
              <AssetsPanel />
            </div>
          </aside>
          <main className="min-w-0 flex-1">
            <Preview />
          </main>
          <aside className="w-[330px] shrink-0 border-l border-line bg-panel">
            <Inspector />
          </aside>
        </div>
        <section className="min-h-0 flex-1 border-t border-line">
          <Timeline />
        </section>
      </div>
    </div>
  );
}

function CompactPortrait() {
  const panel = useStore((s) => s.panel);
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="min-h-0" style={{ flex: panel ? '0 0 30%' : '0 0 38%' }}>
        <Preview />
      </div>
      <div className="min-h-[150px] flex-1">
        <Timeline />
      </div>
      <PanelBody className="h-[34dvh] shrink-0" />
      <BottomNav />
    </div>
  );
}

function CompactLandscape() {
  return (
    <div className="flex h-full flex-col">
      <Header />
      <div className="flex min-h-0 flex-1">
        <div className="w-[42%] min-w-0 border-r border-line">
          <Preview />
        </div>
        <div className="relative min-w-0 flex-1">
          <Timeline />
          <PanelBody className="absolute inset-0 z-40 border-t-0" />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

function Editor() {
  const { desktop, landscape } = useLayout();
  useShortcuts();
  return desktop ? <Desktop /> : landscape ? <CompactLandscape /> : <CompactPortrait />;
}

export default function App() {
  const view = useStore((s) => s.view);

  useEffect(() => {
    // al salir de la app, detiene la reproducción
    const hide = () => document.hidden && pause();
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  return (
    <div className="h-full w-full bg-app text-[#e8e8ee]">
      {view === 'editor' ? <Editor /> : <Home />}
      <DragGhost />
      <Toast />
      <ExportDialog />
    </div>
  );
}
