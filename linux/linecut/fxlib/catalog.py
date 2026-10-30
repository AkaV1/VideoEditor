"""Catálogo unificado de la biblioteca (siete tipos) para la interfaz."""
from __future__ import annotations

from . import registry as R
from .anim import ANIMS, get_anim
from .audiofx import AUDIO_FX, get_audiofx
from .particles import PARTICLES, get_particles
from .textfx import TEXTFX, get_textfx

KINDS = [("fx", "Efectos"), ("filter", "Filtros"), ("transition", "Transiciones"), ("anim", "Animaciones"),
         ("text", "Texto"), ("particles", "Partículas"), ("audio", "Audio")]
KIND_LABEL = dict(KINDS)
CATS = {
    "fx": R.FX_CATS, "filter": R.FILTER_CATS, "transition": R.TR_CATS,
    "anim": [("in", "Entrada / salida"), ("loop", "Bucle")],
    "text": [("in", "Entrada"), ("out", "Salida"), ("loop", "Continuo")],
    "particles": [], "audio": [],
}
SLOT_LABEL = {"in": "Entrada", "out": "Salida", "loop": "Bucle"}


def items(kind: str) -> list:
    if kind in ("fx", "filter", "transition"):
        return R.items(kind)
    return {"anim": ANIMS, "text": TEXTFX, "particles": PARTICLES, "audio": AUDIO_FX}[kind]


def get(kind: str, id: str):
    if kind in ("fx", "filter", "transition"):
        return R.get_item(kind, id)
    return {"anim": get_anim, "text": get_textfx, "particles": get_particles, "audio": get_audiofx}[kind](id)


def cat_of(kind: str, it: dict) -> str:
    if kind == "anim":
        return "loop" if "loop" in it["slots"] else "in"
    if kind == "text":
        return it["mode"]
    return it.get("cat", "")


def search(kind: str, text: str = "", cat: str = "") -> list:
    q = (text or "").strip().lower()
    out = []
    for it in items(kind):
        if cat and cat_of(kind, it) != cat:
            continue
        if q and q not in it["label"].lower() and q not in it["id"].lower() and not any(q in t.lower() for t in it.get("tags", [])):
            continue
        out.append(it)
    return out


def total() -> int:
    return sum(len(items(k)) for k, _ in KINDS)
