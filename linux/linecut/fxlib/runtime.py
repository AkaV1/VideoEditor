"""Ejecutor de pasadas (equivalente a FxGL.run) y puente con el catálogo: pasadas por clip, transiciones, animaciones."""
from __future__ import annotations

import numpy as np

from . import registry as R
from .core import F, Ctx, grid, samp
from .kernels import KERNELS
from .params import Pr, norm

perf = {"low": False}


class C:
    """Contexto de construcción de pasadas (c.t, c.local, c.dur, c.p, c.out)."""
    __slots__ = ("t", "local", "dur", "p", "W", "H", "out")

    def __init__(self, t=0.0, local=0.0, dur=1.0, p=1.0, W=0, H=0, out=False):
        self.t, self.local, self.dur, self.p, self.W, self.H, self.out = t, local, dur, p, W, H, out


_persist: dict = {}   # clave -> {"img", "time"}
_holds: dict = {}


def reset_history():
    _persist.clear()
    _holds.clear()


def _heavy(p):
    return perf["low"] and p.get("feedback")


def run_passes(img: np.ndarray, passes: list, time: float, ns: str = "") -> np.ndarray:
    """img: (H,W,4) float32 premultiplicado. Devuelve (H,W,4)."""
    passes = [p for p in passes if p["k"] in KERNELS]
    if not passes:
        return img
    H, W = img.shape[:2]
    cur = img
    orig = img
    for ps in passes:
        sc = ps.get("scale", 1) or 1
        w = max(2, int(round(W * sc)))
        h = max(2, int(round(H * sc)))
        src = cur
        prev = None
        fb = ps.get("feedback")
        if fb:
            key = f"{ns}:{fb}"
            pers = _persist.get(key)
            if pers is not None and (abs(time - pers["time"]) > 0.5 or time < pers["time"] - 1e-4):
                pers = None
            prev = pers["img"] if pers is not None else np.zeros((H, W, 4), F)
        if (src.shape[1], src.shape[0]) != (w, h) and sc != 1:
            u, v = grid(w, h)
            src = samp(cur, u, v)
        ctx = Ctx(src, orig, prev, time, ps.get("u", {}))
        out = KERNELS[ps["k"]](ctx)
        out = np.ascontiguousarray(out, dtype=F)
        if fb:
            if out.shape[:2] != (H, W):
                u, v = grid(W, H)
                keep = samp(out, u, v)
            else:
                keep = out
            if len(_persist) > 16:
                _persist.clear()
            _persist[f"{ns}:{fb}"] = {"img": keep, "time": time}
        cur = out
        if ps.get("save"):
            orig = out
    if cur.shape[:2] != (H, W):
        u, v = grid(W, H)
        cur = samp(cur, u, v)
    return cur


# ---------------------------------------------------------------- catálogo
def item_passes(kind: str, id: str, params, c: C) -> list:
    it = R.get_item(kind, id)
    if not it:
        return []
    pr = norm(it, params)
    lst = R.build_passes(it, pr, c)
    if perf["low"]:
        lst = [p for p in lst if not _heavy(p)]
    return lst


def clip_passes(clip: dict, local: float, W: int, H: int) -> list:
    out = []
    for f in clip.get("fx") or []:
        if f.get("off"):
            continue
        out += item_passes(f.get("kind", "fx"), f["id"], f.get("p"),
                           C(local, local, clip.get("duration", 1.0), 1.0, W, H))
    return out


def transition_step(st: dict, tr: dict, p: float, out: bool, W: int, H: int, local: float, dur: float) -> bool:
    """Aplica una transición del catálogo. Devuelve False si no existe (usar la clásica)."""
    it = R.get_item("transition", tr.get("type"))
    if not it:
        return False
    pr = norm(it, tr.get("p"))
    geo = it.get("geo")
    if geo:
        geo(st, p, out, W, H, pr)
    if it.get("build"):
        lst = [q for q in R.build_passes(it, pr, C(local, local, dur, p, W, H, out)) if not _heavy(q)]
        if lst:
            st.setdefault("gfx", []).extend(lst)
    return True


def hold_source(key: str, item: dict, params, local: float, img: np.ndarray):
    """Congela / repite fotogramas según item['hold']. Devuelve la imagen a procesar."""
    hd = item.get("hold")
    if not hd:
        return img
    rate = 0 if hd.get("rate") == 0 else float(min(60, max(1, float((params or {}).get(hd.get("rateParam"), 6) or 6))))
    step = 0 if rate == 0 else int(local * rate)
    h = _holds.get(key)
    if h is None or h["step"] != step or h["img"].shape != img.shape:
        if len(_holds) > 8:
            _holds.clear()
        h = _holds[key] = {"step": step, "img": img.copy()}
    return h["img"]


def apply_fx_layer(img: np.ndarray, kind: str, fid: str, params, local: float, dur: float, key: str = "") -> np.ndarray:
    """Efecto de ajuste sobre todo lo anterior (capa de efecto)."""
    it = R.get_item(kind, fid)
    if not it:
        return img
    H, W = img.shape[:2]
    passes = item_passes(kind, fid, params, C(local, local, dur, 1.0, W, H))
    src = hold_source("hold:" + key, it, params, local, img) if it.get("hold") else img
    if not passes:
        return src
    return run_passes(src, passes, local, ns=key)
