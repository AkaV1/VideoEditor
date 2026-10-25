"""Efectos de video (se aplican al fotograma) y de movimiento (animan posición, escala y giro)."""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageFilter

PIXEL_EFFECTS = [("blur", "Desenfoque"), ("pixelate", "Pixelado"), ("rgbsplit", "Aberración RGB"),
                 ("glitch", "Glitch"), ("grain", "Grano de película"), ("vignette", "Viñeta"),
                 ("mirror", "Espejo"), ("negative", "Negativo")]
MOTION_EFFECTS = [("shake", "Temblor"), ("pulse", "Pulso"), ("zoomIn", "Zoom lento +"), ("zoomOut", "Zoom lento −"),
                  ("float", "Flotar"), ("swing", "Balanceo"), ("spin", "Giro continuo")]
EFFECT_LABELS = dict(PIXEL_EFFECTS + MOTION_EFFECTS)
MOTION_KEYS = {k for k, _ in MOTION_EFFECTS}

_noise: dict = {}
_vig: dict = {}


def new_effect(kind: str) -> dict:
    return {"type": kind, "amount": 50.0}


def _wave(t: float, seed: float) -> float:
    return 0.5 * (math.sin(t * 37.0 + seed) + math.sin(t * 23.3 + seed * 2.1))


def motion(effects: list[dict] | None, local: float, dur: float) -> tuple[float, float, float, float]:
    """(dx, dy, factor_escala, grados) a sumar a la transformación; dx/dy en píxeles del proyecto."""
    dx = dy = rot = 0.0
    sc = 1.0
    p = local / dur if dur > 0 else 0.0
    for e in effects or []:
        k, a = e["type"], e["amount"] / 100.0
        if k == "shake":
            dx += a * 40 * _wave(local, 1.0)
            dy += a * 40 * _wave(local, 5.0)
            rot += a * 4 * _wave(local, 9.0)
        elif k == "pulse":
            sc *= 1 + a * 0.12 * math.sin(2 * math.pi * 1.6 * local)
        elif k == "zoomIn":
            sc *= 1 + a * 0.5 * p
        elif k == "zoomOut":
            sc *= 1 + a * 0.5 * (1 - p)
        elif k == "float":
            dy += a * 25 * math.sin(2 * math.pi * 0.5 * local)
        elif k == "swing":
            rot += a * 12 * math.sin(2 * math.pi * 0.7 * local)
        elif k == "spin":
            rot += a * 180 * local
    return dx, dy, sc, rot


def _noise_tile(h: int, w: int, i: int) -> np.ndarray:
    key = (h, w, i % 8)
    n = _noise.get(key)
    if n is None:
        rng = np.random.default_rng(1000 + key[2])
        n = rng.normal(0, 1, (h, w, 1)).astype(np.float32)
        if len(_noise) > 24:
            _noise.clear()
        _noise[key] = n
    return n


def _vignette(h: int, w: int) -> np.ndarray:
    m = _vig.get((h, w))
    if m is None:
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2) / 1.414
        m = np.clip((r - 0.35) / 0.65, 0, 1)[:, :, None] ** 1.5
        _vig.clear()
        _vig[(h, w)] = m.astype(np.float32)
        m = _vig[(h, w)]
    return m


def apply_pixel(rgb: np.ndarray, effects: list[dict] | None, local: float, k: float) -> np.ndarray:
    """Aplica los efectos de imagen en orden. `k` = escala del lienzo respecto al proyecto."""
    if not effects:
        return rgb
    h, w = rgb.shape[:2]
    frame = int(local * 30)
    for e in effects:
        kind, a = e["type"], e["amount"] / 100.0
        if kind in MOTION_KEYS or a <= 0:
            continue
        if kind == "blur":
            r = a * 24 * k
            if r > 0.3:
                rgb = np.asarray(Image.fromarray(rgb).filter(ImageFilter.GaussianBlur(r)))
        elif kind == "pixelate":
            b = max(2, int(a * 48 * k) + 1)
            sw, sh = max(1, w // b), max(1, h // b)
            small = Image.fromarray(rgb).resize((sw, sh), Image.BOX)
            rgb = np.asarray(small.resize((w, h), Image.NEAREST))
        elif kind == "rgbsplit":
            s = max(1, int(a * 28 * k))
            if s < w:
                out = rgb.copy()
                out[:, s:, 0] = rgb[:, :-s, 0]
                out[:, :-s, 2] = rgb[:, s:, 2]
                rgb = out
        elif kind == "glitch":
            rng = np.random.default_rng(frame * 7919 + 13)
            if rng.random() < 0.35 + 0.5 * a:
                out = rgb.copy()
                for _ in range(1 + int(a * 7)):
                    sh = max(2, int(h * rng.uniform(0.02, 0.10)))
                    y0 = int(rng.integers(0, max(1, h - sh)))
                    dx = int(rng.uniform(-1, 1) * a * 0.18 * w)
                    out[y0:y0 + sh] = np.roll(out[y0:y0 + sh], dx, axis=1)
                s = max(1, int(a * 10 * k))
                out[:, s:, 0] = out[:, :-s, 0]
                rgb = out
        elif kind == "grain":
            n = _noise_tile(h, w, frame)
            rgb = np.clip(rgb.astype(np.float32) + n * (a * 45), 0, 255).astype(np.uint8)
        elif kind == "vignette":
            m = _vignette(h, w)
            rgb = (rgb.astype(np.float32) * (1 - m * a * 0.95)).astype(np.uint8)
        elif kind == "mirror":
            out = rgb.copy()
            half = w // 2
            out[:, w - half:] = rgb[:, :half][:, ::-1]
            rgb = out
        elif kind == "flash":
            rgb = (rgb.astype(np.float32) * (1 - a) + 255 * a).astype(np.uint8)
        elif kind == "negative":
            rgb = (rgb.astype(np.float32) * (1 - a) + (255 - rgb.astype(np.float32)) * a).astype(np.uint8)
    return np.ascontiguousarray(rgb)
