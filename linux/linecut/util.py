"""Utilidades comunes: ids, rutas de datos y localización de ffmpeg."""
from __future__ import annotations

import os
import random
import shutil
import string
import time
from pathlib import Path

_counter = 0


def uid(prefix: str = "id") -> str:
    global _counter
    _counter += 1
    rnd = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(3))
    return f"{prefix}_{int(time.time() * 1000):x}{_counter:x}{rnd}"


def clamp(v: float, a: float, b: float) -> float:
    return min(b, max(a, v))


def data_dir() -> Path:
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    p = Path(os.environ.get("LINECUT_HOME") or Path(base) / "LineCut")
    p.mkdir(parents=True, exist_ok=True)
    return p


def assets_dir() -> Path:
    return Path(__file__).resolve().parent / "assets"


_ffmpeg: str | None = None


def ffmpeg_path() -> str:
    """ffmpeg: variable LINECUT_FFMPEG, el de imageio-ffmpeg (incluido en la app) o el del sistema."""
    global _ffmpeg
    if _ffmpeg:
        return _ffmpeg
    env = os.environ.get("LINECUT_FFMPEG")
    if env and os.path.exists(env):
        _ffmpeg = env
        return _ffmpeg
    try:
        import imageio_ffmpeg

        p = imageio_ffmpeg.get_ffmpeg_exe()
        if p and os.path.exists(p):
            _ffmpeg = p
            return _ffmpeg
    except Exception:
        pass
    p = shutil.which("ffmpeg")
    if not p:
        raise RuntimeError("No se encontró ffmpeg")
    _ffmpeg = p
    return _ffmpeg


def fmt_time(t: float, fps: int = 30) -> str:
    t = max(0.0, t)
    m = int(t // 60)
    s = int(t % 60)
    f = int(round((t - int(t)) * fps)) % max(1, fps)
    return f"{m:02d}:{s:02d}:{f:02d}"


def short_time(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 60)}:{int(t % 60):02d}"
