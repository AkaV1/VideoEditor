"""Mezcla de audio del proyecto (numpy): volumen con keyframes, fundidos, balance, velocidad."""
from __future__ import annotations

import subprocess
import wave

import numpy as np

from .keyframes import eval_volume, any_kf
from .util import ffmpeg_path

SR = 44100
_cache: dict = {}


def decode_segment(path: str, start: float, length: float) -> np.ndarray:
    """Audio estéreo float32 (n, 2) a 44100 Hz del tramo [start, start+length) del archivo."""
    key = (path, round(start, 3), round(length, 3))
    a = _cache.get(key)
    if a is not None:
        return a
    cmd = [ffmpeg_path(), "-v", "error", "-ss", f"{max(0.0, start):.4f}", "-t", f"{max(0.05, length):.4f}", "-i", path,
           "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    raw = p.stdout
    a = np.frombuffer(raw[: len(raw) // 8 * 8], np.float32).reshape(-1, 2).copy()
    if len(_cache) > 24:
        _cache.clear()
    _cache[key] = a
    return a


def has_audio_clips(project: dict, media: dict) -> bool:
    for tr in project["tracks"]:
        if tr["muted"]:
            continue
        for c in tr["clips"]:
            if c["type"] in ("audio", "video") and media.get(c.get("mediaId"), {}).get("hasAudio", True):
                return True
    return False


def mix(project: dict, media: dict, paths: dict[str, str], duration: float | None = None) -> np.ndarray:
    """Mezcla todo el proyecto: devuelve (n, 2) float32 en [-1, 1]."""
    dur = duration if duration is not None else max([c["start"] + c["duration"] for t in project["tracks"] for c in t["clips"]] or [0.0])
    n = int(round(dur * SR)) + 1
    out = np.zeros((n, 2), np.float32)
    for tr in project["tracks"]:
        if tr["muted"] or tr["kind"] == "text":
            continue
        for c in tr["clips"]:
            if c["type"] not in ("audio", "video"):
                continue
            m = media.get(c.get("mediaId"))
            path = paths.get(c.get("mediaId"))
            if not m or not path or not m.get("hasAudio", True):
                continue
            speed = c["speed"]
            src = decode_segment(path, c["trimStart"], c["duration"] * speed + 0.05)
            if src.shape[0] == 0:
                continue
            m_out = int(round(c["duration"] * SR))
            if abs(speed - 1) > 1e-6:
                idx = np.arange(m_out) * speed
                idx = idx[idx < src.shape[0] - 1]
                i0 = idx.astype(np.int64)
                fr = (idx - i0)[:, None].astype(np.float32)
                seg = src[i0] * (1 - fr) + src[np.minimum(i0 + 1, src.shape[0] - 1)] * fr
            else:
                seg = src[:m_out]
            L = seg.shape[0]
            if L == 0:
                continue
            gain = np.full(L, c["audio"]["volume"] / 100.0, np.float32)
            if any_kf(c) and c.get("keyframes", {}).get("volume"):
                ts = np.linspace(0, L / SR, max(2, int(L / SR * 50)))
                vals = np.array([eval_volume(c, float(t)) for t in ts], np.float32) / 100.0
                gain = np.interp(np.arange(L) / SR, ts, vals).astype(np.float32)
            fi, fo = c["audio"]["fadeIn"], c["audio"]["fadeOut"]
            t_axis = np.arange(L) / SR
            if fi > 0:
                gain *= np.clip(t_axis / fi, 0, 1)
            if fo > 0:
                gain *= np.clip((c["duration"] - t_axis) / fo, 0, 1)
            seg = seg * gain[:, None]
            bal = c["audio"]["balance"] / 100.0
            if bal:
                seg = seg * np.array([1 - max(0, bal), 1 + min(0, bal)], np.float32)
            s0 = int(round(c["start"] * SR))
            e0 = min(n, s0 + L)
            if e0 > s0:
                out[s0:e0] += seg[: e0 - s0]
    return np.clip(out, -1.0, 1.0)


def write_wav(path: str, data: np.ndarray):
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
