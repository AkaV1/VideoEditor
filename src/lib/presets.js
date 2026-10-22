import webFonts from './fonts.json';
// Catálogos de la app: proporciones, mezclas, fuentes, plantillas de texto,
// stickers, efectos, transiciones y filtros.

export const RATIOS = {
  '16:9': [1280, 720],
  '9:16': [720, 1280],
  '1:1': [720, 720],
  '4:3': [960, 720],
};

export const RESOLUTIONS = [480, 720, 1080];
export const FPS_OPTIONS = [24, 30, 60];

export const BLEND_MODES = [
  { id: 'normal', label: 'Normal', op: 'source-over' },
  { id: 'multiply', label: 'Multiplicar', op: 'multiply' },
  { id: 'screen', label: 'Trama', op: 'screen' },
  { id: 'overlay', label: 'Superponer', op: 'overlay' },
  { id: 'darken', label: 'Oscurecer', op: 'darken' },
  { id: 'lighten', label: 'Aclarar', op: 'lighten' },
  { id: 'color-dodge', label: 'Subexponer color', op: 'color-dodge' },
  { id: 'color-burn', label: 'Sobreexponer color', op: 'color-burn' },
  { id: 'hard-light', label: 'Luz intensa', op: 'hard-light' },
  { id: 'soft-light', label: 'Luz suave', op: 'soft-light' },
  { id: 'difference', label: 'Diferencia', op: 'difference' },
  { id: 'exclusion', label: 'Exclusión', op: 'exclusion' },
];
export const blendOp = (id) => BLEND_MODES.find((b) => b.id === id)?.op ?? 'source-over';

const WEB_FONTS = webFonts.map((f) => ({
  id: f.id,
  label: f.family,
  group: f.group,
  css: `"${f.family}", ${f.fallback}`,
  web: true,
}));

