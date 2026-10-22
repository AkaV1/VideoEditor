import { useEffect, useState } from 'react';
import {
  LuPlus, LuScissors, LuType, LuSmile, LuSparkles, LuArrowLeftRight, LuMusic, LuDownload, LuChevronLeft,
  LuChevronRight, LuDiamond, LuHand, LuSlidersHorizontal, LuFilm, LuSquareSplitHorizontal, LuTrash2,
} from 'react-icons/lu';

const KEY = 'linecut_tutorial_v1';
export const tutorialSeen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* sin almacenamiento */
  }
};

// ---------------------------------------------------------------- ilustraciones
const Frame = ({ children, className = '' }) => (
  <div className={`relative mx-auto h-[170px] w-full max-w-[300px] overflow-hidden rounded-xl border border-line bg-[#16161a] p-3 ${className}`}>
    {children}
  </div>
);

const Bar = ({ w, color = '#5a2530', border = '#a03d4d', left = 0, children, h = 22 }) => (
  <div
    className="absolute flex items-center overflow-hidden rounded-md border px-1.5 text-[9px] text-white"
    style={{ width: w, left, height: h, background: color, borderColor: border }}
  >
    {children}
  </div>
);

const Playhead = ({ x }) => (
  <div className="absolute bottom-2 top-2 w-[2px] bg-accent" style={{ left: x }}>
    <div className="absolute -left-[3px] -top-0.5 h-2 w-2 rotate-45 bg-accent" />
  </div>
);

const Finger = ({ className = '' }) => (
  <LuHand size={26} className={`absolute rotate-[-20deg] text-white drop-shadow ${className}`} />
);

const ArtWelcome = () => (
  <div className="flex h-[170px] flex-col items-center justify-center gap-3">
    <img src="logo.png" alt="" className="h-24 w-24 rounded-3xl shadow-[0_0_40px_rgba(242,50,63,0.45)]" draggable={false} />
    <div className="text-[22px] font-bold tracking-tight">
      Line<span className="text-brand">Cut</span>
    </div>
  </div>
);

const ArtImport = () => (
  <Frame>
    <div className="flex h-full flex-col gap-2">
      <div className="flex h-[58px] flex-col items-center justify-center rounded-lg border border-dashed border-[#44444d] text-[10px] text-muted">
        <LuPlus size={18} className="text-accent" /> Importar medios
      </div>
      <div className="flex gap-2">
        {['#7a2a35', '#2a4d3f', '#4d3a73'].map((c, i) => (
          <div key={c} className="relative h-[52px] flex-1 rounded-md" style={{ background: c }}>
            <LuFilm size={14} className="absolute left-1 top-1 text-white/60" />
            {i === 0 && <span className="absolute bottom-1 right-1 rounded-full bg-accent p-0.5 text-white"><LuPlus size={10} /></span>}
          </div>
        ))}
      </div>
    </div>
    <Finger className="bottom-2 right-[88px]" />
  </Frame>
);

const ArtTimeline = () => (
  <Frame>
    <div className="relative h-full">
      <div className="absolute left-0 right-0 top-0 flex justify-between text-[8px] text-muted"><span>0s</span><span>2s</span><span>4s</span><span>6s</span></div>
      <div className="absolute left-0 top-6 text-[9px] text-muted">T</div>
      <Bar w={90} left={30} color="#4d3a73" border="#7459ad" h={20}>Texto</Bar>
      <div className="absolute top-[58px]"><Bar w={120} left={0} h={34}>Video 1</Bar></div>
      <div className="absolute top-[58px]"><Bar w={80} left={124} color="#2a4d3f" border="#3f7a62" h={34}>Foto</Bar></div>
      <div className="absolute top-[104px]"><Bar w={170} left={0} color="#5e5018" border="#a8922e" h={26}>♪ Música</Bar></div>
      <Playhead x={96} />
    </div>
    <Finger className="right-6 top-12" />
  </Frame>
);

