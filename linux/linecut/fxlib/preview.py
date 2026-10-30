"""Miniaturas y vistas previas de la biblioteca: renderizan el elemento sobre una escena de muestra con el mismo motor."""
from __future__ import annotations

import numpy as np

from . import catalog


def scene(W: int, H: int, variant: int = 0) -> np.ndarray:
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    if variant == 0:
        img[..., 0] = 0.18 + 0.25 * y / H
        img[..., 1] = 0.32 + 0.30 * y / H
        img[..., 2] = 0.62 - 0.30 * y / H
        img[int(H * 0.68):, :, :] = [0.20, 0.50, 0.22]
        sun = ((x - W * 0.3) ** 2 + (y - H * 0.42) ** 2) < (H * 0.17) ** 2
        img[sun] = [1.0, 0.85, 0.2]
        img[int(H * 0.35):int(H * 0.82), int(W * 0.58):int(W * 0.78)] = [0.78, 0.22, 0.22]
        img[int(H * 0.28):int(H * 0.36), int(W * 0.62):int(W * 0.74)] = [1, 1, 1]
    else:
        img[..., 0] = 0.55 - 0.3 * x / W
        img[..., 1] = 0.25 + 0.2 * x / W
        img[..., 2] = 0.45 + 0.4 * x / W
        img[int(H * 0.5):, :, :] *= 0.55
        for i in range(4):
            cx = W * (0.18 + 0.22 * i)
            img[((x - cx) ** 2 + (y - H * 0.55) ** 2) < (H * 0.12) ** 2] = [0.95, 0.9, 0.7]
    return (np.clip(img, 0, 1) * 255).astype(np.uint8)


def _alpha(rgb: np.ndarray) -> np.ndarray:
    H, W = rgb.shape[:2]
    return np.concatenate([rgb.astype(np.float32) / 255.0, np.ones((H, W, 1), np.float32)], -1)


def _to_u8(a: np.ndarray) -> np.ndarray:
    return (np.clip(a[..., :3], 0, 1) * 255 + 0.5).astype(np.uint8)


def thumb(kind: str, id: str, params: dict | None = None, t: float = 0.0, W: int = 160, H: int = 90) -> np.ndarray | None:
    """Fotograma (H,W,3) uint8 del elemento en el instante t (0..2 s). None si no tiene imagen (audio)."""
    from PIL import Image
    from . import runtime as RT
    from . import registry as R
    from .particles import draw_particles
    it = catalog.get(kind, id)
    if it is None or kind == "audio":
        return None
    base = scene(W, H, 0)
    if kind in ("fx", "filter"):
        lst = RT.item_passes(kind, id, params, RT.C(t, t, 3.0, 1.0, W, H))
        src = RT.hold_source("thumb:" + id, it, params, t, _alpha(base)) if it.get("hold") else _alpha(base)
        return _to_u8(RT.run_passes(src, lst, t, ns="thumb:" + id) if lst else src)
    if kind == "particles":
        return _to_u8(draw_particles(_alpha(base), t + 0.4, id, params, k=W / 1280.0))
    from .. import render, model
    if kind == "text":
        bg = np.full((H, W, 3), (28, 30, 44), np.uint8)
        clip = model.text_clip(None, 0.0)
        clip["text"] = "LineCut"
        clip["duration"] = 2.4
        clip["style"] = {**clip["style"], "size": 30, "color": "#ffffff"}
        k = W / 640.0
        lay = render.render_text(clip, k)
        if lay is None:
            return bg
        tt = t % 2.4
        from .textfx import render_text_fx
        fx = {"id": id, "p": params or {}}
        try:
            alt = render_text_fx(clip, k, tt, fx, lay)
        except Exception:
            alt = None
        lay = alt or lay
        canvas = bg.copy()
        c2 = model.base_clip("image", duration=100)
        render.draw_clip(canvas, c2, 0.0, 1.0, lay)
        return canvas
    # transición / animación: otra escena entra sobre la primera
    canvas = base.copy()
    other = Image.fromarray(scene(W, H, 1), "RGB")
    clip = model.base_clip("image", duration=2.0)
    if kind == "transition":
        dur = 1.2
        clip["transitionIn"] = {"type": id, "duration": dur, "p": params or {}}
        local = (t % 1.8) / 1.5 * dur
        local = min(local, dur)
        render.draw_clip(canvas, clip, local, 1.0, other)
        return canvas
    slot = "loop" if "loop" in it["slots"] else "in"
    clip["duration"] = 2.4
    clip["anim"] = {slot: {"id": id, "p": params or {}, **({"duration": 1.2} if slot == "in" else {})}}
    canvas = np.full((H, W, 3), (28, 30, 44), np.uint8)
    small = Image.fromarray(scene(W, H, 1), "RGB").resize((int(W * 0.6), int(H * 0.6)))
    local = t % 2.4 if slot == "loop" else (t % 2.0) * 0.9
    render.draw_clip(canvas, clip, local, 1.0, small)
    return canvas


def static_t(kind: str, it: dict) -> float:
    """Instante representativo para la miniatura estática."""
    if kind == "transition":
        return 0.75
    if kind == "particles":
        return 1.0
    if kind == "anim":
        return 1.3 if "loop" in it["slots"] else 0.6
    if kind == "text":
        return {"in": 0.5, "out": 2.0, "loop": 1.3}[it["mode"]]
    return 0.7
