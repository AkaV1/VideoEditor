"""Efectos de audio (18): se aplican a cada clip con filtros de ffmpeg y numpy (offline, mismos ids que la versión web)."""
from __future__ import annotations

import hashlib
import json
import subprocess

import numpy as np

from .params import P, wd

SR = 44100
AUDIO_FX: list = []
BY: dict = {}


def get_audiofx(id):
    return BY.get(id)


MIX = wd(P["amount"], 100, label="Mezcla")


def _st(df, mn=-12, mx=12):
    return {"id": "semi", "label": "Semitonos", "min": mn, "max": mx, "def": df, "unit": "", "step": 1}


def _reg(id, label, params, steps, tags=()):
    it = {"kind": "audio", "id": id, "label": label, "params": params, "steps": steps, "tags": list(tags)}
    AUDIO_FX.append(it)
    BY[id] = it


def _pitch(semi):
    r = 2.0 ** (semi / 12.0)
    if abs(semi) < 0.01:
        return []
    return [("ff", f"asetrate={SR * r:.3f},aresample={SR},atempo={1 / r:.6f}")]


def _db(x):
    return 10.0 ** (x / 20.0)


def _shape(k):
    return ("np", lambda a: ((1 + k) * a) / (1 + k * np.abs(a)))


def _impulse(sec, decay):
    n = int(SR * sec)
    rng = np.random.default_rng(12345)
    env = (1 - np.arange(n) / n) ** decay
    return (rng.uniform(-1, 1, (n, 2)) * env[:, None]).astype(np.float32)


def _reverb(size):
    def fn(a):
        ir = _impulse(size, 2.5)
        n = a.shape[0] + ir.shape[0]
        nf = 1 << (n - 1).bit_length()
        out = np.empty_like(a)
        for c in range(2):
            y = np.fft.irfft(np.fft.rfft(a[:, c], nf) * np.fft.rfft(ir[:, c], nf), nf)[: a.shape[0]]
            out[:, c] = y
        # normaliza la cola para que el nivel sea parecido al original
        pk = max(1e-6, float(np.abs(out).max()))
        po = max(1e-6, float(np.abs(a).max()))
        return out * min(1.0, 0.6 * po / pk) * 1.0
    return ("np", fn)


_reg("reverb", "Reverberación", [wd(MIX, 40), {"id": "size", "label": "Tamaño de sala", "min": 0.3, "max": 4, "def": 1.8, "unit": " s", "step": 0.1}],
     lambda p: [("wet", [_reverb(float(p["size"]))], float(p["amount"]) / 100)], ["sala", "eco", "espacio"])
_reg("echo", "Eco", [wd(MIX, 50), {"id": "time", "label": "Tiempo", "min": 0.05, "max": 1, "def": 0.3, "unit": " s", "step": 0.01},
                     {"id": "fb", "label": "Repeticiones", "min": 0, "max": 90, "def": 45, "unit": "%"}],
     lambda p: [("ff", f"aecho=1:{0.2 + 0.7 * float(p['amount']) / 100:.3f}:{float(p['time']) * 1000:.0f}:{max(0.05, float(p['fb']) / 100):.3f}")])
_reg("pitchup", "Tono agudo", [_st(5, 1, 12)], lambda p: _pitch(float(p["semi"])), ["voz aguda", "ardilla"])
_reg("pitchdown", "Tono grave", [_st(-5, -12, -1)], lambda p: _pitch(float(p["semi"])), ["voz grave"])
_reg("chipmunk", "Voz aguda", [], lambda p: _pitch(7) + [("ff", "treble=g=5:f=3500")], ["ardilla"])
_reg("deepvoice", "Voz grave", [], lambda p: _pitch(-6) + [("ff", "bass=g=7:f=200")], ["monstruo"])
_reg("robot", "Voz de robot", [wd(MIX, 100), {"id": "freq", "label": "Frecuencia", "min": 30, "max": 400, "def": 90, "unit": " Hz"}],
     lambda p: [("wet", [("ff", f"tremolo=f={float(p['freq']):.1f}:d=0.95,aecho=0.8:0.5:12:0.5")], float(p["amount"]) / 100)], ["dalek", "ciborg"])
_reg("distortion", "Distorsión", [wd(MIX, 70), {"id": "drive", "label": "Saturación", "min": 1, "max": 100, "def": 40, "unit": ""}],
     lambda p: [("wet", [("np", lambda a, k=float(p["drive"]): np.tanh(a * (1 + k * 0.15)) * 0.8)], float(p["amount"]) / 100)])
