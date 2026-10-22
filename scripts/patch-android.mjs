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
    <color name="ic_launcher_background">#A31021</color>
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
// --- plugin nativo «Gallery»: guarda el video exportado en la galería (MediaStore)
const appId = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8')).appId;
const javaDir = join(root, 'android/app/src/main/java', ...appId.split('.'));
mkdirSync(javaDir, { recursive: true });
writeFileSync(
  join(javaDir, 'GalleryPlugin.java'),
  `package ${appId};

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {
    private OutputStream out;
    private Uri uri;

    private void cleanup(boolean delete) {
        try { if (out != null) out.close(); } catch (Exception ignored) {}
        out = null;
        if (delete && uri != null) {
            try { getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
        }
        uri = null;
    }

    @PluginMethod
    public void begin(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Esta versión de Android requiere guardar con Compartir");
            return;
        }
        cleanup(true);
        try {
            String name = call.getString("name", "LineCut.mp4");
            String mime = call.getString("mime", "video/mp4");
            ContentResolver r = getContext().getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Video.Media.MIME_TYPE, mime);
            v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/LineCut");
            v.put(MediaStore.Video.Media.IS_PENDING, 1);
            uri = r.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("No se pudo crear el archivo");
            out = r.openOutputStream(uri);
            if (out == null) throw new Exception("No se pudo abrir el archivo");
            call.resolve();
        } catch (Exception e) {
            cleanup(true);
            call.reject(e.getMessage() == null ? "Error al crear el archivo" : e.getMessage());
        }
    }

    @PluginMethod
    public void append(PluginCall call) {
        try {
            if (out == null) throw new Exception("No hay archivo abierto");
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "Error al escribir" : e.getMessage());
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        try {
            if (out == null || uri == null) throw new Exception("No hay archivo abierto");
            out.flush();
            out.close();
            out = null;
            ContentValues v = new ContentValues();
            v.put(MediaStore.Video.Media.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, v, null, null);
            JSObject res = new JSObject();
            res.put("uri", uri.toString());
            uri = null;
            call.resolve(res);
        } catch (Exception e) {
            cleanup(true);
            call.reject(e.getMessage() == null ? "Error al finalizar" : e.getMessage());
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        cleanup(true);
        call.resolve();
    }
}
`,
);
writeFileSync(
  join(javaDir, 'MainActivity.java'),
  `package ${appId};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`,
);

console.log('Proyecto Android personalizado para LineCut');
