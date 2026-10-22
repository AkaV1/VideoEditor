// Empaqueta la app en dist/ (JS con esbuild; el CSS lo genera Tailwind aparte).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(resolve(root, 'public'), dist, { recursive: true });
writeFileSync(resolve(dist, 'index.html'), readFileSync(resolve(root, 'index.html')));

// Fuentes: se empaquetan desde @fontsource (subconjunto latino, cubre español).
// Si un paquete no está instalado, la app usa la fuente de respaldo.
{
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/lib/fonts.json'), 'utf8'));
  const fontsDir = resolve(dist, 'fonts');
  mkdirSync(fontsDir, { recursive: true });
  let css = '';
  let ok = 0;
  const missing = [];
  for (const f of manifest) {
    for (const w of f.weights) {
      const file = `${f.pkg}-latin-${w}-normal.woff2`;
      const src = resolve(root, 'node_modules/@fontsource', f.pkg, 'files', file);
      if (!existsSync(src)) {
        missing.push(file);
        continue;
      }
      cpSync(src, resolve(fontsDir, file));
      css += `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${w};font-display:swap;src:url("fonts/${file}") format("woff2");}\n`;
      ok++;
    }
  }
  writeFileSync(resolve(dist, 'fonts.css'), css);
  console.log(`Fuentes empaquetadas: ${ok}` + (missing.length ? ` (faltan ${missing.length}: ${missing.join(', ')})` : ''));
}

// Si @capacitor/core no está instalado (pruebas locales), usa un sustituto.
const capStub = {
  name: 'capacitor-stub',
  setup(b) {
    b.onResolve({ filter: /^@capacitor\/core$/ }, async (args) => {
      if (args.pluginData === 'stub-check') return null;
      const r = await b.resolve(args.path, {
        resolveDir: args.resolveDir,
        importer: args.importer,
        kind: args.kind,
        pluginData: 'stub-check',
      });
      if (r.errors.length === 0) return r;
      return { path: resolve(root, 'scripts/stubs/capacitor-core.js') };
    });
  },
};

await build({
  plugins: [capStub],
  entryPoints: [resolve(root, 'src/main.jsx')],
  bundle: true,
  outfile: resolve(dist, 'app.js'),
  format: 'iife',
  minify: process.env.NO_MINIFY ? false : true,
  target: ['chrome90'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
