const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linecutDesktop', {
  platform: process.platform,
  /** Convierte el video grabado (WebM) a MP4 H.264 con ffmpeg. Devuelve Uint8Array. */
  convertToMp4: (bytes, opts) => ipcRenderer.invoke('convert-mp4', bytes, opts),
});
