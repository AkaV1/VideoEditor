#!/usr/bin/env bash
# Construye LineCut-x86_64.AppImage (PyInstaller + appimagetool). Pensado para Ubuntu 24.04.
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:-$PWD/out}"
mkdir -p "$OUT"
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip >/dev/null
pip install -r requirements.txt pyinstaller

rm -rf build dist AppDir
pyinstaller --noconfirm --name linecut --console \
  --add-data "linecut/assets:linecut/assets" \
  --collect-all imageio_ffmpeg \
  --exclude-module PySide6.QtWebEngineCore --exclude-module PySide6.QtWebEngineWidgets \
  --exclude-module PySide6.Qt3DCore --exclude-module PySide6.QtQuick --exclude-module PySide6.QtQml \
  run.py

mkdir -p AppDir/usr/lib/linecut AppDir/usr/extra
cp -r dist/linecut/. AppDir/usr/lib/linecut/

# Bibliotecas xcb que Qt necesita y que muchas distribuciones no traen instaladas
for lib in libxcb-cursor.so.0 libxcb-icccm.so.4 libxcb-image.so.0 libxcb-keysyms.so.1 libxcb-render-util.so.0 \
           libxcb-shape.so.0 libxcb-xkb.so.1 libxcb-xinerama.so.0 libxcb-randr.so.0 libxkbcommon-x11.so.0 \
           libxcb-util.so.1 libxcb-sync.so.1 libxcb-xfixes.so.0; do
  p=$(ldconfig -p | awk -v l="$lib" '$1==l {print $NF; exit}')
  [ -n "$p" ] && cp -L "$p" AppDir/usr/extra/ || echo "aviso: no se encontró $lib"
done

cp linecut/assets/logo.png AppDir/linecut.png
cp linecut/assets/logo.png AppDir/.DirIcon
mkdir -p AppDir/usr/share/icons/hicolor/512x512/apps
cp linecut/assets/logo.png AppDir/usr/share/icons/hicolor/512x512/apps/linecut.png
cat > AppDir/linecut.desktop <<'DESK'
[Desktop Entry]
Type=Application
Name=LineCut
Comment=Editor de video
Exec=linecut
Icon=linecut
Categories=AudioVideo;Video;AudioVideoEditing;
Terminal=false
DESK
cat > AppDir/AppRun <<'RUN'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
export LD_LIBRARY_PATH="$HERE/usr/extra:$HERE/usr/lib/linecut/_internal:${LD_LIBRARY_PATH:-}"
exec "$HERE/usr/lib/linecut/linecut" "$@"
RUN
chmod +x AppDir/AppRun

if [ ! -x appimagetool ]; then
  curl -fsSL -o appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x appimagetool
fi
ARCH=x86_64 ./appimagetool --appimage-extract-and-run AppDir "$OUT/LineCut-x86_64.AppImage"
ls -lh "$OUT"
