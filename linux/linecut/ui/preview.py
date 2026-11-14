"""Vista previa del lienzo con tiradores de transformación (mover, escalar, rotar)."""
from __future__ import annotations

import copy
import math
import threading
import time

import numpy as np
from PySide6.QtCore import QObject, QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QImage, QPainter, QPen
from PySide6.QtWidgets import QSizePolicy, QWidget

from ..keyframes import eval_transform
from ..model import project_size
from ..render import clip_box, render_frame, active_clips
from .theme import ACCENT


class FrameWorker(QObject):
    """Renderiza los fotogramas de la vista previa en un hilo aparte: la interfaz nunca se bloquea y, si el render
    va más lento que la reproducción, se saltan fotogramas (siempre se dibuja el más reciente pedido)."""
    ready = Signal()

    def __init__(self):
        super().__init__()
        self.cv = threading.Condition()
        self.req = None
        self.res = None
        self.busy = False
        self.alive = True
        self.ema = 0.0
        self.th = threading.Thread(target=self._run, name="linecut-preview", daemon=True)
        self.th.start()

    def submit(self, data, t, W, H, provider):
        with self.cv:
            self.req = (data, t, W, H, provider)
            self.cv.notify_all()

    def _run(self):
        while True:
            with self.cv:
                while self.req is None and self.alive:
                    self.cv.wait()
                if not self.alive:
                    return
                data, t, W, H, provider = self.req
                self.req = None
                self.busy = True
            t0 = time.perf_counter()
            buf = None
            try:
                buf = np.ascontiguousarray(render_frame(data, t, W, H, provider))
            except Exception:  # noqa: BLE001
                buf = None
            dt = time.perf_counter() - t0
            with self.cv:
                self.res = (buf, t, W, H)
                self.busy = False
                self.ema = dt if self.ema <= 0 else self.ema * 0.65 + dt * 0.35
                self.cv.notify_all()
            self.ready.emit()

    def take(self):
        with self.cv:
            r, self.res = self.res, None
            return r

    def idle(self) -> bool:
        with self.cv:
            return not self.busy and self.req is None

    def wait_idle(self, timeout=30.0):
        end = time.monotonic() + timeout
        with self.cv:
            while (self.busy or self.req is not None) and time.monotonic() < end:
                self.cv.wait(0.1)

    def cancel(self):
        with self.cv:
            self.req = None
        self.wait_idle()

    def close(self):
        with self.cv:
            self.alive = False
            self.req = None
            self.cv.notify_all()


class PreviewView(QWidget):
    select_clip = Signal(str)
    frame_shown = Signal()

    # anchos de la vista previa durante la reproducción (se baja solo si el equipo no llega a los fotogramas por segundo)
    LEVELS = (960, 720, 540, 400, 300, 220)

    def __init__(self, editor, parent=None):
        super().__init__(parent)
        self.ed = editor
        self.worker = FrameWorker()
        self.worker.ready.connect(self._on_ready, Qt.ConnectionType.QueuedConnection)
        self.level = 0
        self._snap = None
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
        W = max(160, min(self.LEVELS[self.level if self.ed.playing else 0], int(round(dw / 2) * 2)))
        H = max(90, int(round(W * ph / pw / 2) * 2))
        return W, H

    def invalidate(self):
        """El proyecto cambió: la copia que usa el hilo de render ya no vale."""
        self._snap = None

    def _data(self):
        if self._snap is None:
            d = self.ed.doc.data
            self._snap = {k: copy.deepcopy(d[k]) for k in ("ratio", "res", "fps", "tracks") if k in d}
        return self._snap

    def refresh(self, t: float | None = None):
        """Pide el fotograma de t (o del cabezal). Es asíncrono: se dibuja cuando el hilo de render termina."""
        doc = self.ed.doc
        if doc is None or self.ed.provider is None:
            return
        W, H = self._layout()
        self.worker.submit(self._data(), self.ed.t if t is None else t, W, H, self.ed.provider)

    def flush(self):
        """Espera a que termine el render pendiente y lo muestra (para exportar capturas o pruebas)."""
        self.refresh()
        self.worker.wait_idle()
        self._on_ready()

    def _on_ready(self):
        r = self.worker.take()
        if r is None or r[0] is None:
            return
        buf, _t, W, H = r
        self.W, self.H = W, H
        self._buf = buf
        self.img = QImage(self._buf.data, W, H, W * 3, QImage.Format.Format_RGB888)
        self.update()
        self.frame_shown.emit()

    def adapt(self, fps: float):
        """Ajusta la resolución de la vista previa a la velocidad del equipo (sólo durante la reproducción)."""
        budget = 1.0 / max(1.0, fps)
        e = self.worker.ema
        if e <= 0:
            return
        if e > budget * 1.05 and self.level < len(self.LEVELS) - 1:
            self.level += 1
            self.worker.ema = 0.0
        elif e < budget * 0.38 and self.level > 0:
            self.level -= 1
            self.worker.ema = 0.0

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
