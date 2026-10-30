"""Biblioteca de efectos: categorías, búsqueda, favoritos, miniaturas animadas y panel de detalle con parámetros."""
from __future__ import annotations

import json

import numpy as np
from PySide6.QtCore import QEvent, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (QCheckBox, QComboBox, QHBoxLayout, QLabel, QLineEdit, QListView, QListWidget,
                               QListWidgetItem, QPushButton, QScrollArea, QToolButton, QVBoxLayout, QWidget)

from ..fxlib import catalog, ops, preview
from ..fxlib import runtime as RT
from ..fxlib.params import defaults
from ..util import data_dir
from .assets_cache import to_pixmap
from .theme import MUTED
from .widgets import ColorButton, PropSlider


def _dec(step) -> int:
    s = float(step)
    if s.is_integer():
        return 0
    return max(1, len(str(s).split(".")[1]))


class ParamEditor(QWidget):
    """Controles generados a partir de los descriptores de parámetros de un elemento."""
    changed = Signal(dict)

    def __init__(self, item: dict, values: dict | None = None, parent=None):
        super().__init__(parent)
        self.item = item
        self.vals = {**defaults(item), **(values or {})}
        self.ctrls: dict = {}
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(5)
        for d in item.get("params", []):
            if not d:
                continue
            pid = d["id"]
            typ = d.get("type")
            if typ == "select":
                row = QHBoxLayout()
                lb = QLabel(d["label"])
                lb.setStyleSheet("color:#b7b7c2;font-size:12px;")
                lb.setFixedWidth(110)
                cb = QComboBox()
                for v, l in d["options"]:
                    cb.addItem(l, v)
                cb.setCurrentIndex(max(0, cb.findData(str(self.vals.get(pid, d["def"])))))
                cb.currentIndexChanged.connect(lambda _i, p=pid, c=cb: self._set(p, c.currentData()))
                row.addWidget(lb)
                row.addWidget(cb, 1)
                lay.addLayout(row)
                self.ctrls[pid] = cb
            elif typ == "color":
                row = QHBoxLayout()
                lb = QLabel(d["label"])
                lb.setStyleSheet("color:#b7b7c2;font-size:12px;")
                lb.setFixedWidth(110)
                cbtn = ColorButton(str(self.vals.get(pid, d["def"])))
                cbtn.changed.connect(lambda v, p=pid: self._set(p, v))
                row.addWidget(lb)
                row.addWidget(cbtn)
                row.addStretch(1)
                lay.addLayout(row)
                self.ctrls[pid] = cbtn
            else:
                step = d.get("step") or (1 if d["max"] - d["min"] > 20 else 0.05)
                sl = PropSlider(d["label"], d["min"], d["max"], step, d.get("unit", ""), _dec(step))
                sl.label.setFixedWidth(110)
                sl.set_value(float(self.vals.get(pid, d["def"])))
                sl.changed.connect(lambda v, p=pid: self._set(p, v))
                lay.addWidget(sl)
                self.ctrls[pid] = sl

    def _set(self, pid, v):
        self.vals[pid] = v
        self.changed.emit(dict(self.vals))

    def values(self) -> dict:
        return dict(self.vals)

    def set_values(self, values: dict):
        """Actualiza los controles sin emitir señales."""
        self.vals = {**defaults(self.item), **(values or {})}
        for d in self.item.get("params", []):
            if not d:
                continue
            c = self.ctrls.get(d["id"])
            v = self.vals.get(d["id"], d["def"])
            if isinstance(c, QComboBox):
                c.blockSignals(True); c.setCurrentIndex(max(0, c.findData(str(v)))); c.blockSignals(False)
            elif isinstance(c, ColorButton):
                c.set_color(str(v))
            elif isinstance(c, PropSlider):
                try:
                    c.set_value(float(v))
                except (TypeError, ValueError):
                    pass

    def reset(self):
        self.set_values({})
        self.changed.emit(dict(self.vals))


def _fav_path():
    return data_dir() / "fx_favorites.json"


def load_favs() -> set:
    try:
        return set(json.loads(_fav_path().read_text(encoding="utf-8")))
    except Exception:
        return set()


def save_favs(favs: set):
    try:
        _fav_path().write_text(json.dumps(sorted(favs)), encoding="utf-8")
    except Exception:
        pass


