"""Pestaña «Biblioteca» del inspector: edita lo aplicado al clip (efectos, animaciones, transiciones, texto y audio)."""
from __future__ import annotations

from PySide6.QtWidgets import QCheckBox, QHBoxLayout, QLabel, QToolButton, QVBoxLayout, QWidget

from ..fxlib import catalog, ops
from .fxlibrary import ParamEditor
from .theme import MUTED
from .widgets import PropSlider, section_label


def signature(c: dict | None) -> tuple:
    """Cambia cuando cambia la estructura de lo aplicado (no sus parámetros)."""
    if not c:
        return ()
    a = c.get("anim") or {}
    return (tuple((f.get("kind", "fx"), f["id"], bool(f.get("off"))) for f in c.get("fx") or []),
            tuple(f["id"] for f in c.get("textFx") or []), tuple(f["id"] for f in c.get("audioFx") or []),
            tuple((k, v["id"]) for k, v in sorted(a.items())),
            (c.get("transitionIn") or {}).get("type"), (c.get("transitionOut") or {}).get("type"),
            c.get("fxId"), c.get("fxKind"))


def _tbtn(text, tip, fn):
    b = QToolButton()
    b.setText(text)
    b.setToolTip(tip)
    b.clicked.connect(lambda _=False: fn())
    return b


def build(insp, c: dict) -> QWidget:
    """Devuelve el contenido de la pestaña. Registra en insp.fxw los editores para sincronizarlos (deshacer/rehacer)."""
    from .inspector import _page
    w, lay = _page()
    insp.fxw = []
    cid = c["id"]
    doc = insp.ed.doc

    def add_editor(item, getter, setter, container: QVBoxLayout):
        ed = ParamEditor(item, getter(c))
        ed.changed.connect(setter)
        container.addWidget(ed)
        insp.fxw.append((ed, getter))
        return ed

    if c["type"] == "effect":
        it = catalog.get(c.get("fxKind"), c.get("fxId"))
        lay.addWidget(section_label("Capa de efecto"))
        lb = QLabel(f"{catalog.KIND_LABEL.get(c.get('fxKind'), '')} · {it['label'] if it else c.get('fxId')}")
        lay.addWidget(lb)
        hint = QLabel("Afecta a todo lo que hay debajo de esta capa durante su duración.")
        hint.setWordWrap(True)
        hint.setStyleSheet(f"color:{MUTED};font-size:11px;")
        lay.addWidget(hint)
        if it:
            add_editor(it, lambda cl: cl.get("fxParams") or {}, lambda v: ops.set_layer_params(doc, cid, v), lay)
        lay.addWidget(insp._slider("transform", "opacity", "Opacidad", 0, 100, 1, " %", 0, kf=False))
        lay.addStretch(1)
        return w

    def block(title, kind, key, entries):
        lay.addWidget(section_label(title))
        if not entries:
            h = QLabel("Nada aplicado. Añádelo desde la pestaña Biblioteca.")
            h.setStyleSheet(f"color:{MUTED};font-size:11px;")
            lay.addWidget(h)
            return
        n = len(entries)
        for i, f in enumerate(entries):
            k = f.get("kind", kind)
            it = catalog.get(k, f["id"])
            row = QHBoxLayout()
            ck = QCheckBox(it["label"] if it else f["id"])
            ck.setChecked(not f.get("off"))
            ck.toggled.connect(lambda v, i=i: ops.set_flag(doc, cid, key, i, not v))
            row.addWidget(ck, 1)
            row.addWidget(_tbtn("▲", "Subir", lambda i=i: ops.move(doc, cid, key, i, -1)))
            row.addWidget(_tbtn("▼", "Bajar", lambda i=i: ops.move(doc, cid, key, i, 1)))
            row.addWidget(_tbtn("⧉", "Duplicar", lambda i=i: ops.duplicate(doc, cid, key, i)))
            row.addWidget(_tbtn("✕", "Quitar", lambda i=i: ops.remove(doc, cid, key, i)))
            lay.addLayout(row)
            if it and it.get("params"):
                add_editor(it, lambda cl, i=i, key=key: ((cl.get(key) or [{}] * (i + 1))[i] if i < len(cl.get(key) or []) else {}).get("p") or {},
                           lambda v, i=i, key=key: ops.set_param(doc, cid, key, i, v), lay)
        del n

    if c["type"] != "audio":
        block("Efectos y filtros", "fx", "fx", c.get("fx") or [])
        # transiciones del catálogo (parámetros)
        for side, title, key in (("in", "Transición de entrada", "transitionIn"), ("out", "Transición de salida", "transitionOut")):
            tr = c.get(key)
            if tr:
                it = catalog.get("transition", tr["type"])
                if it and it.get("params"):
                    lay.addWidget(section_label(f"{title}: {it['label']}"))
                    add_editor(it, lambda cl, key=key: (cl.get(key) or {}).get("p") or {},
                               lambda v, key=key: ops.set_transition_param(doc, cid, key, v), lay)
        lay.addWidget(section_label("Animaciones"))
        a = c.get("anim") or {}
        if not a:
            h = QLabel("Sin animaciones de entrada, salida o bucle.")
            h.setStyleSheet(f"color:{MUTED};font-size:11px;")
            lay.addWidget(h)
        for slot in ("in", "out", "loop"):
            e = a.get(slot)
            if not e:
                continue
            it = catalog.get("anim", e["id"])
            row = QHBoxLayout()
            row.addWidget(QLabel(f"{catalog.SLOT_LABEL[slot]}: {it['label'] if it else e['id']}"), 1)
            row.addWidget(_tbtn("✕", "Quitar", lambda s=slot: ops.set_anim(doc, cid, s, None)))
            lay.addLayout(row)
            if slot != "loop":
                ds = PropSlider("Duración", 0.1, 3.0, 0.1, " s", 1, 30.0)
                ds.set_value(e.get("duration", 0.8))
                ds.changed.connect(lambda v, s=slot: ops.set_anim_param(doc, cid, s, (doc.clip(cid).get("anim") or {}).get(s, {}).get("p") or {}, v))
                lay.addWidget(ds)
            if it and it.get("params"):
                add_editor(it, lambda cl, s=slot: ((cl.get("anim") or {}).get(s) or {}).get("p") or {},
                           lambda v, s=slot: ops.set_anim_param(doc, cid, s, v), lay)
    if c["type"] == "text":
        block("Efectos de texto", "text", "textFx", c.get("textFx") or [])
    if c["type"] in ("video", "audio"):
        block("Efectos de audio", "audio", "audioFx", c.get("audioFx") or [])
    lay.addStretch(1)
    return w


def sync(insp, c: dict):
    for ed, getter in getattr(insp, "fxw", []):
        try:
            v = getter(c)
        except Exception:
            continue
        if v != ed.values() and v:
            ed.set_values(v)
