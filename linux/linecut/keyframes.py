"""Keyframes: animan propiedades de un clip. clip["keyframes"] = {prop: [{"t","v","e"}]}
`t` en segundos desde el inicio del clip; `e`: 'linear' | 'smooth' | 'hold' (tramo que sale del keyframe)."""
from __future__ import annotations

from .util import clamp

KF_PROPS = {"x": "transform", "y": "transform", "scale": "transform", "rotation": "transform",
            "opacity": "transform", "volume": "audio"}
KF_LABELS = {"x": "Posición X", "y": "Posición Y", "scale": "Escala", "rotation": "Rotación",
             "opacity": "Opacidad", "volume": "Volumen"}
EASINGS = [("linear", "Lineal"), ("smooth", "Suave"), ("hold", "Mantener")]
EPS = 0.02


def props_for(clip: dict) -> list[str]:
    t = clip["type"]
    if t == "audio":
        return ["volume"]
    base = ["x", "y", "scale", "rotation", "opacity"]
    return base + ["volume"] if t == "video" else base


def _ease(kind: str, p: float) -> float:
    if kind == "hold":
        return 0.0
    if kind == "smooth":
        return p * p * (3 - 2 * p)
    return p


def has_kf(clip: dict, prop: str) -> bool:
    return bool(clip.get("keyframes", {}).get(prop))


def any_kf(clip: dict) -> bool:
    return any(v for v in clip.get("keyframes", {}).values())


def value_at(clip: dict, prop: str, local: float) -> float:
    lst = clip.get("keyframes", {}).get(prop)
    base = clip[KF_PROPS[prop]][prop]
    if not lst:
        return base
    if local <= lst[0]["t"]:
        return lst[0]["v"]
    if local >= lst[-1]["t"]:
        return lst[-1]["v"]
    for a, b in zip(lst, lst[1:]):
        if a["t"] <= local <= b["t"]:
            p = 1.0 if b["t"] == a["t"] else (local - a["t"]) / (b["t"] - a["t"])
            return a["v"] + (b["v"] - a["v"]) * _ease(a.get("e", "smooth"), p)
    return base


def eval_transform(clip: dict, local: float) -> dict:
    tf = clip["transform"]
    if not any_kf(clip):
        return tf
    out = dict(tf)
    for p in ("x", "y", "scale", "rotation", "opacity"):
        if has_kf(clip, p):
            out[p] = value_at(clip, p, local)
    return out


def eval_volume(clip: dict, local: float) -> float:
    return value_at(clip, "volume", local)


def local_time(clip: dict, t: float) -> float:
    return clamp(t - clip["start"], 0.0, clip["duration"])


def kf_index_at(lst, local: float) -> int:
    if not lst:
        return -1
    for i, k in enumerate(lst):
        if abs(k["t"] - local) < EPS:
            return i
    return -1


def all_times(clip: dict) -> list[float]:
    out: list[float] = []
    for lst in clip.get("keyframes", {}).values():
        for k in lst or []:
            if not any(abs(t - k["t"]) < EPS for t in out):
                out.append(k["t"])
    return sorted(out)


def set_kf(lst, local: float, v: float, e: str | None = None) -> list[dict]:
    arr = [dict(k) for k in (lst or [])]
    i = kf_index_at(arr, local)
    if i >= 0:
        arr[i]["v"] = v
        if e:
            arr[i]["e"] = e
    else:
        arr.append({"t": local, "v": v, "e": e or "smooth"})
        arr.sort(key=lambda k: k["t"])
    return arr


def split_keyframes(clip: dict, d1: float):
    left: dict = {}
    right: dict = {}
    for prop, lst in clip.get("keyframes", {}).items():
        if not lst:
            continue
        mid = value_at(clip, prop, d1)
        before = [k for k in lst if k["t"] < d1 - EPS]
        after = [k for k in lst if k["t"] > d1 + EPS]
        at = next((k for k in lst if abs(k["t"] - d1) <= EPS), None)
        e = at["e"] if at else (before[-1]["e"] if before else "smooth")
        l = [dict(k) for k in before] + ([{"t": d1, "v": mid, "e": e}] if (after or at) else [])
        r = ([{"t": 0.0, "v": mid, "e": at["e"] if at else e}] if (before or at) else []) + [
            {**k, "t": k["t"] - d1} for k in after]
        if l:
            left[prop] = l
        if r:
            right[prop] = r
    return left, right


def shift_keyframes(kfs: dict, dt: float, dur: float) -> dict:
    """Desplaza los keyframes dt segundos (recorte por la izquierda) y descarta los que quedan fuera."""
    out = {}
    for prop, lst in (kfs or {}).items():
        moved = [{**k, "t": k["t"] + dt} for k in lst or []]
        kept = [k for k in moved if -EPS <= k["t"] <= dur + EPS]
        lead = [k for k in moved if k["t"] < -EPS]
        if lead and not any(k["t"] < EPS for k in kept):
            a = lead[-1]
            b = next((k for k in moved if k["t"] > -EPS), None)
            if b:
                p = (0 - a["t"]) / (b["t"] - a["t"])
                v = a["v"] + (b["v"] - a["v"]) * _ease(a.get("e", "smooth"), p)
            else:
                v = a["v"]
            kept = [{"t": 0.0, "v": v, "e": a.get("e", "smooth")}] + kept
        kept = [{**k, "t": clamp(k["t"], 0.0, dur)} for k in kept]
        if kept:
            out[prop] = kept
    return out


def scale_keyframes(kfs: dict, ratio: float) -> dict:
    return {p: [{**k, "t": k["t"] * ratio} for k in lst or []] for p, lst in (kfs or {}).items()}
