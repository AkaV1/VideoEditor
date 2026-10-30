"""Descriptores de parámetros (mismos ids/valores que la versión web) y normalización."""
from __future__ import annotations

import colorsys


def _p(id, label, mn, mx, df, unit="", step=None):
    d = {"id": id, "label": label, "min": mn, "max": mx, "def": df, "unit": unit}
    if step:
        d["step"] = step
    return d


P = {
    "amount": _p("amount", "Intensidad", 0, 100, 60, "%"),
    "speed": _p("speed", "Velocidad", 10, 400, 100, "%"),
    "angle": _p("angle", "Ángulo", 0, 360, 0, "°"),
    "size": _p("size", "Tamaño", 5, 100, 50, "%"),
    "count": _p("count", "Cantidad", 5, 100, 50, "%"),
    "freq": _p("freq", "Frecuencia", 1, 100, 40, ""),
    "blur": _p("blur", "Desenfoque", 0, 100, 40, "%"),
    "opacity": _p("opacity", "Opacidad", 0, 100, 100, "%"),
    "color": {"id": "color", "label": "Color", "type": "color", "def": "#ffffff"},
}


def wd(p: dict, df, **over) -> dict:
    """Copia del descriptor con otro valor por defecto (y campos cambiados)."""
    q = dict(p)
    q["def"] = df
    q.update(over)
    return q


def sel(id: str, label: str, options: list, df) -> dict:
    return {"id": id, "label": label, "type": "select", "options": [(str(v), l) for v, l in options], "def": df}


def color(df="#ffffff", label="Color") -> dict:
    return {"id": "color", "label": label, "type": "color", "def": df}


def hex_rgb(h: str) -> tuple:
    h = (h or "#ffffff").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    h = h.ljust(6, "0")
    return (int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0)


def defaults(item: dict) -> dict:
    return {d["id"]: d["def"] for d in item.get("params", [])}


class Pr(dict):
    """Parámetros normalizados: amount → 0..1, speed → factor, color → rgb; acceso por atributo."""

    __getattr__ = dict.get


def norm(item: dict, raw: dict | None) -> Pr:
    p = {**defaults(item), **(raw or {})}
    out = Pr(p)
    for k, v in list(out.items()):
        if isinstance(v, str):
            try:
                out[k] = float(v)
            except ValueError:
                pass
    out["amount"] = float(p.get("amount", 60)) / 100.0
    out["speed"] = float(p.get("speed", 100)) / 100.0
    out["rgb"] = hex_rgb(p.get("color", "#ffffff"))
    return out
