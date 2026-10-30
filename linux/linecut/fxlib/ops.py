"""Operaciones de la biblioteca sobre el documento (sin Qt): aplicar, editar, ordenar y quitar elementos."""
from __future__ import annotations

import copy

from . import catalog
from .params import defaults

LIST_KEY = {"fx": "fx", "filter": "fx", "text": "textFx", "audio": "audioFx"}


def item_defaults(kind: str, id: str) -> dict:
    it = catalog.get(kind, id)
    return defaults(it) if it else {}


def add_clip_fx(doc, cid: str, kind: str, id: str, params: dict | None = None):
    """Efecto/filtro (kind fx|filter), texto (text) o audio (audio) en la lista correspondiente del clip."""
    key = LIST_KEY[kind]

    def fn(c):
        entry = {"id": id, "p": dict(params if params is not None else item_defaults(kind, id)), "off": False}
        if kind in ("fx", "filter"):
            entry["kind"] = kind
        c.setdefault(key, []).append(entry)

    doc.patch_clip(cid, fn)


def set_transition(doc, cid: str, side: str, id: str, params: dict | None = None, duration: float | None = None):
    key = "transitionOut" if side == "out" else "transitionIn"

    def fn(c):
        if id == "none":
            c[key] = None
            return
        old = c.get(key) or {}
        d = duration if duration is not None else old.get("duration", min(1.0, c["duration"] / 2))
        c[key] = {"type": id, "duration": d, "p": dict(params if params is not None else item_defaults("transition", id))}

    doc.patch_clip(cid, fn)


def set_anim(doc, cid: str, slot: str, id: str | None, params: dict | None = None, duration: float = 0.8):
    def fn(c):
        a = dict(c.get("anim") or {})
        if id is None:
            a.pop(slot, None)
        else:
            e = {"id": id, "p": dict(params if params is not None else item_defaults("anim", id))}
            if slot != "loop":
                e["duration"] = (a.get(slot) or {}).get("duration", duration)
            a[slot] = e
        c["anim"] = a or None

    doc.patch_clip(cid, fn)


def add_layer(doc, t: float, kind: str, id: str, params: dict | None = None, duration: float = 3.0) -> str | None:
    """Capa de efecto sobre todo lo anterior (efecto, filtro o partículas)."""
    from ..model import effect_clip
    it = catalog.get(kind, id)
    if not it or kind not in ("fx", "filter", "particles"):
        return None
    clip = effect_clip(kind, id, it["label"], t, params if params is not None else item_defaults(kind, id), duration)
    return doc.insert_clip(clip)


def applicable(kind: str, clip: dict | None) -> bool:
    """¿Se puede aplicar este tipo al clip dado?"""
    if clip is None:
        return False
    t = clip["type"]
    if kind in ("fx", "filter", "transition", "anim"):
        return t in ("video", "image", "text")
    if kind == "text":
        return t == "text"
    if kind == "audio":
        return t in ("video", "audio")
    return False


# --------- edición de los elementos ya aplicados (inspector)
def list_of(c: dict, key: str) -> list:
    return c.get(key) or []


def set_param(doc, cid: str, key: str, i: int, params: dict):
    def fn(c):
        lst = c.get(key) or []
        if 0 <= i < len(lst):
            lst[i]["p"] = dict(params)

    doc.patch_clip(cid, fn, f"fxp:{key}:{i}:{cid}")


def set_flag(doc, cid: str, key: str, i: int, off: bool):
    def fn(c):
        lst = c.get(key) or []
        if 0 <= i < len(lst):
            lst[i]["off"] = bool(off)

    doc.patch_clip(cid, fn)


def remove(doc, cid: str, key: str, i: int):
    def fn(c):
        lst = c.get(key) or []
        if 0 <= i < len(lst):
            lst.pop(i)

    doc.patch_clip(cid, fn)


def duplicate(doc, cid: str, key: str, i: int):
    def fn(c):
        lst = c.get(key) or []
        if 0 <= i < len(lst):
            lst.insert(i + 1, copy.deepcopy(lst[i]))

    doc.patch_clip(cid, fn)


def move(doc, cid: str, key: str, i: int, d: int):
    def fn(c):
        lst = c.get(key) or []
        j = i + d
        if 0 <= i < len(lst) and 0 <= j < len(lst):
            lst[i], lst[j] = lst[j], lst[i]

    doc.patch_clip(cid, fn)


def set_layer_params(doc, cid: str, params: dict):
    doc.patch_clip(cid, lambda c: c.__setitem__("fxParams", dict(params)), f"fxl:{cid}")


def set_anim_param(doc, cid: str, slot: str, params: dict, duration: float | None = None):
    def fn(c):
        a = c.get("anim") or {}
        if slot in a:
            a[slot]["p"] = dict(params)
            if duration is not None and slot != "loop":
                a[slot]["duration"] = duration

    doc.patch_clip(cid, fn, f"anp:{slot}:{cid}")


def set_transition_param(doc, cid: str, key: str, params: dict):
    def fn(c):
        if c.get(key):
            c[key]["p"] = dict(params)

    doc.patch_clip(cid, fn, f"trp:{key}:{cid}")
