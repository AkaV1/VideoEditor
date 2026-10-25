#!/usr/bin/env bash
# Construye LineCut para Windows (PyInstaller + Inno Setup). Se ejecuta con Git Bash en windows-latest.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt pyinstaller
python - <<'PY'
from PIL import Image
im = Image.open("linecut/assets/logo.png").convert("RGBA")
im.save("linecut.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
PY
rm -rf build dist
pyinstaller --noconfirm --name LineCut --windowed --icon linecut.ico \
  --add-data "linecut/assets;linecut/assets" \
  --collect-all imageio_ffmpeg \
  --exclude-module PySide6.QtWebEngineCore --exclude-module PySide6.QtWebEngineWidgets \
  --exclude-module PySide6.Qt3DCore --exclude-module PySide6.QtQuick --exclude-module PySide6.QtQml \
  run.py