export const FONTS = [
  { id: 'sans', label: 'Sans', group: 'Sistema', css: 'Inter, system-ui, "Segoe UI", Roboto, Arial, sans-serif' },
  { id: 'impact', label: 'Impact', group: 'Sistema', css: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { id: 'black', label: 'Black', group: 'Sistema', css: '"Arial Black", Gadget, sans-serif' },
  { id: 'rounded', label: 'Redondeada', group: 'Sistema', css: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: 'serif', label: 'Serif', group: 'Sistema', css: 'Georgia, "Times New Roman", serif' },
  { id: 'mono', label: 'Mono', group: 'Sistema', css: '"Courier New", ui-monospace, monospace' },
  { id: 'cursive', label: 'Cursiva', group: 'Sistema', css: '"Comic Sans MS", "Brush Script MT", cursive' },
  ...WEB_FONTS,
];
export const FONT_GROUPS = [...new Set(FONTS.map((f) => f.group))];
export const fontCss = (id) => FONTS.find((f) => f.id === id)?.css ?? FONTS[0].css;

export const DEFAULT_TEXT_STYLE = {
  font: 'sans',
  size: 72,
  bold: true,
  italic: false,
  align: 'center',
  color: '#ffffff',
  strokeWidth: 0,
  strokeColor: '#000000',
  shadow: false,
  shadowColor: '#000000',
  shadowBlur: 8,
  shadowX: 3,
  shadowY: 3,
  bgEnabled: false,
  bgColor: '#000000',
  bgOpacity: 60,
  letterSpacing: 0,
  lineSpacing: 1.2,
};

export const TEXT_TEMPLATES = [
  { id: 'basic', label: 'Básico', text: 'Texto', style: {} },
  { id: 'title', label: 'Título', text: 'TÍTULO', style: { font: 'anton', size: 120, letterSpacing: 4 } },
  { id: 'sub', label: 'Subtítulo', text: 'Subtítulo', style: { size: 48, bold: false, shadow: true, shadowBlur: 6 } },
  {
    id: 'neon',
    label: 'Neón',
    text: 'NEÓN',
    style: { font: 'rounded', size: 100, color: '#00f2fe', shadow: true, shadowColor: '#00f2fe', shadowBlur: 24, shadowX: 0, shadowY: 0, strokeWidth: 2, strokeColor: '#ffffff' },
  },
  {
    id: 'pop',
    label: 'Pop',
    text: 'POP!',
    style: { font: 'bangers', size: 130, color: '#ffe600', strokeWidth: 10, strokeColor: '#000000' },
  },
  {
    id: 'box',
    label: 'Caja',
    text: 'Caja',
    style: { size: 64, color: '#ffffff', bgEnabled: true, bgColor: '#e01e26', bgOpacity: 100 },
  },
  {
    id: 'elegant',
    label: 'Elegante',
    text: 'Elegante',
    style: { font: 'serif', size: 84, bold: false, italic: true, letterSpacing: 2 },
  },
  {
    id: 'retro',
    label: 'Retro',
    text: 'RETRO',
    style: { font: 'pressstart', size: 64, color: '#ff4fa3', shadow: true, shadowColor: '#00d2c8', shadowBlur: 0, shadowX: 8, shadowY: 8 },
  },
  {
    id: 'typewriter',
    label: 'Máquina',
    text: 'typewriter',
    style: { font: 'mono', size: 60, bold: false, bgEnabled: true, bgColor: '#000000', bgOpacity: 70 },
  },
  {
    id: 'outline',
    label: 'Contorno',
    text: 'CONTORNO',
    style: { font: 'black', size: 100, color: '#00000000', strokeWidth: 5, strokeColor: '#ffffff' },
  },
  {
    id: 'gold',
    label: 'Dorado',
    text: 'Dorado',
    style: { font: 'serif', size: 96, color: '#ffd45e', shadow: true, shadowColor: '#7a4a00', shadowBlur: 4, shadowX: 3, shadowY: 4, strokeWidth: 2, strokeColor: '#7a4a00' },
  },
  {
    id: 'comic',
    label: 'Cómic',
    text: '¡BAM!',
    style: { font: 'cursive', size: 120, color: '#ff3b30', strokeWidth: 8, strokeColor: '#ffffff', shadow: true, shadowColor: '#000000', shadowBlur: 0, shadowX: 6, shadowY: 6 },
  },
];

export const STICKER_CATEGORIES = [
  { id: 'faces', label: 'Caras', items: ['😀', '😂', '🥹', '😍', '😎', '🤩', '🥳', '😭', '😡', '🤔', '😴', '🤯', '🥶', '🤪', '😇', '😈'] },
  { id: 'hands', label: 'Gestos', items: ['👍', '👎', '👏', '🙌', '🙏', '✌️', '🤞', '🤘', '👌', '💪', '👋', '🫶', '☝️', '👀', '🫡', '🤝'] },
  { id: 'symbols', label: 'Símbolos', items: ['❤️', '🔥', '⭐', '✨', '💯', '💥', '⚡', '❗', '❓', '✅', '❌', '➡️', '🔔', '🎯', '💫', '🚀'] },
  { id: 'fun', label: 'Fiesta', items: ['🎉', '🎊', '🎈', '🎁', '🎂', '🍾', '🎵', '🎶', '🎤', '🎬', '🏆', '👑', '💎', '🌈', '☀️', '🌙'] },
  { id: 'animals', label: 'Animales', items: ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐧', '🐢', '🦋', '🐝', '🐙', '🦖', '🐳', '🐥'] },
  { id: 'food', label: 'Comida', items: ['🍕', '🍔', '🍟', '🌮', '🍣', '🍩', '🍦', '☕', '🍺', '🍓', '🍉', '🥑', '🍌', '🍿', '🍫', '🥤'] },
];

// Filtros de color rápidos (equivalentes a LUTs, aplicados con filtros de canvas)
export const LUTS = [
  { id: 'none', label: 'Original', css: '', swatch: 'linear-gradient(135deg,#6b7280,#d1d5db)' },
  { id: 'vivid', label: 'Vívido', css: 'saturate(1.5) contrast(1.1)', swatch: 'linear-gradient(135deg,#ff3b6b,#ffb800)' },
  { id: 'warm', label: 'Cálido', css: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg)', swatch: 'linear-gradient(135deg,#ff9a3c,#ffd89b)' },
  { id: 'cool', label: 'Frío', css: 'saturate(1.1) hue-rotate(12deg) brightness(1.02)', swatch: 'linear-gradient(135deg,#3a7bd5,#7de3ff)' },
  { id: 'bw', label: 'Blanco y negro', css: 'grayscale(1) contrast(1.15)', swatch: 'linear-gradient(135deg,#111,#ddd)' },
  { id: 'vintage', label: 'Vintage', css: 'sepia(0.5) contrast(0.95) saturate(0.85) brightness(1.05)', swatch: 'linear-gradient(135deg,#8a6d3b,#e8d5a2)' },
  { id: 'cinema', label: 'Cine', css: 'contrast(1.2) saturate(0.85) brightness(0.95) hue-rotate(-6deg)', swatch: 'linear-gradient(135deg,#0f3b4a,#d9863a)' },
  { id: 'drama', label: 'Dramático', css: 'contrast(1.4) saturate(0.7) brightness(0.9)', swatch: 'linear-gradient(135deg,#1a1a1a,#8a8a8a)' },
  { id: 'fade', label: 'Desvanecido', css: 'contrast(0.85) brightness(1.1) saturate(0.8)', swatch: 'linear-gradient(135deg,#b8b8c8,#f0e8f0)' },
  { id: 'pop', label: 'Pop', css: 'saturate(1.8) contrast(1.05) hue-rotate(5deg)', swatch: 'linear-gradient(135deg,#00e1ff,#ff2bd6)' },
];
export const lutCss = (id) => LUTS.find((l) => l.id === id)?.css ?? '';

export const EFFECTS = [
  { id: 'blur', label: 'Desenfoque', swatch: 'linear-gradient(135deg,#7a8aa0,#cfd8e6)' },
  { id: 'glitch', label: 'Glitch', swatch: 'linear-gradient(135deg,#00f2fe,#ff2bd6)' },
  { id: 'rgbsplit', label: 'RGB', swatch: 'linear-gradient(135deg,#ff0000,#00ff00,#0000ff)' },
  { id: 'shake', label: 'Temblor', swatch: 'linear-gradient(135deg,#444,#999)' },
  { id: 'pulse', label: 'Pulso', swatch: 'linear-gradient(135deg,#ff6a00,#ee0979)' },
  { id: 'flash', label: 'Destello', swatch: 'linear-gradient(135deg,#fff,#ffe9a8)' },
  { id: 'vignette', label: 'Viñeta', swatch: 'radial-gradient(circle,#777,#000)' },
  { id: 'grain', label: 'Grano', swatch: 'linear-gradient(135deg,#555,#aaa)' },
  { id: 'cinebars', label: 'Barras cine', swatch: 'linear-gradient(#000 20%,#4a5a6a 20% 80%,#000 80%)' },
  { id: 'mirror', label: 'Espejo', swatch: 'linear-gradient(90deg,#4a90e2 50%,#e24a90 50%)' },
  { id: 'pixel', label: 'Pixelar', swatch: 'linear-gradient(135deg,#2ecc71,#f1c40f)' },
  { id: 'glow', label: 'Resplandor', swatch: 'radial-gradient(circle,#fff,#ffd36b 60%,#8a5a00)' },
  { id: 'hue', label: 'Arcoíris', swatch: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' },
  { id: 'invert', label: 'Invertir', swatch: 'linear-gradient(135deg,#111,#eee)' },
];
export const effectLabel = (id) => EFFECTS.find((e) => e.id === id)?.label ?? id;

export const TRANSITIONS = [
  { id: 'none', label: 'Ninguna' },
  { id: 'fade', label: 'Fundido' },
  { id: 'zoomIn', label: 'Zoom +' },
  { id: 'zoomOut', label: 'Zoom −' },
  { id: 'slideLeft', label: 'Deslizar ←' },
  { id: 'slideRight', label: 'Deslizar →' },
  { id: 'slideUp', label: 'Deslizar ↑' },
  { id: 'wipeRight', label: 'Cortina →' },
  { id: 'wipeDown', label: 'Cortina ↓' },
  { id: 'spin', label: 'Giro' },
];
export const transitionLabel = (id) => TRANSITIONS.find((t) => t.id === id)?.label ?? id;

export const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  flipH: false,
  flipV: false,
  blend: 'normal',
};
export const DEFAULT_CROP = { top: 0, bottom: 0, left: 0, right: 0 };
export const DEFAULT_COLOR = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  shadows: 0,
  highlights: 0,
  temperature: 0,
  lut: 'none',
};
export const DEFAULT_AUDIO = {
  volume: 100,
  fadeIn: 0,
  fadeOut: 0,
  balance: 0,
  denoise: 0,
  pitch: 0,
};
