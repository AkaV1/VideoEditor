"""Panel de propiedades del clip seleccionado."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (QCheckBox, QComboBox, QHBoxLayout, QLabel, QPlainTextEdit, QPushButton, QScrollArea,
                               QSpinBox, QTabWidget, QToolButton, QVBoxLayout, QWidget)

from ..keyframes import EASINGS, KF_LABELS, KF_PROPS, kf_index_at, value_at, props_for
from ..model import BLEND_MODES, FILTERS, TRANSITIONS
from ..effects import EFFECT_LABELS, MOTION_EFFECTS, PIXEL_EFFECTS, new_effect
from ..render import font_families
from .theme import MUTED
from .widgets import ColorButton, PropSlider, section_label


def _page() -> tuple[QWidget, QVBoxLayout]:
    w = QWidget()
    lay = QVBoxLayout(w)
    lay.setContentsMargins(12, 8, 12, 12)
    lay.setSpacing(7)
    return w, lay


def _combo(items) -> QComboBox:
    cb = QComboBox()
    for key, label in items:
        cb.addItem(label, key)
    return cb


class Inspector(QWidget):
    def __init__(self, editor, parent=None):
        super().__init__(parent)
        self.ed = editor
        self.setObjectName("panel")
        self.built_for: tuple | None = None
        self.w: dict = {}
        self.lay = QVBoxLayout(self)
        self.lay.setContentsMargins(0, 0, 0, 0)
        self.empty = QLabel("Selecciona un clip en la línea de tiempo\npara editar sus propiedades")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.empty.setStyleSheet(f"color:{MUTED};")
        self.lay.addWidget(self.empty)
        self.tabs: QTabWidget | None = None
        self.kfbar: QWidget | None = None

    # -------------------------------------------------------------- helpers
    def cid(self):
        return self.ed.sel

    def local(self, c) -> float:
        return self.ed.t - c["start"]

    def _slider(self, group, prop, label, lo, hi, step=1, unit="", dec=0, hard=None, kf=True):
        s = PropSlider(label, lo, hi, step, unit, dec, hard, with_kf=kf and prop in KF_PROPS)
        s.changed.connect(lambda v, g=group, p=prop: self._patch(g, p, v))
        if kf and prop in KF_PROPS:
            s.diamond_clicked.connect(lambda p=prop: self.ed.doc.toggle_keyframe(self.cid(), p, self.ed.t))
        self.w[f"{group}.{prop}"] = s
        return s

    def _patch(self, group, prop, v):
        c = self.ed.selected_clip()
        if c:
            self.ed.doc.patch_group(c["id"], group, {prop: v}, self.local(c))

    # ---------------------------------------------------------------- build
    def rebuild(self, c):
        if self.tabs:
            self.lay.removeWidget(self.tabs); self.tabs.deleteLater(); self.tabs = None
        if self.kfbar:
            self.lay.removeWidget(self.kfbar); self.kfbar.deleteLater(); self.kfbar = None
        self.w = {}
        if not c:
            self.empty.show()
            return
        self.empty.hide()
        self.tabs = QTabWidget()
        self.tabs.setUsesScrollButtons(True)
        t = c["type"]
        if t == "text":
            self.tabs.addTab(self._scroll(self._tab_text(c)), "Texto")
        if t != "audio":
            self.tabs.addTab(self._scroll(self._tab_transform(c)), "Transformar")
            self.tabs.addTab(self._scroll(self._tab_color(c)), "Color")
        if t != "audio":
            self.tabs.addTab(self._scroll(self._tab_effects(c)), "Efectos")
        if t in ("video", "audio"):
            self.tabs.addTab(self._scroll(self._tab_audio(c)), "Audio")
        self.tabs.addTab(self._scroll(self._tab_time(c)), "Tiempo")
        self.lay.addWidget(self.tabs, 1)
        self.kfbar = self._kf_bar(c)
        self.lay.addWidget(self.kfbar)

    @staticmethod
    def _scroll(w: QWidget) -> QScrollArea:
        sa = QScrollArea()
        sa.setWidgetResizable(True)
        sa.setFrameShape(QScrollArea.Shape.NoFrame)
        sa.setWidget(w)
        return sa

    def _tab_transform(self, c):
        w, lay = _page()
        lay.addWidget(self._slider("transform", "x", "Posición X", -1500, 1500, 1, " px", 0, 6000))
        lay.addWidget(self._slider("transform", "y", "Posición Y", -1500, 1500, 1, " px", 0, 6000))
        lay.addWidget(self._slider("transform", "scale", "Escala", 5, 300, 1, " %", 0, 1000))
        lay.addWidget(self._slider("transform", "rotation", "Rotación", -180, 180, 1, "°", 0, 360))
        lay.addWidget(self._slider("transform", "opacity", "Opacidad", 0, 100, 1, " %", 0))
        row = QHBoxLayout()
        for key, label in (("flipH", "Voltear ↔"), ("flipV", "Voltear ↕")):
            cb = QCheckBox(label)
            cb.toggled.connect(lambda v, k=key: self._patch("transform", k, v))
            self.w[f"transform.{key}"] = cb
            row.addWidget(cb)
        lay.addLayout(row)
        lay.addWidget(section_label("Mezcla"))
        bl = _combo(BLEND_MODES)
        bl.currentIndexChanged.connect(lambda _i, b=bl: self._patch("transform", "blend", b.currentData()))
        self.w["transform.blend"] = bl
        lay.addWidget(bl)
        if c["type"] in ("video", "image"):
            lay.addWidget(section_label("Recorte"))
            for k, lab in (("top", "Arriba"), ("bottom", "Abajo"), ("left", "Izquierda"), ("right", "Derecha")):
                lay.addWidget(self._slider("crop", k, lab, 0, 90, 1, " %", 0, kf=False))
        lay.addStretch(1)
        return w

    def _tab_effects(self, c):
        w, lay = _page()
        lay.addWidget(section_label("Añadir efecto"))
        row = QHBoxLayout()
        cb = QComboBox()
        cb.addItem("Elige un efecto…", None)
        cb.insertSeparator(1)
        for key, label in MOTION_EFFECTS:
            cb.addItem(f"Movimiento · {label}", key)
        for key, label in PIXEL_EFFECTS:
            if c["type"] != "text":
                cb.addItem(f"Video · {label}", key)
        cb.activated.connect(lambda _i, b=cb: self._add_effect(b))
        row.addWidget(cb, 1)
        lay.addLayout(row)
        lay.addWidget(section_label("Efectos del clip"))
        effs = c.get("effects", [])
        if not effs:
            hint = QLabel("Aún no hay efectos. Añade uno arriba.")
            hint.setStyleSheet(f"color:{MUTED};")
            lay.addWidget(hint)
        for i, e in enumerate(effs):
            r = QHBoxLayout()
            sl = PropSlider(EFFECT_LABELS.get(e["type"], e["type"]), 0, 100, 1, " %", 0)
            sl.label.setFixedWidth(120)
            sl.changed.connect(lambda v, i=i: self._set_effect(i, v))
            self.w[f"effect.{i}"] = sl
            r.addWidget(sl, 1)
            rm = QToolButton()
            rm.setText("✕")
            rm.setToolTip("Quitar efecto")
            rm.clicked.connect(lambda _=False, i=i: self._del_effect(i))
            r.addWidget(rm)
            lay.addLayout(r)
        lay.addStretch(1)
        return w

    def _add_effect(self, cb):
        kind = cb.currentData()
        c = self.ed.selected_clip()
        if kind and c:
            self.ed.doc.patch_clip(c["id"], lambda cl: cl.setdefault("effects", []).append(new_effect(kind)))
        cb.setCurrentIndex(0)

    def _set_effect(self, i, v):
        c = self.ed.selected_clip()
        if c and not self._syncing and i < len(c.get("effects", [])):
            self.ed.doc.patch_clip(c["id"], lambda cl: cl["effects"][i].__setitem__("amount", v), f"fx:{i}:{c['id']}")

    def _del_effect(self, i):
        c = self.ed.selected_clip()
        if c and i < len(c.get("effects", [])):
            self.ed.doc.patch_clip(c["id"], lambda cl: cl["effects"].pop(i))

    def _tab_color(self, c):
        w, lay = _page()
        lay.addWidget(self._slider("color", "brightness", "Brillo", -100, 100, 1, "", 0, kf=False))
        lay.addWidget(self._slider("color", "contrast", "Contraste", -100, 100, 1, "", 0, kf=False))
        lay.addWidget(self._slider("color", "saturation", "Saturación", -100, 100, 1, "", 0, kf=False))
        lay.addWidget(self._slider("color", "temperature", "Temperatura", -100, 100, 1, "", 0, kf=False))
        lay.addWidget(section_label("Filtro"))
        fl = _combo(FILTERS)
        fl.currentIndexChanged.connect(lambda _i, b=fl: self._patch("color", "filter", b.currentData()))
        self.w["color.filter"] = fl
        lay.addWidget(fl)
        b = QPushButton("Restablecer color")
        b.clicked.connect(self._reset_color)
        lay.addWidget(b)
        lay.addStretch(1)
        return w

    def _reset_color(self):
        c = self.ed.selected_clip()
        if c:
            self.ed.doc.patch_clip(c["id"], lambda cl: cl["color"].update(brightness=0, contrast=0, saturation=0,
                                                                          temperature=0, filter="none"))

    def _tab_audio(self, c):
        w, lay = _page()
        lay.addWidget(self._slider("audio", "volume", "Volumen", 0, 200, 1, " %", 0, 400))
        lay.addWidget(self._slider("audio", "fadeIn", "Aparecer", 0, 10, 0.1, " s", 1, 60, kf=False))
        lay.addWidget(self._slider("audio", "fadeOut", "Desvanecer", 0, 10, 0.1, " s", 1, 60, kf=False))
        lay.addWidget(self._slider("audio", "balance", "Balance", -100, 100, 1, "", 0, kf=False))
        lay.addStretch(1)
        return w

    def _tab_time(self, c):
        w, lay = _page()
        if c["type"] != "text":
            sp = PropSlider("Velocidad", 0.1, 4.0, 0.05, "×", 2, 100.0)
            sp.changed.connect(lambda v: self.ed.selected_clip() and self.ed.doc.set_speed(self.cid(), v))
            self.w["speed"] = sp
            lay.addWidget(sp)
        for side, title, key in (("in", "Transición de entrada", "transitionIn"), ("out", "Transición de salida", "transitionOut")):
            if c["type"] == "audio":
                break
            lay.addWidget(section_label(title))
            cb = _combo(TRANSITIONS)
            cb.currentIndexChanged.connect(lambda _i, b=cb, s=side: self.ed.selected_clip() and
                                           self.ed.doc.apply_transition(self.cid(), b.currentData(), s))
            self.w[key] = cb
            lay.addWidget(cb)
            ds = PropSlider("Duración", 0.1, 3.0, 0.1, " s", 1, 30.0)
            ds.changed.connect(lambda v, k=key: self._set_tr_dur(k, v))
            self.w[key + ".dur"] = ds
            lay.addWidget(ds)
        lay.addStretch(1)
        return w

    def _set_tr_dur(self, key, v):
        c = self.ed.selected_clip()
        if c and c.get(key):
            self.ed.doc.patch_clip(c["id"], lambda cl: cl[key].__setitem__("duration", min(v, cl["duration"])),
                                   f"trdur:{key}:{c['id']}")

    def _tab_text(self, c):
        w, lay = _page()
        te = QPlainTextEdit()
        te.setFixedHeight(76)
        te.textChanged.connect(self._text_edited)
        self.w["text"] = te
        lay.addWidget(te)
        fc = QComboBox()
        fc.addItems(font_families())
        fc.currentTextChanged.connect(lambda v: self._style("font", v))
        self.w["style.font"] = fc
        lay.addWidget(fc)
        sz = PropSlider("Tamaño", 8, 300, 1, " px", 0, 800)
        sz.changed.connect(lambda v: self._style("size", int(v)))
        self.w["style.size"] = sz
        lay.addWidget(sz)
        row = QHBoxLayout()
        for key, label, st in (("bold", "N", "font-weight:bold;"), ("italic", "K", "font-style:italic;")):
            b = QToolButton()
            b.setText(label); b.setCheckable(True); b.setFixedSize(34, 28)
            b.setStyleSheet(st)
            b.toggled.connect(lambda v, k=key: self._style(k, v))
            self.w[f"style.{key}"] = b
            row.addWidget(b)
        for key, label in (("left", "⇤"), ("center", "↔"), ("right", "⇥")):
            b = QToolButton()
            b.setText(label); b.setCheckable(True); b.setFixedSize(34, 28)
            b.clicked.connect(lambda _=False, k=key: self._style("align", k))
            self.w[f"align.{key}"] = b
            row.addWidget(b)
        row.addStretch(1)
        lay.addLayout(row)
        row = QHBoxLayout()
        row.addWidget(QLabel("Color"))
        cb = ColorButton()
        cb.changed.connect(lambda v: self._style("color", v))
        self.w["style.color"] = cb
        row.addWidget(cb)
        row.addStretch(1)
        lay.addLayout(row)
        lay.addWidget(section_label("Contorno y sombra"))
        sw = PropSlider("Grosor", 0, 40, 1, " px", 0, 100)
        sw.changed.connect(lambda v: self._style("strokeWidth", int(v)))
        self.w["style.strokeWidth"] = sw
        lay.addWidget(sw)
        row = QHBoxLayout()
        row.addWidget(QLabel("Color contorno"))
        sc = ColorButton("#000000")
        sc.changed.connect(lambda v: self._style("strokeColor", v))
        self.w["style.strokeColor"] = sc
        row.addWidget(sc)
        shadow = QCheckBox("Sombra")
        shadow.toggled.connect(lambda v: self._style("shadow", v))
        self.w["style.shadow"] = shadow
        row.addWidget(shadow)
        row.addStretch(1)
        lay.addLayout(row)
        lay.addWidget(section_label("Fondo"))
        row = QHBoxLayout()
        bg = QCheckBox("Caja de fondo")
        bg.toggled.connect(lambda v: self._style("bgEnabled", v))
        self.w["style.bgEnabled"] = bg
        row.addWidget(bg)
        bc = ColorButton("#000000")
        bc.changed.connect(lambda v: self._style("bgColor", v))
        self.w["style.bgColor"] = bc
        row.addWidget(bc)
        row.addStretch(1)
        lay.addLayout(row)
        bo = PropSlider("Opacidad", 0, 100, 1, " %", 0)
        bo.changed.connect(lambda v: self._style("bgOpacity", int(v)))
        self.w["style.bgOpacity"] = bo
        lay.addWidget(bo)
        ls = PropSlider("Espaciado", -10, 40, 1, " px", 0, 100)
        ls.changed.connect(lambda v: self._style("letterSpacing", int(v)))
        self.w["style.letterSpacing"] = ls
        lay.addWidget(ls)
        lay.addStretch(1)
        return w

    def _text_edited(self):
        c = self.ed.selected_clip()
        if not c or self._syncing:
            return
        txt = self.w["text"].toPlainText()
        if txt != c.get("text"):
            self.ed.doc.patch_clip(c["id"], lambda cl: cl.__setitem__("text", txt), f"text:{c['id']}")

    def _style(self, key, val):
        c = self.ed.selected_clip()
        if c and not self._syncing and c["style"].get(key) != val:
            self.ed.doc.patch_clip(c["id"], lambda cl: cl["style"].__setitem__(key, val), f"style:{key}:{c['id']}")

    def _kf_bar(self, c) -> QWidget:
        bar = QWidget()
        bar.setObjectName("panel")
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(10, 6, 10, 8)
        lay.setSpacing(4)
        lay.addWidget(QLabel("Keyframes"))
        prev = QToolButton(); prev.setText("◀"); prev.setToolTip("Keyframe anterior")
        prev.clicked.connect(lambda: self._jump(-1))
        nxt = QToolButton(); nxt.setText("▶"); nxt.setToolTip("Keyframe siguiente")
        nxt.clicked.connect(lambda: self._jump(1))
        allb = QToolButton(); allb.setText("◆ Todo"); allb.setToolTip("Añadir/quitar keyframes de todas las propiedades")
        allb.clicked.connect(lambda: self.ed.doc.toggle_all_keyframes(self.cid(), self.ed.t))
        ease = QComboBox()
        for k, l in EASINGS:
            ease.addItem(l, k)
        ease.setToolTip("Suavizado del tramo que sale de este keyframe")
        ease.activated.connect(lambda _i: self.ed.doc.set_keyframe_ease(self.cid(), self.ed.t, ease.currentData()))
        clr = QToolButton(); clr.setText("✕"); clr.setToolTip("Quitar todos los keyframes")
        clr.clicked.connect(lambda: self.ed.doc.clear_keyframes(self.cid(), self.ed.t))
        for x in (prev, nxt, allb, ease, clr):
            lay.addWidget(x)
        lay.addStretch(1)
        return bar

    def _jump(self, d):
        t = self.ed.doc.next_keyframe(self.cid(), self.ed.t, d)
        if t is not None:
            self.ed.set_time(t)

    # ----------------------------------------------------------------- sync
    _syncing = False

    def refresh(self):
        c = self.ed.selected_clip()
        key = (c["id"], c["type"], tuple(e["type"] for e in c.get("effects", []))) if c else None
        if key != self.built_for:
            same = bool(self.built_for) and bool(key) and self.built_for[0] == key[0] and self.tabs is not None
            idx = self.tabs.currentIndex() if same else 0
            self.built_for = key
            self._syncing = True
            self.rebuild(c)
            if same and self.tabs:
                self.tabs.setCurrentIndex(min(idx, self.tabs.count() - 1))
            self._syncing = False
        if not c:
            return
        self._syncing = True
        try:
            self._sync(c)
        finally:
            self._syncing = False

    def _sync(self, c):
        loc = self.local(c)
        for name, wd in self.w.items():
            if name.startswith(("transform.", "audio.", "crop.", "color.")):
                group, prop = name.split(".")
                if isinstance(wd, PropSlider):
                    if prop in KF_PROPS and KF_PROPS[prop] == group:
                        v = value_at(c, prop, max(0.0, min(c["duration"], loc)))
                        lst = c.get("keyframes", {}).get(prop)
                        wd.set_value(v)
                        wd.set_kf_state("on" if kf_index_at(lst, loc) >= 0 else "near" if lst else "off")
                    else:
                        wd.set_value(c[group][prop])
                elif isinstance(wd, QCheckBox):
                    wd.blockSignals(True); wd.setChecked(bool(c[group][prop])); wd.blockSignals(False)
                elif isinstance(wd, QComboBox):
                    i = wd.findData(c[group][prop])
                    wd.blockSignals(True); wd.setCurrentIndex(max(0, i)); wd.blockSignals(False)
        for i, e in enumerate(c.get("effects", [])):
            sl = self.w.get(f"effect.{i}")
            if sl:
                sl.set_value(e["amount"])
        if "speed" in self.w:
            self.w["speed"].set_value(c["speed"])
        for key in ("transitionIn", "transitionOut"):
            if key in self.w:
                tr = c.get(key)
                cb = self.w[key]
                cb.blockSignals(True); cb.setCurrentIndex(max(0, cb.findData(tr["type"] if tr else "none"))); cb.blockSignals(False)
                ds = self.w[key + ".dur"]
                ds.setEnabled(bool(tr))
                ds.set_value(tr["duration"] if tr else 0.5)
        if c["type"] == "text":
            te = self.w["text"]
            if te.toPlainText() != c.get("text", ""):
                te.blockSignals(True); te.setPlainText(c.get("text", "")); te.blockSignals(False)
            st = c["style"]
            fc = self.w["style.font"]
            fc.blockSignals(True)
            i = fc.findText(st["font"])
            fc.setCurrentIndex(max(0, i)); fc.blockSignals(False)
            for k in ("size", "strokeWidth", "bgOpacity", "letterSpacing"):
                self.w[f"style.{k}"].set_value(st[k])
            for k in ("bold", "italic"):
                b = self.w[f"style.{k}"]; b.blockSignals(True); b.setChecked(st[k]); b.blockSignals(False)
            for k in ("left", "center", "right"):
                b = self.w[f"align.{k}"]; b.blockSignals(True); b.setChecked(st["align"] == k); b.blockSignals(False)
            for k in ("color", "strokeColor", "bgColor"):
                self.w[f"style.{k}"].set_color(st[k])
            for k in ("shadow", "bgEnabled"):
                b = self.w[f"style.{k}"]; b.blockSignals(True); b.setChecked(bool(st[k])); b.blockSignals(False)
