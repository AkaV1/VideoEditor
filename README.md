# LineCut

Editor de video multipista para Android (y navegador), hecho con React + Tailwind CSS +
HTML5 Canvas + Web Audio, empaquetado como app con Capacitor.

## Funciones
- **Medios**: importa video, audio e imágenes. Toca para añadir en el cabezal o arrastra a una pista.
- **Texto** con plantillas y control de fuente, borde, sombra, fondo y espaciado.
- **Stickers**, **efectos** de video (glitch, RGB, desenfoque, viñeta…), **filtros** de color y **transiciones**.
- **Audio**: música y efectos de sonido generados en el dispositivo (no requieren descarga).
- **Línea de tiempo multipista**: capas, recorte arrastrando bordes, cuchilla, dividir, imán, marcadores,
  silenciar/ocultar/bloquear pista, miniaturas y forma de onda.
- **Inspector**: transformar (escala, posición, rotación, opacidad, espejo, fusión), recorte, audio
  (volumen, fundidos, balance, reducción de ruido), velocidad (0.1x–100x, reversa) y color.
- **Deshacer / rehacer** ilimitado (100 pasos), atajos de teclado (Espacio, V, B, S, M, Supr, Ctrl+Z).
- **Exportar** MP4/WebM de 480p/720p/1080p grabando en tiempo real.

## Desarrollo
```bash
npm install
npm run build        # genera dist/
npx cap add android  # una vez; el proyecto android/ se genera, no se versiona
node scripts/patch-android.mjs && npx cap sync android
```
El APK se compila automáticamente en GitHub Actions (`.github/workflows/build-apk.yml`) y se publica
en *Releases*.