const ArtEdit = () => (
  <Frame>
    <div className="relative h-full">
      <div className="absolute top-[34px]">
        <Bar w={110} left={20} h={44}>Clip</Bar>
        <Bar w={95} left={134} h={44} color="#5a2530">Clip</Bar>
      </div>
      <div className="absolute left-[16px] top-[32px] flex h-[48px] w-3 items-center justify-center rounded-l bg-accent"><span className="h-5 w-[2px] bg-white/70" /></div>
      <Playhead x={131} />
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 text-[10px]">
        <span className="flex items-center gap-1 rounded-md border border-line px-2 py-1"><LuSquareSplitHorizontal size={12} className="text-accent" /> Dividir</span>
        <span className="flex items-center gap-1 rounded-md border border-line px-2 py-1"><LuTrash2 size={12} className="text-accent" /> Borrar</span>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 text-[9px] text-muted"><LuScissors size={11} /> S</div>
    </div>
  </Frame>
);

const ArtAdd = () => (
  <Frame className="flex items-center">
    <div className="grid w-full grid-cols-4 gap-2 text-center text-[9.5px] text-[#c9c9d2]">
      {[[LuType, 'Texto'], [LuSmile, 'Stickers'], [LuSparkles, 'Efectos'], [LuArrowLeftRight, 'Transiciones']].map(([I, l]) => (
        <div key={l} className="flex flex-col items-center gap-1.5 rounded-lg border border-line bg-panel py-3">
          <I size={20} className="text-accent" />
          {l}
        </div>
      ))}
    </div>
  </Frame>
);

const Mini = ({ label, v, fill }) => (
  <div className="flex items-center gap-2 text-[9.5px] text-[#b7b7c2]">
    <span className="w-14">{label}</span>
    <div className="relative h-1 flex-1 rounded bg-[#3a3a44]">
      <div className="h-1 rounded bg-accent" style={{ width: `${fill}%` }} />
      <div className="absolute -top-1 h-3 w-3 rounded-full bg-white" style={{ left: `calc(${fill}% - 6px)` }} />
    </div>
    <span className="w-8 text-right tabular-nums">{v}</span>
  </div>
);

const ArtProps = () => (
  <Frame>
    <div className="mb-2 flex items-center gap-1.5 text-[10px] text-accent"><LuSlidersHorizontal size={13} /> Propiedades</div>
    <div className="space-y-2.5">
      <Mini label="Escala" v="100%" fill={40} />
      <Mini label="Rotación" v="0°" fill={50} />
      <Mini label="Opacidad" v="100%" fill={95} />
      <Mini label="Brillo" v="+20" fill={60} />
    </div>
  </Frame>
);