class FxLibrary(QWidget):
    def __init__(self, editor, parent=None):
        super().__init__(parent)
        self.ed = editor
        self.favs = load_favs()
        self.icons: dict = {}
        self.cur: tuple | None = None
        self.editor_w: ParamEditor | None = None
        self.gen_token = 0
        self.hover_key: tuple | None = None
        self.hover_t = 0.0
        self.pv_t = 0.0

        lay = QVBoxLayout(self)
        lay.setContentsMargins(8, 8, 8, 8)
        lay.setSpacing(6)
        r1 = QHBoxLayout()
        self.kind = QComboBox()
        for k, label in catalog.KINDS:
            self.kind.addItem(f"{label} ({len(catalog.items(k))})", k)
        self.kind.addItem("★ Favoritos", "fav")
        self.kind.currentIndexChanged.connect(self._kind_changed)
        r1.addWidget(self.kind, 1)
        lay.addLayout(r1)
        r2 = QHBoxLayout()
        self.cat = QComboBox()
        self.cat.currentIndexChanged.connect(self._fill)
        self.search = QLineEdit()
        self.search.setPlaceholderText("Buscar…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self._fill)
        r2.addWidget(self.cat, 1)
        r2.addWidget(self.search, 1)
        lay.addLayout(r2)

        self.list = QListWidget()
        self.list.setViewMode(QListView.ViewMode.IconMode)
        self.list.setIconSize(QSize(104, 58))
        self.list.setGridSize(QSize(116, 92))
        self.list.setResizeMode(QListView.ResizeMode.Adjust)
        self.list.setMovement(QListView.Movement.Static)
        self.list.setWordWrap(True)
        self.list.setMouseTracking(True)
        self.list.setUniformItemSizes(True)
        self.list.itemEntered.connect(self._hover)
        self.list.viewport().installEventFilter(self)
        self.list.currentItemChanged.connect(self._select)
        self.list.itemDoubleClicked.connect(lambda _it: self._apply_default())
        lay.addWidget(self.list, 3)

        self.title = QLabel("Elige un elemento")
        self.title.setStyleSheet("font-weight:600;")
        lay.addWidget(self.title)
        self.pv = QLabel()
        self.pv.setFixedHeight(108)
        self.pv.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.pv.setStyleSheet("background:#14141a;border-radius:6px;")
        lay.addWidget(self.pv)
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        self.scroll.setMinimumHeight(70)
        lay.addWidget(self.scroll, 2)
        self.btn_row = QHBoxLayout()
        lay.addLayout(self.btn_row)
        r3 = QHBoxLayout()
        self.anim_cb = QCheckBox("Animar")
        self.anim_cb.setChecked(True)
        self.low_cb = QCheckBox("Bajo rendimiento")
        self.low_cb.setToolTip("Desactiva efectos pesados (partículas de humo, fuego, niebla y estelas) para ir más fluido")
        self.low_cb.toggled.connect(self._low)
        r3.addWidget(self.anim_cb)
        r3.addWidget(self.low_cb)
        r3.addStretch(1)
        lay.addLayout(r3)
        self.status = QLabel("")
        self.status.setStyleSheet(f"color:{MUTED};font-size:11px;")
        self.status.setWordWrap(True)
        lay.addWidget(self.status)

        self.timer = QTimer(self)
        self.timer.setInterval(110)
        self.timer.timeout.connect(self._tick)
        self.timer.start()
        self._kind_changed()

    # ------------------------------------------------------------ listado
    def _cur_kind(self) -> str:
        return self.kind.currentData()

    def _kind_changed(self, _i=None):
        k = self._cur_kind()
        self.cat.blockSignals(True)
        self.cat.clear()
        self.cat.addItem("Todas las categorías", "")
        if k != "fav":
            for cid, label in catalog.CATS.get(k, []):
                self.cat.addItem(label, cid)
        self.cat.setVisible(self.cat.count() > 1)
        self.cat.blockSignals(False)
        self._fill()

    def _entries(self) -> list:
        k = self._cur_kind()
        q = self.search.text()
        if k == "fav":
            out = []
            for kk, _ in catalog.KINDS:
                for it in catalog.search(kk, q, ""):
                    if f"{kk}:{it['id']}" in self.favs:
                        out.append((kk, it))
            return out
        return [(k, it) for it in catalog.search(k, q, self.cat.currentData() or "")]

    def _fill(self, _i=None):
        self.gen_token += 1
        self.list.clear()
        self.hover_key = None
        ents = self._entries()
        for kk, it in ents:
            li = QListWidgetItem(("★ " if f"{kk}:{it['id']}" in self.favs else "") + it["label"])
            li.setData(Qt.ItemDataRole.UserRole, (kk, it["id"]))
            li.setToolTip(", ".join(it.get("tags", [])) or it["label"])
            ic = self.icons.get((kk, it["id"]))
            if ic:
                li.setIcon(ic)
            self.list.addItem(li)
        self.status.setText("" if ents else "Sin resultados")
        QTimer.singleShot(0, lambda t=self.gen_token: self._gen(t, 0))

    def _make_icon(self, kk: str, id: str, params=None, t=None, size=(160, 90)):
        it = catalog.get(kk, id)
        if kk == "audio":
            return None
        try:
            arr = preview.thumb(kk, id, params, preview.static_t(kk, it) if t is None else t, size[0], size[1])
        except Exception:
            return None
        if arr is None:
            return None
        return to_pixmap(np.ascontiguousarray(arr))

    def _gen(self, token: int, start: int):
        if token != self.gen_token:
            return
        n = self.list.count()
        end = min(n, start + 6)
        for i in range(start, end):
            li = self.list.item(i)
            kk, id = li.data(Qt.ItemDataRole.UserRole)
            if (kk, id) in self.icons:
                continue
            pm = self._make_icon(kk, id)
            if pm is None:
                li.setText("♪ " + li.text() if kk == "audio" else li.text())
                continue
            ic = QIcon(pm)
            self.icons[(kk, id)] = ic
            li.setIcon(ic)
        if end < n:
            QTimer.singleShot(1, lambda: self._gen(token, end))

    # ---------------------------------------------------- miniatura animada
    def _hover(self, li):
        key = li.data(Qt.ItemDataRole.UserRole)
        if key != self.hover_key:
            self._restore_hover()
            self.hover_key = key
            self.hover_t = 0.0

    def _restore_hover(self):
        if self.hover_key:
            for i in range(self.list.count()):
                li = self.list.item(i)
                if li.data(Qt.ItemDataRole.UserRole) == self.hover_key:
                    ic = self.icons.get(self.hover_key)
                    if ic:
                        li.setIcon(ic)
                    break
        self.hover_key = None

    def eventFilter(self, obj, ev):
        if obj is self.list.viewport() and ev.type() == QEvent.Type.Leave:
            self._restore_hover()
        return super().eventFilter(obj, ev)

    def _tick(self):
        if not self.isVisible():
            return
        if self.hover_key and self.hover_key[0] != "audio":
            self.hover_t += 0.11
            kk, id = self.hover_key
            pm = self._make_icon(kk, id, None, self.hover_t)
            if pm is not None:
                for i in range(self.list.count()):
                    li = self.list.item(i)
                    if li.data(Qt.ItemDataRole.UserRole) == self.hover_key:
                        li.setIcon(QIcon(pm))
                        break
        if self.cur and self.cur[0] != "audio" and self.anim_cb.isChecked() and self.editor_w is not None:
            self.pv_t += 0.11
            self._draw_pv(self.pv_t)

    def _draw_pv(self, t):
        kk, id = self.cur
        pm = self._make_icon(kk, id, self.editor_w.values(), t, (192, 108))
        if pm is not None:
            self.pv.setPixmap(pm)

    # ------------------------------------------------------------ detalle
    def _select(self, li, _prev=None):
        if li is None:
            return
        kk, id = li.data(Qt.ItemDataRole.UserRole)
        self.cur = (kk, id)
        it = catalog.get(kk, id)
        self.title.setText(f"{catalog.KIND_LABEL[kk]} · {it['label']}")
        self.editor_w = ParamEditor(it)
        self.editor_w.changed.connect(lambda _v: (self._draw_pv(self.pv_t) if not self.anim_cb.isChecked() else None))
        self.scroll.setWidget(self.editor_w)
        self.pv_t = preview.static_t(kk, it)
        if kk == "audio":
            self.pv.setText("♪  Se escucha al reproducir o exportar")
            self.pv.setStyleSheet("background:#14141a;border-radius:6px;color:#8b8b97;")
        else:
            self.pv.setStyleSheet("background:#14141a;border-radius:6px;")
            self.pv.setText("")
            self._draw_pv(self.pv_t)
        self._build_buttons(kk, it)
        self.refresh()

    def _clear_buttons(self):
        while self.btn_row.count():
            w = self.btn_row.takeAt(0).widget()
            if w:
                w.deleteLater()

    def _btn(self, text, fn, tip=""):
        b = QPushButton(text)
        b.setToolTip(tip)
        b.clicked.connect(lambda _=False: fn())
        self.btn_row.addWidget(b)
        return b

    def _build_buttons(self, kk, it):
        self._clear_buttons()
        self.need_clip: list = []
        self._btn("↺", lambda: self.editor_w and self.editor_w.reset(), "Restablecer parámetros")
        fav = QToolButton()
        fav.setText("★" if f"{kk}:{it['id']}" in self.favs else "☆")
        fav.setToolTip("Favorito")
        fav.clicked.connect(self._toggle_fav)
        self.btn_row.addWidget(fav)
        if kk in ("fx", "filter"):
            self.need_clip.append(self._btn("Aplicar al clip", self.apply_clip))
            self._btn("Como capa", self.apply_layer, "Efecto sobre todo lo que hay debajo, como un clip propio")
        elif kk == "particles":
            self._btn("Añadir capa", self.apply_layer)
        elif kk == "transition":
            self.need_clip.append(self._btn("Entrada", lambda: self.apply_clip("in")))
            self.need_clip.append(self._btn("Salida", lambda: self.apply_clip("out")))
        elif kk == "anim":
            for s in it["slots"]:
                self.need_clip.append(self._btn(catalog.SLOT_LABEL[s], lambda s=s: self.apply_clip(s)))
        elif kk == "text":
            self.need_clip.append(self._btn("Aplicar al texto", self.apply_clip))
        elif kk == "audio":
            self.need_clip.append(self._btn("Aplicar al audio", self.apply_clip))

    def refresh(self):
        """Activa/desactiva los botones según el clip seleccionado."""
        if not self.cur:
            return
        ok = ops.applicable(self.cur[0], self.ed.selected_clip())
        for b in getattr(self, "need_clip", []):
            try:
                b.setEnabled(ok)
            except RuntimeError:
                pass
        self.status.setText("" if ok or self.cur[0] == "particles" else "Selecciona un clip compatible en la línea de tiempo (o usa «Como capa»).")

    def _toggle_fav(self):
        if not self.cur:
            return
        key = f"{self.cur[0]}:{self.cur[1]}"
        if key in self.favs:
            self.favs.discard(key)
        else:
            self.favs.add(key)
        save_favs(self.favs)
        for b in self.findChildren(QToolButton):
            if b.toolTip() == "Favorito":
                b.setText("★" if key in self.favs else "☆")
        if self._cur_kind() == "fav":
            self._fill()

    # ------------------------------------------------------------ aplicar
    def _apply_default(self):
        if not self.cur:
            return
        kk = self.cur[0]
        if kk == "particles" or (kk in ("fx", "filter") and not ops.applicable(kk, self.ed.selected_clip())):
            self.apply_layer()
        else:
            self.apply_clip()

    def apply_clip(self, slot: str = "in"):
        c = self.ed.selected_clip()
        if not self.cur or not ops.applicable(self.cur[0], c):
            return
        kk, id = self.cur
        vals = self.editor_w.values()
        doc = self.ed.doc
        if kk in ("fx", "filter", "text", "audio"):
            ops.add_clip_fx(doc, c["id"], kk, id, vals)
        elif kk == "transition":
            ops.set_transition(doc, c["id"], slot, id, vals)
        elif kk == "anim":
            ops.set_anim(doc, c["id"], slot, id, vals)

    def apply_layer(self):
        if not self.cur or self.cur[0] not in ("fx", "filter", "particles"):
            return
        kk, id = self.cur
        cid = ops.add_layer(self.ed.doc, self.ed.t, kk, id, self.editor_w.values())
        if cid:
            self.ed.select(cid)

    def _low(self, on):
        RT.perf["low"] = bool(on)
        self.ed.render_now()
