"""Vista previa del lienzo con tiradores de transformación (mover, escalar, rotar)."""
from __future__ import annotations

import math

import numpy as np
from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QImage, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget

from ..keyframes import eval_transform
from ..model import project_size
from ..render import clip_box, render_frame, active_clips
from .theme import ACCENT


class PreviewView(QWidget):
    select_clip = Signal(str)

    def __init__(self, editor, parent=None):
        super().__init__(parent)
        self.ed = editor
        self.setMinimumSize(320, 180)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setMouseTracking(True)
        self.img: QImage | None = None
        self._buf: np.ndarray | None = None
        self.rect = QRectF()
        self.W = self.H = 0
        self.drag = None
        self.show_handles = True

    # ------------------------------------------------------------ geometría
    def _layout(self):
        pw, ph = project_size(self.ed.doc.data)
        m = 12
        aw, ah = max(10, self.width() - 2 * m), max(10, self.height() - 2 * m)
        s = min(aw / pw, ah / ph)
        dw, dh = pw * s, ph * s
        self.rect = QRectF((self.width() - dw) / 2, (self.height() - dh) / 2, dw, dh)
        W = max(160, min(960, int(round(dw / 2) * 2)))
        H = max(90, int(round(W * ph / pw / 2) * 2))
        return W, H

    def refresh(self):
        doc = self.ed.doc
        if doc is None:
            return
        self.W, self.H = self._layout()
        fr = render_frame(doc.data, self.ed.t, self.W, self.H, self.ed.provider)
        self._buf = np.ascontiguousarray(fr)
        self.img = QImage(self._buf.data, self.W, self.H, self.W * 3, QImage.Format.Format_RGB888)
        self.update()

    def resizeEvent(self, e):
        super().resizeEvent(e)
        if self.ed.doc is not None and not self.ed.playing:
            self.refresh()

    # ------------------------------------------------------------- pintado
    def _f(self) -> float:
        return self.rect.width() / max(1, self.W)

    def _box(self):
        c = self.ed.selected_clip()
        if not c or c["type"] == "audio" or self.W == 0:
            return None
        if not (c["start"] <= self.ed.t <= c["start"] + c["duration"]):
            return None
        b = clip_box(self.ed.doc.data, c, self.ed.t, self.W, self.H, self.ed.provider)
        return b

    def _corners(self, b):
        cx, cy, w, h, rot = b
        f = self._f()
        a = math.radians(rot)
        ca, sa = math.cos(a), math.sin(a)
        pts = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            px, py = sx * w / 2, sy * h / 2
            pts.append(QPointF(self.rect.left() + (cx + px * ca - py * sa) * f,
                               self.rect.top() + (cy + px * sa + py * ca) * f))
        c = QPointF(self.rect.left() + cx * f, self.rect.top() + cy * f)
        mid = QPointF((pts[0].x() + pts[1].x()) / 2, (pts[0].y() + pts[1].y()) / 2)
        top = QPointF(mid.x() + 28 * sa, mid.y() - 28 * ca)
        return pts, c, top

    def paintEvent(self, ev):
        p = QPainter(self)
        p.fillRect(self.rect_all(), QColor("#0b0b0d"))
        if self.img is not None:
            p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
            p.drawImage(self.rect, self.img)
        p.setPen(QPen(QColor("#2d2d35"), 1))
        p.drawRect(self.rect)
        if self.show_handles and not self.ed.playing:
            b = self._box()
            if b:
                pts, c, top = self._corners(b)
                p.setRenderHint(QPainter.RenderHint.Antialiasing)
                p.setPen(QPen(QColor(ACCENT), 1.6))
                for i in range(4):
                    p.drawLine(pts[i], pts[(i + 1) % 4])
                mid = QPointF((pts[0].x() + pts[1].x()) / 2, (pts[0].y() + pts[1].y()) / 2)
                p.drawLine(mid, top)
                p.setBrush(QColor("white"))
                for q in pts:
                    p.drawEllipse(q, 5, 5)
                p.setBrush(QColor(ACCENT))
                p.drawEllipse(top, 6, 6)
        p.end()

    def rect_all(self):
        return self.rect.__class__(0, 0, self.width(), self.height())

    # ------------------------------------------------------------- ratón
    @staticmethod
    def _inside(b, px, py):
        cx, cy, w, h, rot = b
        a = -math.radians(rot)
        dx, dy = px - cx, py - cy
        lx, ly = dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)
        return abs(lx) <= w / 2 and abs(ly) <= h / 2

    def mousePressEvent(self, e):
        if e.button() != Qt.MouseButton.LeftButton or self.W == 0:
            return
        pos = e.position()
        c = self.ed.selected_clip()
        b = self._box()
        if c and b:
            pts, ctr, top = self._corners(b)
            if math.hypot(pos.x() - top.x(), pos.y() - top.y()) < 12:
                self._start("rot", c, pos, ctr)
                return
            if any(math.hypot(pos.x() - q.x(), pos.y() - q.y()) < 12 for q in pts):
                self._start("scale", c, pos, ctr)
                return
        px = (pos.x() - self.rect.left()) / self._f()
        py = (pos.y() - self.rect.top()) / self._f()
        # ¿sobre el clip seleccionado? mover. Si no, seleccionar el de más arriba bajo el cursor
        if c and b and self._inside(b, px, py):
            self._start("move", c, pos, None)
            return
        for cl in reversed(active_clips(self.ed.doc.data, self.ed.t)):
            bb = clip_box(self.ed.doc.data, cl, self.ed.t, self.W, self.H, self.ed.provider)
            if bb and self._inside(bb, px, py):
                self.select_clip.emit(cl["id"])
                self._start("move", cl, pos, None)
                return
        self.select_clip.emit("")

    def _start(self, mode, c, pos, ctr):
        tf = eval_transform(c, self.ed.t - c["start"])
        k = self.W / project_size(self.ed.doc.data)[0]
        self.drag = {"mode": mode, "cid": c["id"], "pos": pos, "tf": tf, "k": k, "c": ctr,
                     "d0": math.hypot(pos.x() - ctr.x(), pos.y() - ctr.y()) if ctr else 1,
                     "a0": math.degrees(math.atan2(pos.y() - ctr.y(), pos.x() - ctr.x())) if ctr else 0}

    def mouseMoveEvent(self, e):
        d = self.drag
        if not d:
            return
        pos = e.position()
        c = self.ed.doc.clip(d["cid"])
        if not c:
            return
        local = self.ed.t - c["start"]
        f = self._f()
        if d["mode"] == "move":
            dx = (pos.x() - d["pos"].x()) / f / d["k"]
            dy = (pos.y() - d["pos"].y()) / f / d["k"]
            self.ed.doc.patch_group(c["id"], "transform", {"x": round(d["tf"]["x"] + dx, 1),
                                                           "y": round(d["tf"]["y"] + dy, 1)}, local)
        elif d["mode"] == "scale":
            dist = math.hypot(pos.x() - d["c"].x(), pos.y() - d["c"].y())
            s = max(5.0, min(1000.0, d["tf"]["scale"] * dist / max(1.0, d["d0"])))
            self.ed.doc.patch_group(c["id"], "transform", {"scale": round(s, 1)}, local)
        else:
            ang = math.degrees(math.atan2(pos.y() - d["c"].y(), pos.x() - d["c"].x()))
            r = d["tf"]["rotation"] + (ang - d["a0"])
            r = (r + 180) % 360 - 180
            if e.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                r = round(r / 15) * 15
            self.ed.doc.patch_group(c["id"], "transform", {"rotation": round(r, 1)}, local)

    def mouseReleaseEvent(self, e):
        self.drag = None
