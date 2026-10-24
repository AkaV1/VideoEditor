"""Medios: información (ffmpeg), miniaturas, forma de onda y decodificación de fotogramas en streaming."""
from __future__ import annotations

import math
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

from .util import ffmpeg_path, uid

EXT = {
    "video": {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".3gp", ".avi", ".ogv", ".mts", ".ts", ".flv", ".wmv"},
    "audio": {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".amr", ".wma"},
    "image": {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff"},
}
NOWIN = {}


def kind_of(path: str | Path) -> str | None:
    ext = Path(path).suffix.lower()
    for k, s in EXT.items():
        if ext in s:
            return k
    return None


def _run_info(path: str) -> str:
    p = subprocess.run([ffmpeg_path(), "-hide_banner", "-i", str(path)], stderr=subprocess.PIPE,
                       stdout=subprocess.DEVNULL, stdin=subprocess.DEVNULL, **NOWIN)
    return p.stderr.decode("utf-8", "replace")


def probe(path: str) -> dict:
    """Devuelve {kind, duration, width, height, fps, hasAudio}."""
    kind = kind_of(path)
    if kind is None:
        raise ValueError(f"Formato no compatible: {Path(path).name}")
    if kind == "image":
        with Image.open(path) as im:
            return {"kind": "image", "duration": 5.0, "width": im.width, "height": im.height, "fps": 0, "hasAudio": False}
    txt = _run_info(path)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", txt)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    w = h = 0
    fps = 0.0
    has_video = False
    for line in txt.splitlines():
        if "Video:" in line and not has_video and "attached pic" not in line:
            has_video = True
            mm = re.search(r"(\d{2,5})x(\d{2,5})", line.split("Video:")[1])
            if mm:
                w, h = int(mm.group(1)), int(mm.group(2))
            mf = re.search(r"([\d.]+)\s*fps", line)
            if mf:
                fps = float(mf.group(1))
    rot = re.search(r"rotation of (-?[\d.]+) degrees", txt)
    if rot and int(abs(float(rot.group(1))) + 0.5) % 180 == 90:
        w, h = h, w
    has_audio = "Audio:" in txt
    if kind == "video" and not has_video:
        kind = "audio"
    if dur <= 0:
        raise ValueError("No se pudo leer la duración del archivo")
    return {"kind": kind, "duration": dur, "width": w, "height": h, "fps": fps, "hasAudio": has_audio}


def make_media_item(path: str, info: dict, file_rel: str) -> dict:
    return {"id": uid("med"), "name": Path(path).stem, "kind": info["kind"], "file": file_rel,
            "duration": info["duration"], "width": info["width"], "height": info["height"],
            "fps": info.get("fps", 0), "hasAudio": info.get("hasAudio", False), "peaks": None}


def thumbnails(path: str, duration: float, aspect: float, count: int = 20, height: int = 56) -> list[np.ndarray]:
    """Miniaturas uniformes a lo largo del video (arrays RGB)."""
    w = max(16, int(round(height * (aspect or 16 / 9) / 2) * 2))
    h = height
    count = max(1, min(count, max(1, int(duration))))
    rate = count / max(duration, 0.1)
    cmd = [ffmpeg_path(), "-v", "error", "-i", path, "-an", "-vf", f"fps={rate:.5f},scale={w}:{h}",
           "-frames:v", str(count), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, **NOWIN)
    data = p.stdout
    fs = w * h * 3
    return [np.frombuffer(data[i * fs:(i + 1) * fs], np.uint8).reshape(h, w, 3).copy() for i in range(len(data) // fs)]


def waveform(path: str, per_sec: int = 40) -> list[int] | None:
    """Picos de amplitud (0-255) por 1/per_sec segundos."""
    cmd = [ffmpeg_path(), "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, **NOWIN)
    a = np.frombuffer(p.stdout[: len(p.stdout) // 2 * 2], np.int16)
    if a.size == 0:
        return None
    step = 8000 // per_sec
    n = a.size // step
    if n == 0:
        return None
    peaks = np.abs(a[: n * step].reshape(n, step).astype(np.int32)).max(axis=1)
    m = max(1, int(peaks.max()))
    gain = min(4.0, 32767.0 / m)
    return np.minimum(255, (peaks * gain / 128.0)).astype(np.uint8).tolist()


def fit_size(sw: float, sh: float, W: int, H: int) -> tuple[int, int]:
    f = min(W / sw, H / sh)
    return max(2, int(round(sw * f / 2) * 2)), max(2, int(round(sh * f / 2) * 2))


class ClipStream:
    """Lee fotogramas de un clip de video con un ffmpeg en segundo plano (acceso secuencial rápido)."""

    def __init__(self, path: str, clip: dict, fw: int, fh: int, fps: float):
        self.path, self.clip, self.fw, self.fh, self.fps = path, clip, fw, fh, fps
        self.proc: subprocess.Popen | None = None
        self.next_idx = 0
        self.start_local = 0.0
        self.last: np.ndarray | None = None
        self.eof = False
        self.size = fw * fh * 3

    def _start(self, local: float):
        self.close()
        c = self.clip
        speed = c["speed"]
        ss = c["trimStart"] + local * speed
        tt = max(0.05, (c["duration"] - local) * speed + 0.5)
        cr = c["crop"]
        l, r, t, b = (cr["left"] / 100, cr["right"] / 100, cr["top"] / 100, cr["bottom"] / 100)
        vf = []
        if abs(speed - 1) > 1e-6:
            vf.append(f"setpts=PTS/{speed:.6f}")
        vf.append(f"fps={self.fps:.4f}")
        if l or r or t or b:
            vf.append(f"crop=iw*{1 - l - r:.5f}:ih*{1 - t - b:.5f}:iw*{l:.5f}:ih*{t:.5f}")
        vf.append(f"scale={self.fw}:{self.fh}:flags=bilinear")
        cmd = [ffmpeg_path(), "-v", "error", "-ss", f"{ss:.4f}", "-t", f"{tt:.4f}", "-i", self.path, "-an",
               "-vf", ",".join(vf), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                     stdin=subprocess.DEVNULL, bufsize=self.size * 2, **NOWIN)
        self.start_local = local
        self.next_idx = 0
        self.eof = False

    def _read_frame(self) -> np.ndarray | None:
        if not self.proc or not self.proc.stdout:
            return None
        buf = self.proc.stdout.read(self.size)
        if not buf or len(buf) < self.size:
            self.eof = True
            return None
        self.next_idx += 1
        return np.frombuffer(buf, np.uint8).reshape(self.fh, self.fw, 3)

    def frame_at(self, local: float) -> np.ndarray | None:
        idx = int(round((local - self.start_local) * self.fps))
        if self.proc is None or idx < self.next_idx - 1 or idx - self.next_idx > self.fps * 3 or (self.eof and idx < self.next_idx - 1):
            self._start(max(0.0, local))
            idx = 0
        while self.next_idx <= idx and not self.eof:
            f = self._read_frame()
            if f is None:
                break
            self.last = f
        return self.last

    def close(self):
        if self.proc:
            try:
                self.proc.kill()
                self.proc.wait(timeout=2)
            except Exception:
                pass
            for s in (self.proc.stdout,):
                try:
                    s and s.close()
                except Exception:
                    pass
        self.proc = None


class FrameProvider:
    """Entrega el fotograma de cada clip (ya recortado y escalado al tamaño natural en el lienzo)."""

    def __init__(self, media_paths: dict[str, str], media: dict[str, dict], fps: float):
        self.paths, self.media, self.fps = media_paths, media, fps
        self.streams: dict[str, tuple[tuple, ClipStream]] = {}
        self.images: dict[tuple, np.ndarray] = {}

    def natural(self, clip: dict, W: int, H: int):
        m = self.media.get(clip.get("mediaId"))
        if not m or not m.get("width"):
            return None
        cr = clip["crop"]
        sw = m["width"] * (1 - (cr["left"] + cr["right"]) / 100)
        sh = m["height"] * (1 - (cr["top"] + cr["bottom"]) / 100)
        if sw <= 1 or sh <= 1:
            return None
        return fit_size(sw, sh, W, H)

    def frame(self, clip: dict, local: float, W: int, H: int) -> np.ndarray | None:
        nat = self.natural(clip, W, H)
        if nat is None:
            return None
        path = self.paths.get(clip["mediaId"])
        if not path:
            return None
        fw, fh = nat
        cr = clip["crop"]
        if clip["type"] == "image":
            key = (path, fw, fh, cr["left"], cr["right"], cr["top"], cr["bottom"])
            img = self.images.get(key)
            if img is None:
                with Image.open(path) as im:
                    im = im.convert("RGBA")
                    w, h = im.size
                    box = (int(w * cr["left"] / 100), int(h * cr["top"] / 100), int(w * (1 - cr["right"] / 100)),
                           int(h * (1 - cr["bottom"] / 100)))
                    im = im.crop(box).resize((fw, fh), Image.BILINEAR)
                    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
                    bg.alpha_composite(im)
                    img = np.asarray(bg.convert("RGB")).copy()
                if len(self.images) > 12:
                    self.images.clear()
                self.images[key] = img
            return img
        sig = (path, fw, fh, clip["trimStart"], clip["speed"], cr["left"], cr["right"], cr["top"], cr["bottom"],
               round(clip["duration"], 4))
        ent = self.streams.get(clip["id"])
        if ent is None or ent[0] != sig:
            if ent:
                ent[1].close()
            ent = (sig, ClipStream(path, clip, fw, fh, self.fps))
            self.streams[clip["id"]] = ent
        else:
            ent[1].clip = clip
        return ent[1].frame_at(local)

    def release_unused(self, active_ids: set[str]):
        for cid in list(self.streams):
            if cid not in active_ids:
                self.streams.pop(cid)[1].close()

    def close(self):
        for _, s in self.streams.values():
            s.close()
        self.streams.clear()
