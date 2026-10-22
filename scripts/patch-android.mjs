// Personaliza el proyecto Android que genera `npx cap add android`:
// iconos de LineCut, pantalla de inicio, barras oscuras y modo de ventana.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const res = join(root, 'android/app/src/main/res');
if (!existsSync(res)) throw new Error('No existe android/: ejecuta antes `npx cap add android`');

const write = (rel, text) => {
  const p = join(res, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, text);
};

// --- iconos del launcher (clásico, redondo y adaptativo)
const iconsDir = join(root, 'scripts/icons');
for (const d of readdirSync(iconsDir).filter((n) => n.startsWith('mipmap-'))) {
  const dest = join(res, d);
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(dest)) if (/^ic_launcher.*\.(webp|png)$/.test(f)) rmSync(join(dest, f));
  cpSync(join(iconsDir, d), dest, { recursive: true });
}
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
write('mipmap-anydpi-v26/ic_launcher.xml', adaptive);
write('mipmap-anydpi-v26/ic_launcher_round.xml', adaptive);
write(
  'values/ic_launcher_background.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`,
);

// --- pantalla de inicio: fondo blanco con el logo centrado
for (const d of readdirSync(res).filter((n) => n.startsWith('drawable'))) {
  const p = join(res, d, 'splash.png');
  if (existsSync(p)) rmSync(p);
}
mkdirSync(join(res, 'drawable-nodpi'), { recursive: true });
cpSync(join(root, 'public/logo.png'), join(res, 'drawable-nodpi/splash_logo.png'));
write(
  'drawable/splash.xml',
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/white"/>
    <item android:width="200dp" android:height="200dp" android:gravity="center">
        <bitmap android:src="@drawable/splash_logo" android:gravity="fill"/>
    </item>
</layer-list>
`,
);

// --- tema: barras del sistema oscuras y sin dibujar bajo ellas
const stylesPath = join(res, 'values/styles.xml');
let styles = readFileSync(stylesPath, 'utf8');
const extra = `
        <item name="android:statusBarColor">#121214</item>
        <item name="android:navigationBarColor">#121214</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>`;
if (!styles.includes('windowOptOutEdgeToEdgeEnforcement')) {
  styles = styles.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, `$1${extra}`);
  writeFileSync(stylesPath, styles);
}
console.log('Proyecto Android personalizado para LineCut');
