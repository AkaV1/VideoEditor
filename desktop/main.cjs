// LineCut para escritorio (Linux): Electron carga la misma app web que el APK.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const SELFTEST = process.argv.includes('--selftest');
const ROOT = path.join(__dirname, 'app');

// Origen propio (app://linecut) para que IndexedDB, fuentes y APIs «seguras» funcionen como en la web.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: !SELFTEST,
    backgroundColor: '#121214',
    title: 'LineCut',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false, // la exportación graba en tiempo real: no debe frenarse en segundo plano
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://linecut/index.html');

  // Solo contenido propio: los enlaces externos se abren en el navegador.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.on('closed', () => (win = null));

  if (SELFTEST) runSelfTest(win);
}

// ------------------------------------------------------------ autodiagnóstico (CI)
function runSelfTest(w) {
  const fail = (why) => {
    console.log('SELFTEST_RESULT ' + JSON.stringify({ ok: false, why }));
    app.exit(1);
  };
  const timer = setTimeout(() => fail('tiempo agotado'), 60000);
  w.webContents.on('did-fail-load', (_e, code, desc) => fail(`no cargó (${code} ${desc})`));
  w.webContents.on('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 2500));
      const info = await w.webContents.executeJavaScript(`(async () => {
        const v = document.createElement('video');
        const mimes = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'];
        let fontsOk = 0;
        try { await document.fonts.ready; fontsOk = [...document.fonts].filter((f) => f.status === 'loaded').length; } catch {}
        let idb = false;
        try { idb = await new Promise((res) => { const r = indexedDB.open('selftest', 1); r.onsuccess = () => res(true); r.onerror = () => res(false); }); } catch {}
        return {
          app: !!window.__linecut,
          home: document.body.innerText.includes('Mis proyectos'),
          desktopBridge: !!window.linecutDesktop,
          play_h264: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
          play_vp9: v.canPlayType('video/webm; codecs="vp9"'),
          play_aac: v.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
          recorder: Object.fromEntries(mimes.map((m) => [m, typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)])),
          fontsLoaded: fontsOk,
          indexedDB: idb,
          ua: navigator.userAgent,
        };
      })()`);
      let ffmpeg = false;
      try {
        ffmpeg = !!getFfmpeg() && fs.existsSync(getFfmpeg());
      } catch {
        /* sin ffmpeg */
      }
      clearTimeout(timer);
      const ok = info.app && info.home && info.desktopBridge && info.indexedDB;
      console.log('SELFTEST_RESULT ' + JSON.stringify({ ok, ffmpeg, ...info }));
      app.exit(ok ? 0 : 1);
    } catch (e) {
      fail(String(e && e.message ? e.message : e));
    }
  });
}

// --------------------------------------------------------- conversión a MP4 (ffmpeg)
function getFfmpeg() {
  let p = null;
  try {
    p = require('ffmpeg-static');
  } catch {
    return null;
  }
  return p ? p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep) : null;
}

ipcMain.handle('convert-mp4', async (_event, data, opts = {}) => {
  const bin = getFfmpeg();
  if (!bin || !fs.existsSync(bin)) throw new Error('ffmpeg no disponible');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linecut-'));
  const input = path.join(dir, 'in.webm');
  const output = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(input, Buffer.from(data));
    const fps = Math.max(1, Math.min(120, Number(opts.fps) || 30));
    const args = [
      '-y', '-i', input,
      '-vf', `fps=${fps}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart',
      output,
    ];
    await new Promise((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg terminó con código ${code}: ${err.split('\n').slice(-4).join(' ')}`))));
    });
    return fs.readFileSync(output);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------- arranque
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('Prohibido', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => app.quit());
