import { useEffect, useRef, useState } from 'react';
import { LuX, LuDownload, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu';
import { useStore, setProject, projectSize } from '../store/store.js';
import { RESOLUTIONS, FPS_OPTIONS } from '../lib/presets.js';
import { startExport, cancelExport, closeExportDialog } from '../lib/exporter.js';
import { saveVideo, saveToGallery, isNative } from '../lib/native.js';
import { timecode } from '../lib/time.js';
import { Segmented } from './ui.jsx';

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function ExportDialog() {
  const ex = useStore((s) => s.exporting);
  const project = useStore((s) => s.project);
  const duration = useStore((s) => s.duration);
  const [msg, setMsg] = useState('');
  const [gal, setGal] = useState(null); // null | {state:'saving'|'ok'|'err', text, p}
  const savedFor = useRef(null);

  // En la app, al terminar la exportación el video va directo a la galería.
  const result = ex?.phase === 'done' ? ex.result : null;
  useEffect(() => {
    if (!result) {
      savedFor.current = null;
      setGal(null);
      setMsg('');
      return;
    }
    if (!isNative || savedFor.current === result.url) return;
    savedFor.current = result.url;
    setGal({ state: 'saving', p: 0 });
    saveToGallery(result.blob, result.name, (p) => setGal({ state: 'saving', p }))
      .then(() => setGal({ state: 'ok' }))
      .catch((e) => setGal({ state: 'err', text: e?.message || String(e) }));
  }, [result]);

  if (!ex) return null;

  const [bw, bh] = projectSize(project);
  const k = project.res / Math.min(bw, bh);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 safe-top safe-bottom">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Exportar video</h2>
          {ex.phase !== 'running' && (
            <button onClick={closeExportDialog} className="rounded p-1 text-muted hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <LuX size={18} />
            </button>
          )}
        </div>

        {ex.phase === 'config' && (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-[12px] text-muted">Resolución</div>
              <Segmented
                value={project.res}
                options={RESOLUTIONS.map((r) => ({ value: r, label: `${r}P` }))}
                onChange={(v) => setProject({ res: v })}
              />
            </div>
            <div>
              <div className="mb-1.5 text-[12px] text-muted">Fotogramas por segundo</div>
              <Segmented
                value={project.fps}
                options={FPS_OPTIONS.map((f) => ({ value: f, label: `${f} fps` }))}
                onChange={(v) => setProject({ fps: v })}
              />
            </div>
            <div className="rounded-lg bg-app p-3 text-[12px] leading-relaxed text-[#b7b7c2]">
              Tamaño: {Math.round(bw * k)}×{Math.round(bh * k)} · Duración: {timecode(duration, project.fps)}
              <br />
              La exportación graba el video en tiempo real: tardará lo que dura el proyecto y debes mantener la app abierta.
            </div>
            <button
              onClick={() => startExport()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-white hover:brightness-110"
            >
              <LuDownload size={16} /> Iniciar exportación
            </button>
          </div>
        )}

        {ex.phase === 'running' && (
          <div className="space-y-3">
            <p className="text-[13px] text-[#cfcfd8]">{ex.status}</p>
            <div className="h-2 overflow-hidden rounded-full bg-[#2d2d35]">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((ex.progress ?? 0) * 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[12px] text-muted">
              <span>{Math.round((ex.progress ?? 0) * 100)}%</span>
              <button onClick={cancelExport} className="rounded-md border border-line px-3 py-1 text-[#e8756f] hover:bg-white/5">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {ex.phase === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[13px] text-accent">
              <LuCircleCheck size={18} /> Video listo
            </div>
            <video src={ex.result.url} controls playsInline className="max-h-[38vh] w-full rounded-lg bg-black" />
            <div className="text-[12px] text-muted">
              {ex.result.name} · {ex.result.W}×{ex.result.H} · {ex.result.fps} fps · {mb(ex.result.size)}
              {ex.result.seconds ? ` · ${ex.result.seconds.toFixed(1)} s` : ''}
            </div>
            {ex.result.short && (
              <div className="flex items-start gap-2 rounded-lg border border-[#e8756f]/40 px-3 py-2 text-[12px] text-[#e8756f]">
                <LuTriangleAlert size={15} className="mt-0.5 shrink-0" />
                <span>
                  El video grabado dura {ex.result.seconds.toFixed(1)} s y el proyecto {ex.result.expected.toFixed(1)} s. Prueba a
                  exportar de nuevo en 720P / 30 fps.
                </span>
              </div>
            )}
            {isNative && gal && (
              <div
                className={`rounded-lg border px-3 py-2 text-[12.5px] ${
                  gal.state === 'ok' ? 'border-accent/40 bg-accent/10 text-accent'
                    : gal.state === 'err' ? 'border-[#e8756f]/40 text-[#e8756f]'
                    : 'border-line text-[#cfcfd8]'
                }`}
              >
                {gal.state === 'saving' && `Guardando en la galería… ${Math.round((gal.p ?? 0) * 100)}%`}
                {gal.state === 'ok' && 'Guardado en la galería (carpeta Movies/LineCut)'}
                {gal.state === 'err' && `No se pudo guardar en la galería: ${gal.text}. Usa «Compartir» para guardarlo.`}
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  setMsg(await saveVideo(ex.result.blob, ex.result.name));
                } catch (e) {
                  setMsg(`No se pudo guardar: ${e?.message || e}`);
                }
              }}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[14px] font-semibold text-white hover:brightness-110"
            >
              <LuDownload size={16} /> {isNative ? 'Compartir' : 'Descargar'}
            </button>
            {msg && <p className="text-[12px] text-[#b7b7c2]">{msg}</p>}
          </div>
        )}

        {ex.phase === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-[13px] text-[#e8756f]">
              <LuTriangleAlert size={18} className="mt-0.5 shrink-0" />
              <span>{ex.message}</span>
            </div>
            <button onClick={closeExportDialog} className="h-9 w-full rounded-lg border border-line text-[13px] hover:bg-white/5">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