const ArtKeyframes = () => (
  <Frame>
    <div className="relative h-full">
      <div className="absolute left-2 top-1 flex h-14 w-14 items-center justify-center rounded-md bg-[#5a2530] text-[9px] text-white">100%</div>
      <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded bg-[#5a2530] text-[8px] text-white">50%</div>
      <svg className="absolute left-16 top-6" width="150" height="30"><path d="M2 20 C 50 20, 80 5, 140 12" stroke="#f2323f" strokeWidth="2" fill="none" strokeDasharray="4 4" /></svg>
      <div className="absolute bottom-5 left-2 right-2 h-[26px] rounded-md border border-[#a03d4d] bg-[#5a2530]" />
      <LuDiamond size={15} className="absolute bottom-[34px] left-7 fill-[#ffc933] text-[#ffc933]" />
      <LuDiamond size={15} className="absolute bottom-[34px] right-12 fill-[#ffc933] text-[#ffc933]" />
      <div className="absolute bottom-0 left-2 text-[9px] text-muted">0s</div>
      <div className="absolute bottom-0 right-8 text-[9px] text-muted">2s</div>
    </div>
  </Frame>
);

const ArtExport = () => (
  <Frame className="flex items-center justify-center gap-4">
    <div className="flex flex-col items-center gap-1.5 text-[10px] text-[#c9c9d2]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#5e5018]"><LuMusic size={22} /></div>
      Audio
    </div>
    <LuChevronRight className="text-muted" />
    <div className="flex flex-col items-center gap-1.5 text-[10px] text-[#c9c9d2]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white"><LuDownload size={22} /></div>
      Exportar
    </div>
    <LuChevronRight className="text-muted" />
    <div className="flex flex-col items-center gap-1.5 text-[10px] text-[#c9c9d2]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2a4d3f]"><LuFilm size={22} /></div>
      Galería
    </div>
  </Frame>
);

const SLIDES = [
  {
    art: <ArtWelcome />,
    title: 'Bienvenido a LineCut',
    text: 'Edita videos desde tu teléfono: corta, añade texto, efectos, música y animaciones. Te explicamos lo básico en menos de un minuto.',
  },
  {
    art: <ArtImport />,
    title: '1. Crea un proyecto e importa',
    text: 'Pulsa «Nuevo proyecto». En la pestaña Medios toca «Importar medios» y elige tus videos, fotos o audios. Tu trabajo se guarda solo y lo verás en «Mis proyectos».',
  },
  {
    art: <ArtTimeline />,
    title: '2. Arma tu línea de tiempo',
    text: 'Toca un medio para añadirlo en la posición del cabezal (la línea roja). También puedes mantenerlo pulsado y arrastrarlo. Toca la línea de tiempo para mover el cabezal y pellizca para hacer zoom.',
  },
  {
    art: <ArtEdit />,
    title: '3. Corta y ajusta clips',
    text: 'Selecciona un clip y arrastra sus bordes rojos para recortarlo. Pon el cabezal donde quieras y pulsa «Dividir» para cortarlo en dos. Mantén y arrastra un clip para moverlo. Con ↶ ↷ deshaces y rehaces.',
  },
  {
    art: <ArtAdd />,
    title: '4. Texto, stickers y efectos',
    text: 'Desde el menú inferior añade títulos, stickers, efectos de imagen, transiciones (de entrada y de salida), fuentes de letra y audio de la biblioteca. Cada uno se coloca en el cabezal y puedes moverlo en la vista previa.',
  },
  {
    art: <ArtProps />,
    title: '5. Propiedades de cada clip',
    text: 'Con un clip seleccionado abre «Propiedades»: escala, posición, rotación, opacidad, recorte, velocidad, color y volumen. En la vista previa puedes mover, escalar y girar con los tiradores.',
  },
  {
    art: <ArtKeyframes />,
    title: '6. Animaciones con keyframes',
    text: 'Pulsa «Añadir keyframe» en un punto, mueve el cabezal, cambia un valor (por ejemplo la escala) y la propiedad se animará entre ambos. Los rombos amarillos de la línea de tiempo marcan cada keyframe.',
  },
  {
    art: <ArtExport />,
    title: '7. Exporta a tu galería',
    text: 'Cuando termines pulsa «Exportar», elige resolución y fotogramas. El video se guarda directo en tu galería (carpeta Movies/LineCut). Mantén la app abierta mientras exporta.',
  },
];

// ---------------------------------------------------------------------- vista
export default function Tutorial({ onClose }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  const close = () => {
    markSeen();
    onClose();
  };
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(SLIDES.length - 1, v + 1));
      else if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  return (
    <div className="safe-top safe-bottom fixed inset-0 z-[500] flex items-center justify-center bg-black/80 p-3">
      <div className="flex max-h-full w-full max-w-[400px] flex-col rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-[11px] text-muted">
            {i + 1} / {SLIDES.length}
          </span>
          <button onClick={close} className="rounded px-2 py-1 text-[12px] text-muted hover:bg-white/10 hover:text-white">
            {last ? 'Cerrar' : 'Omitir'}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-2" key={i}>
          {s.art}
          <h2 className="mt-4 text-center text-[17px] font-semibold">{s.title}</h2>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-[#c3c3cd]">{s.text}</p>
        </div>
        <div className="flex justify-center gap-1.5 py-2">
          {SLIDES.map((_, k) => (
            <button
              key={k}
              onClick={() => setI(k)}
              aria-label={`Paso ${k + 1}`}
              className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-accent' : 'w-1.5 bg-[#44444d]'}`}
            />
          ))}
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={() => setI(i - 1)}
            disabled={i === 0}
            className="flex h-10 w-12 items-center justify-center rounded-lg border border-line text-[#cfcfd8] hover:bg-white/10 disabled:opacity-30"
            aria-label="Anterior"
          >
            <LuChevronLeft size={18} />
          </button>
          <button
            onClick={() => (last ? close() : setI(i + 1))}
            className="flex h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-accent text-[14px] font-semibold text-white hover:brightness-110"
          >
            {last ? '¡Empezar a editar!' : 'Siguiente'}
            {!last && <LuChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
