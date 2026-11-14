"""Línea de tiempo multipista dibujada a mano: arrastrar, recortar, cortar, zoom, keyframes."""
from __future__ import annotations

import copy

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (QHBoxLayout, QInputDialog, QMenu, QScrollBar, QSizePolicy, QVBoxLayout,
                               QWidget)

from ..keyframes import all_times
from ..model import clip_end
from ..util import short_time
from .theme import ACCENT, CLIP_COLORS, LINE, MUTED, PANEL, PANEL2

HEAD = 104
RULER = 26
ADD_H = 30  # fila final con el botón «＋ Capa»


class TimelineCanvas(QWidget):
    seek = Signal(float)
    select = Signal(str)
    needs_scroll_sync = Signal()
    needs_vscroll_sync = Signal()

    def __init__(self, editor, parent=None):
        super().__init__(parent)
        self.ed = editor
        self.pps = 60.0
        self.off = 0.0  # segundos a la izquierda
        self.yoff = 0.0  # píxeles desplazados en vertical
        self.setMinimumHeight(150)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setMouseTracking(True)
        self.setAcceptDrops(True)
        self.drag = None
        self.hover = None

    # ------------------------------------------------------------ geometría
    @property
    def tracks(self):
        return self.ed.doc.tracks

    def th(self) -> float:
        n = max(1, len(self.tracks))
        return max(36.0, min(60.0, (self.height() - RULER - ADD_H - 4) / n))

    def content_h(self) -> float:
        return RULER + len(self.tracks) * self.th() + ADD_H + 4

    def max_yoff(self) -> float:
        return max(0.0, self.content_h() - self.height())

    def clamp_y(self):
        self.yoff = max(0.0, min(self.max_yoff(), self.yoff))

    def x_of(self, t: float) -> float:
        return HEAD + (t - self.off) * self.pps

    def t_of(self, x: float) -> float:
        return (x - HEAD) / self.pps + self.off

    def row_y(self, i: int) -> float:
        return RULER + i * self.th() - self.yoff

    def row_at(self, y: float) -> int:
        if y < RULER:
            return -1
        i = int((y - RULER + self.yoff) // self.th())
        return i if 0 <= i < len(self.tracks) else -1

    def add_rect(self) -> QRectF:
        return QRectF(8, self.row_y(len(self.tracks)) + 4, HEAD - 16, ADD_H - 8)

    def clip_rect(self, c, i) -> QRectF:
        th = self.th()
        return QRectF(self.x_of(c["start"]), self.row_y(i) + 3, max(2.0, c["duration"] * self.pps), th - 6)

    def total_seconds(self) -> float:
        return max(30.0, self.ed.doc.duration + 15.0)

    # -------------------------------------------------------------- pintado
    def paintEvent(self, ev):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        doc = self.ed.doc
        p.fillRect(self.rect(), QColor(PANEL))
        self.clamp_y()
        th = self.th()
        # filas
        for i, tr in enumerate(self.tracks):
            y = self.row_y(i)
            p.fillRect(QRectF(HEAD, y, self.width() - HEAD, th), QColor("#1a1a1f" if i % 2 == 0 else "#17171b"))
        # reglas
        self._ruler(p)
        # clips
        p.save()
        p.setClipRect(QRectF(HEAD, RULER, self.width() - HEAD, self.height() - RULER))
        for i, tr in enumerate(self.tracks):
            for c in tr["clips"]:
                r = self.clip_rect(c, i)
                if r.right() < HEAD or r.left() > self.width():
                    continue
                self._clip(p, c, tr, r)
        # guía de imán
        if self.drag and self.drag.get("snap") is not None:
            x = self.x_of(self.drag["snap"])
            p.setPen(QPen(QColor("#ffc933"), 1, Qt.PenStyle.DashLine))
            p.drawLine(QPointF(x, RULER), QPointF(x, self.height()))
        p.restore()
        # cabeceras de pista
        p.save()
        p.setClipRect(QRectF(0, RULER, self.width(), self.height() - RULER))
        for i, tr in enumerate(self.tracks):
            self._head(p, tr, i)
        r = self.add_rect()
        p.fillRect(QRectF(0, r.top() - 4, HEAD, ADD_H), QColor("#202026"))
        pth = QPainterPath(); pth.addRoundedRect(r, 6, 6)
        p.fillPath(pth, QColor("#2a2a33"))
        p.setPen(QColor(ACCENT))
        f = QFont(); f.setPixelSize(12); f.setBold(True); p.setFont(f)
        p.drawText(r, Qt.AlignmentFlag.AlignCenter, "＋ Capa")
        p.restore()
        # marcadores y cabezal
        x = self.x_of(self.ed.t)
        if x >= HEAD:
            p.setPen(QPen(QColor(ACCENT), 2))
            p.drawLine(QPointF(x, 0), QPointF(x, self.height()))
            path = QPainterPath()
            path.moveTo(x - 7, 0); path.lineTo(x + 7, 0); path.lineTo(x, 12); path.closeSubpath()
            p.fillPath(path, QColor(ACCENT))
        p.end()

    def _ruler(self, p: QPainter):
        p.fillRect(QRectF(0, 0, self.width(), RULER), QColor("#202026"))
        steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
        step = next((s for s in steps if s * self.pps >= 70), steps[-1])
        t = int(self.off / step) * step
        f = QFont(); f.setPixelSize(10); p.setFont(f)
        p.save()
        p.setClipRect(QRectF(HEAD, 0, self.width() - HEAD, RULER))
        while self.x_of(t) < self.width():
            x = self.x_of(t)
            if x >= HEAD - 40:
                p.setPen(QColor("#4a4a55"))
                p.drawLine(QPointF(x, RULER - 9), QPointF(x, RULER))
                p.setPen(QColor(MUTED))
                p.drawText(QPointF(x + 3, RULER - 12), short_time(t))
            sub = step / 5
            for k in range(1, 5):
                xs = self.x_of(t + sub * k)
                if xs >= HEAD:
                    p.setPen(QColor("#33333c"))
                    p.drawLine(QPointF(xs, RULER - 4), QPointF(xs, RULER))
            t += step
        p.restore()
        p.fillRect(QRectF(0, 0, HEAD, RULER), QColor("#202026"))

    def _head(self, p: QPainter, tr, i):
        y, th = self.row_y(i), self.th()
        p.fillRect(QRectF(0, y, HEAD, th), QColor("#202026"))
        p.setPen(QColor(LINE))
        p.drawLine(QPointF(0, y + th), QPointF(HEAD, y + th))
        icon = {"video": "🎞", "audio": "♪", "text": "T"}[tr["kind"]]
        f = QFont(); f.setPixelSize(12); p.setFont(f)
        p.setPen(QColor("#c9c9d3"))
        p.drawText(QRectF(8, y, HEAD - 62, th), Qt.AlignmentFlag.AlignVCenter,
                   p.fontMetrics().elidedText(f"{icon} {tr['name']}", Qt.TextElideMode.ElideRight, HEAD - 62))
        # botones: ocultar/silenciar y bloquear
        for j, (flag, on, off) in enumerate((("muted" if tr["kind"] == "audio" else "hidden",
                                              "🔇" if tr["kind"] == "audio" else "⊘", "🔊" if tr["kind"] == "audio" else "◉"),
                                             ("locked", "🔒", "🔓"))):
            if tr["kind"] == "text" and flag == "hidden":
                pass
            r = self._btn_rect(i, j)
            p.setPen(QColor("#ff6b75" if tr.get(flag) else MUTED))
            p.drawText(r, Qt.AlignmentFlag.AlignCenter, on if tr.get(flag) else off)

    def _btn_rect(self, i, j) -> QRectF:
        y, th = self.row_y(i), self.th()
        return QRectF(HEAD - 50 + j * 24, y + th / 2 - 11, 22, 22)

    def _clip(self, p: QPainter, c, tr, r: QRectF):
        sel = c["id"] == self.ed.sel
        bg, border = CLIP_COLORS[c["type"]]
        path = QPainterPath()
        path.addRoundedRect(r, 6, 6)
        p.fillPath(path, QColor(bg))
        p.save()
        p.setClipPath(path)
        cache = self.ed.assets
        mid = c.get("mediaId")
        if mid and c["type"] in ("video", "image"):
            cache.ensure(mid)
            pms = cache.thumbs.get(mid)
            if c["type"] == "image":
                pm = cache.poster(mid, 56)
                pms = [pm] if pm else None
            if pms:
                item = self.ed.doc.data["media"][mid]
                th = r.height()
                tw = max(8.0, th * pms[0].width() / max(1, pms[0].height()))
                x = r.left()
                n = len(pms)
                src_dur = max(0.1, item["duration"])
                while x < r.right():
                    if x + tw >= HEAD:
                        if c["type"] == "image":
                            idx = 0
                        else:
                            tsrc = c["trimStart"] + ((x - r.left()) / self.pps) * c["speed"]
                            idx = min(n - 1, max(0, int(tsrc / src_dur * n)))
                        p.setOpacity(0.85)
                        p.drawPixmap(QRectF(x, r.top(), tw, th), pms[idx], QRectF(pms[idx].rect()))
                        p.setOpacity(1)
                    x += tw
                p.fillRect(r, QColor(0, 0, 0, 70))
        if mid and c["type"] in ("audio", "video"):
            cache.ensure(mid)
            peaks = cache.peaks.get(mid)
            if peaks:
                per = 40.0
                h = r.height() * (0.9 if c["type"] == "audio" else 0.38)
                base = r.center().y() if c["type"] == "audio" else r.bottom() - 2
                p.setPen(QPen(QColor(255, 255, 255, 140), 1))
                x0 = max(r.left(), HEAD)
                x = x0
                while x < min(r.right(), self.width()):
                    tsrc = c["trimStart"] + ((x - r.left()) / self.pps) * c["speed"]
                    i = int(tsrc * per)
                    if 0 <= i < len(peaks):
                        a = peaks[i] / 255.0 * h
                        if c["type"] == "audio":
                            p.drawLine(QPointF(x, base - a / 2), QPointF(x, base + a / 2))
                        else:
                            p.drawLine(QPointF(x, base), QPointF(x, base - a))
                    x += 2
        p.restore()
        p.setPen(QPen(QColor("#ffffff" if sel else border), 2 if sel else 1))
        p.drawPath(path)
        # transiciones
        for key, left in (("transitionIn", True), ("transitionOut", False)):
            tin = c.get(key)
            if tin:
                w = min(r.width(), tin["duration"] * self.pps)
                tr_ = QRectF(r.left() if left else r.right() - w, r.top(), w, r.height())
                p.fillRect(tr_, QColor(255, 255, 255, 40))
        # etiqueta
        p.save()
        p.setClipRect(r.adjusted(4, 0, -4, 0).intersected(QRectF(HEAD, 0, self.width(), self.height())))
        f = QFont(); f.setPixelSize(11); f.setBold(True); p.setFont(f)
        label = c.get("text") if c["type"] == "text" else c["name"]
        if c["speed"] != 1:
            label = f"{label}  ×{c['speed']:g}"
        p.setPen(QColor(0, 0, 0, 160))
        p.drawText(QPointF(max(r.left(), HEAD) + 7, r.top() + 15), (label or "").replace("\n", " "))
        p.setPen(QColor("white"))
        p.drawText(QPointF(max(r.left(), HEAD) + 6, r.top() + 14), (label or "").replace("\n", " "))
        p.restore()
        # keyframes
        for kt in all_times(c):
            x = r.left() + kt * self.pps
            if x < r.right() + 1 and x >= HEAD:
                d = QPainterPath()
                cy = r.bottom() - 8
                d.moveTo(x, cy - 5); d.lineTo(x + 5, cy); d.lineTo(x, cy + 5); d.lineTo(x - 5, cy); d.closeSubpath()
                p.fillPath(d, QColor("#ffc933"))
                p.setPen(QPen(QColor("#7a5d00"), 1))
                p.drawPath(d)
        # asas de recorte
        if sel:
            p.fillRect(QRectF(r.left(), r.top(), 5, r.height()), QColor(255, 255, 255, 200))
            p.fillRect(QRectF(r.right() - 5, r.top(), 5, r.height()), QColor(255, 255, 255, 200))

    # ------------------------------------------------------------- ratón
    def hit(self, pos):
        i = self.row_at(pos.y())
        if i < 0:
            return None, -1, None
        for c in self.tracks[i]["clips"]:
            r = self.clip_rect(c, i)
            if r.contains(pos):
                edge = min(9.0, r.width() / 3)
                zone = "l" if pos.x() < r.left() + edge else "r" if pos.x() > r.right() - edge else "body"
                return c, i, zone
        return None, i, None

    def snap_points(self, ignore):
        pts = [0.0, self.ed.t]
        for tr in self.tracks:
            for c in tr["clips"]:
                if c["id"] != ignore:
                    pts += [c["start"], clip_end(c)]
        return pts

    def snap(self, t: float, ignore, extra=()):
        """Imanta t (o t+extra) al punto más cercano si está a <8 px."""
        best, found = None, None
        for off in (0.0,) + tuple(extra):
            for s in self.snap_points(ignore):
                d = abs((t + off) - s) * self.pps
                if d < 8 and (best is None or d < best):
                    best, found = d, (s - off)
        return found

    def mousePressEvent(self, e):
        pos = e.position()
        if e.button() == Qt.MouseButton.RightButton:
            if pos.x() < HEAD:
                i = self.row_at(pos.y())
                if i >= 0:
                    self.track_menu(i, e.globalPosition().toPoint())
                return
            c, i, _ = self.hit(pos)
            if c:
                self.select.emit(c["id"])
                self.menu(c, e.globalPosition().toPoint())
            return
        if e.button() != Qt.MouseButton.LeftButton:
            return
        if pos.y() < RULER and pos.x() >= HEAD:
            self.drag = {"mode": "seek"}
            self.seek.emit(max(0.0, self.t_of(pos.x())))
            return
        if pos.x() < HEAD:
            if pos.y() >= RULER and self.add_rect().contains(pos):
                self.add_menu(e.globalPosition().toPoint())
                return
            i = self.row_at(pos.y())
            if i >= 0:
                tr = self.tracks[i]
                for j, flag in enumerate(("muted" if tr["kind"] == "audio" else "hidden", "locked")):
                    if self._btn_rect(i, j).contains(pos) and not (tr["kind"] == "text" and flag == "hidden" and False):
                        self.ed.doc.mutate(lambda d, i=i, flag=flag: d["tracks"][i].__setitem__(flag, not d["tracks"][i][flag]))
            return
        c, i, zone = self.hit(pos)
        if not c:
            self.select.emit("")
            self.drag = {"mode": "seek"}
            self.seek.emit(max(0.0, self.t_of(pos.x())))
            return
        self.select.emit(c["id"])
        if self.tracks[i]["locked"]:
            return
        self.drag = {"mode": {"l": "trimL", "r": "trimR", "body": "move"}[zone], "cid": c["id"],
                     "x0": pos.x(), "start0": c["start"], "end0": clip_end(c), "moved": False}

    def mouseMoveEvent(self, e):
        pos = e.position()
        d = self.drag
        if not d:
            c, i, zone = self.hit(pos)
            self.setCursor(Qt.CursorShape.SizeHorCursor if zone in ("l", "r") else
                           Qt.CursorShape.OpenHandCursor if zone == "body" else Qt.CursorShape.ArrowCursor)
            return
        if d["mode"] == "seek":
            self.seek.emit(max(0.0, self.t_of(pos.x())))
            return
        dt = (pos.x() - d["x0"]) / self.pps
        if abs(pos.x() - d["x0"]) > 3:
            d["moved"] = True
        if not d["moved"]:
            return
        doc, cid = self.ed.doc, d["cid"]
        c = doc.clip(cid)
        if not c:
            return
        d["snap"] = None
        if d["mode"] == "move":
            ns = max(0.0, d["start0"] + dt)
            s = self.snap(ns, cid, extra=(c["duration"],))
            if s is not None:
                ns = max(0.0, s)
                d["snap"] = s if abs(s - ns) < 1e-6 else s + c["duration"]
                # mostrar la guía en el borde que se imantó
                d["snap"] = next((x for x in self.snap_points(cid) if abs(x - ns) < 1e-6 or abs(x - (ns + c["duration"])) < 1e-6), None)
            row = self.row_at(pos.y())
            tid = self.tracks[row]["id"] if row >= 0 else None
            doc.move_clip(cid, ns, tid)
        elif d["mode"] == "trimL":
            nt = d["start0"] + dt
            s = self.snap(nt, cid)
            if s is not None:
                nt, d["snap"] = s, s
            m = doc.data["media"].get(c.get("mediaId"), {})
            doc.trim_left(cid, nt, m.get("duration", float("inf")))
        elif d["mode"] == "trimR":
            nt = d["end0"] + dt
            s = self.snap(nt, cid)
            if s is not None:
                nt, d["snap"] = s, s
            m = doc.data["media"].get(c.get("mediaId"), {})
            doc.trim_right(cid, nt, m.get("duration", float("inf")) if c["type"] in ("video", "audio") else float("inf"))
        self.update()

    def mouseReleaseEvent(self, e):
        d = self.drag
        self.drag = None
        if d and d.get("mode") in ("move", "trimL", "trimR"):
            self.update()

    def wheelEvent(self, e):
        dy = e.angleDelta().y()
        if e.modifiers() & Qt.KeyboardModifier.ControlModifier:
            t = self.t_of(e.position().x())
            self.pps = max(4.0, min(600.0, self.pps * (1.15 if dy > 0 else 1 / 1.15)))
            self.off = max(0.0, t - (e.position().x() - HEAD) / self.pps)
        elif self.max_yoff() > 0 and not (e.modifiers() & Qt.KeyboardModifier.ShiftModifier) and dy:
            self.yoff = max(0.0, min(self.max_yoff(), self.yoff - dy / 120 * 40))
            self.needs_vscroll_sync.emit()
        else:
            self.off = max(0.0, self.off - (dy or e.angleDelta().x()) / 120 * 60 / self.pps)
        self.needs_scroll_sync.emit()
        self.update()

    def menu(self, c, gpos):
        m = QMenu(self)
        a_split = m.addAction("Dividir en el cabezal")
        a_dup = m.addAction("Duplicar")
        m.addSeparator()
        a_del = m.addAction("Eliminar")
        act = m.exec(gpos)
        if act is a_split:
            self.ed.split_selected()
        elif act is a_dup:
            self.ed.duplicate_selected()
        elif act is a_del:
            self.ed.delete_selected()

    # ---------------------------------------------------------------- capas
    KINDS = (("video", "🎞 Capa de video / imagen / efectos"), ("text", "T Capa de texto"), ("audio", "♪ Capa de audio"))

    def add_menu(self, gpos, index=None):
        m = QMenu(self)
        acts = {m.addAction(label): kind for kind, label in self.KINDS}
        act = m.exec(gpos)
        if act in acts:
            self.ed.doc.add_track(acts[act], index)
            self.after_tracks()

    def track_menu(self, i, gpos):
        tr = self.tracks[i]
        doc = self.ed.doc
        m = QMenu(self)
        a_ren = m.addAction("Renombrar…")
        m.addSeparator()
        sub_a = m.addMenu("Añadir capa encima")
        sub_b = m.addMenu("Añadir capa debajo")
        add = {}
        for kind, label in self.KINDS:
            add[sub_a.addAction(label)] = (kind, i)
            add[sub_b.addAction(label)] = (kind, i + 1)
        a_up = m.addAction("Subir capa")
        a_dn = m.addAction("Bajar capa")
        a_up.setEnabled(i > 0)
        a_dn.setEnabled(i < len(self.tracks) - 1)
        m.addSeparator()
        a_del = m.addAction("Eliminar capa")
        a_del.setEnabled(len(self.tracks) > 1)
        act = m.exec(gpos)
        if act is None:
            return
        if act is a_ren:
            name, ok = QInputDialog.getText(self, "Renombrar capa", "Nombre:", text=tr["name"])
            if ok:
                doc.rename_track(tr["id"], name)
        elif act in add:
            doc.add_track(*add[act])
        elif act is a_up:
            doc.move_track(tr["id"], -1)
        elif act is a_dn:
            doc.move_track(tr["id"], 1)
        elif act is a_del:
            doc.remove_track(tr["id"])
        self.after_tracks()

    def after_tracks(self):
        self.clamp_y()
        self.needs_vscroll_sync.emit()
        self.update()

    # ------------------------------------------------- soltar medios desde el panel
    def dragEnterEvent(self, e):
        if e.mimeData().hasFormat("application/x-linecut-media"):
            e.acceptProposedAction()

    def dragMoveEvent(self, e):
        e.acceptProposedAction()

    def dropEvent(self, e):
        mid = bytes(e.mimeData().data("application/x-linecut-media")).decode()
        pos = e.position()
        row = self.row_at(pos.y())
        tid = self.tracks[row]["id"] if row >= 0 else None
        self.ed.add_media_clip(mid, max(0.0, self.t_of(pos.x())), tid)
        e.acceptProposedAction()

    def ensure_visible(self, t: float):
        w = (self.width() - HEAD) / self.pps
        if t < self.off or t > self.off + w * 0.95:
            self.off = max(0.0, t - w * 0.1)
            self.needs_scroll_sync.emit()


class Timeline(QWidget):
    """Lienzo + barra de desplazamiento horizontal."""

    def __init__(self, editor, parent=None):
        super().__init__(parent)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)
        row = QHBoxLayout()
        row.setSpacing(0)
        self.canvas = TimelineCanvas(editor)
        row.addWidget(self.canvas, 1)
        self.vbar = QScrollBar(Qt.Orientation.Vertical)
        row.addWidget(self.vbar)
        lay.addLayout(row, 1)
        self.bar = QScrollBar(Qt.Orientation.Horizontal)
        lay.addWidget(self.bar)
        self.bar.valueChanged.connect(self._bar)
        self.vbar.valueChanged.connect(self._vbar)
        self.canvas.needs_scroll_sync.connect(self.sync_bar)
        self.canvas.needs_vscroll_sync.connect(self.sync_vbar)
        self.canvas.setMinimumHeight(110)
        self._lock = False

    def _vbar(self, v):
        if self._lock:
            return
        self.canvas.yoff = float(v)
        self.canvas.update()

    def sync_vbar(self):
        self._lock = True
        c = self.canvas
        m = int(c.max_yoff())
        self.vbar.setRange(0, m)
        self.vbar.setPageStep(max(1, c.height()))
        self.vbar.setValue(int(min(c.yoff, m)))
        self.vbar.setVisible(m > 0)
        self._lock = False

    def _bar(self, v):
        if self._lock:
            return
        self.canvas.off = v / 100.0
        self.canvas.update()

    def sync_bar(self):
        self._lock = True
        c = self.canvas
        visible = max(1.0, (c.width() - HEAD) / c.pps)
        total = max(c.total_seconds(), c.off + visible)
        self.bar.setRange(0, int(max(0.0, total - visible) * 100))
        self.bar.setPageStep(int(visible * 100))
        self.bar.setValue(int(c.off * 100))
        self._lock = False

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self.sync_bar()
        self.sync_vbar()

    def zoom(self, factor: float):
        c = self.canvas
        t = c.ed.t
        c.pps = max(4.0, min(600.0, c.pps * factor))
        c.off = max(0.0, t - (c.width() - HEAD) / c.pps / 2)
        self.sync_bar()
        c.update()