_reg("phone", "Teléfono", [], lambda p: [("ff", "highpass=f=400,lowpass=f=3200"), _shape(8)], ["llamada"])
_reg("radio", "Radio antigua", [], lambda p: [("ff", "highpass=f=250,lowpass=f=4500,equalizer=f=1800:width_type=q:w=1.2:g=6"), _shape(4)])
_reg("megaphone", "Megáfono", [], lambda p: [("ff", "highpass=f=500,lowpass=f=3800"), _shape(14)])
_reg("underwater", "Bajo el agua", [], lambda p: [("ff", "lowpass=f=700:width_type=q:w=2,vibrato=f=3:d=0.25")])
_reg("tremolo", "Trémolo", [{"id": "rate", "label": "Velocidad", "min": 1, "max": 20, "def": 6, "unit": " Hz", "step": 0.5}, wd(P["amount"], 70)],
     lambda p: [("ff", f"tremolo=f={float(p['rate']):.2f}:d={max(0.01, min(1.0, float(p['amount']) / 100)):.3f}")])
_reg("flanger", "Flanger / coro", [wd(MIX, 60), {"id": "rate", "label": "Velocidad", "min": 0.1, "max": 5, "def": 0.6, "unit": " Hz", "step": 0.1}],
     lambda p: [("wet", [("ff", f"flanger=delay=8:depth=4:regen=40:speed={float(p['rate']):.2f}")], float(p["amount"]) / 100)])
_reg("bass", "Refuerzo de graves", [{"id": "gain", "label": "Graves", "min": 0, "max": 18, "def": 9, "unit": " dB"}],
     lambda p: [("ff", f"bass=g={float(p['gain']):.1f}:f=160")])
_reg("bright", "Claridad (agudos)", [{"id": "gain", "label": "Agudos", "min": 0, "max": 15, "def": 6, "unit": " dB"}],
     lambda p: [("ff", f"treble=g={float(p['gain']):.1f}:f=4000")])
_reg("gate", "Puerta de ruido", [{"id": "thr", "label": "Umbral", "min": -70, "max": -20, "def": -45, "unit": " dB"}],
     lambda p: [("ff", f"highpass=f=90,agate=threshold={_db(float(p['thr'])):.5f}:ratio=4:attack=5:release=120")], ["ruido"])
_reg("compressor", "Compresor (voz uniforme)", [{"id": "thr", "label": "Umbral", "min": -50, "max": -5, "def": -24, "unit": " dB"}],
     lambda p: [("ff", f"acompressor=threshold={_db(float(p['thr'])):.5f}:ratio=6:attack=5:release=200,volume=1.4")])


def audio_fx_params(it, raw):
    return {d["id"]: (raw or {}).get(d["id"], d["def"]) for d in it["params"]}


def _ffmpeg(a: np.ndarray, flt: str) -> np.ndarray:
    from ..util import ffmpeg_path
    cmd = [ffmpeg_path(), "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", flt,
           "-f", "f32le", "-ar", str(SR), "-ac", "2", "-"]
    p = subprocess.run(cmd, input=np.ascontiguousarray(a, np.float32).tobytes(), stdout=subprocess.PIPE,
                       stderr=subprocess.DEVNULL, timeout=120)
    raw = p.stdout
    out = np.frombuffer(raw[: len(raw) // 8 * 8], np.float32).reshape(-1, 2).copy()
    if out.shape[0] == 0:
        return a
    if out.shape[0] < a.shape[0]:
        out = np.concatenate([out, np.zeros((a.shape[0] - out.shape[0], 2), np.float32)])
    return out[: a.shape[0]]


def _run(a, steps):
    for st in steps:
        if st[0] == "ff":
            a = _ffmpeg(a, st[1])
        elif st[0] == "np":
            a = st[1](a).astype(np.float32)
        elif st[0] == "wet":
            wet = _run(a, st[1])
            m = max(0.0, min(1.0, st[2]))
            a = a * (1 - m) + wet * m
    return a


_cache: dict = {}


def apply_audio_fx(seg: np.ndarray, lst, key: str = "") -> np.ndarray:
    items = [f for f in (lst or []) if f and not f.get("off") and get_audiofx(f.get("id"))]
    if not items or seg.shape[0] == 0:
        return seg
    h = hashlib.md5((key + json.dumps(items, sort_keys=True, default=str) + str(seg.shape)).encode()).hexdigest()
    r = _cache.get(h)
    if r is not None:
        return r
    a = seg
    for f in items:
        it = get_audiofx(f["id"])
        try:
            a = _run(a, it["steps"](audio_fx_params(it, f.get("p"))))
        except Exception:
            continue
    a = np.clip(a, -1.0, 1.0).astype(np.float32)
    if len(_cache) > 12:
        _cache.clear()
    _cache[h] = a
    return a
