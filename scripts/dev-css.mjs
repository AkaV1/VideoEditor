// Compila el CSS con la API de Tailwind v4 (solo para pruebas locales sin @tailwindcss/cli).
import { compile } from 'tailwindcss';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const src = resolve(root, 'src');

const compiler = await compile(readFileSync(resolve(src, 'index.css'), 'utf8'), {
  base: src,
  loadStylesheet: async (id, base) => {
    const path = id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id);
    return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
  },
});

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|html)$/.test(f)) files.push(p);
  }
})(src);
files.push(resolve(root, 'index.html'));

const cands = new Set();
for (const f of files) for (const t of readFileSync(f, 'utf8').split(/[^\w\-:/.\[\]%#()&,'=>_!*+@$]+/)) if (t) cands.add(t);
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/app.css'), compiler.build([...cands]));
console.log('css ok, candidatos:', cands.size);
