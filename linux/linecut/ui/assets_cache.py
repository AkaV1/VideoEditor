"""Miniaturas y formas de onda calculadas en segundo plano para la línea de tiempo."""
from __future__ import annotations

import numpy as np
from PySide6.QtCore import QObject, QRunnable, Qt, QThreadPool, Signal
from PySide6.QtGui import QImage, QPixmap

from .. import media as M


def to_pixmap(arr: np.ndarray) -> QPixmap:
    h, w, _ = arr.shape
    img = QImage(arr.data, w, h, w * 3, QImage.Format.Format_RGB888).copy()
    return QPixmap.fromImage(img)


class _Sig(QObject):
    done = Signal(str, object, object)


class _Job(QRunnable):
    def __init__(self, mid: str, path: str, item: dict, sig: _Sig):
        super().__init__()
        self.mid, self.path, self.item, self.sig = mid, path, item, sig

    def run(self):
        thumbs, peaks = None, None
        try:
            if self.item["kind"] == "video" and self.item.get("width"):
                aspect = self.item["width"] / max(1, self.item["height"])
                thumbs = M.thumbnails(self.path, self.item["duration"], aspect, count=24, height=56)
            if self.item["kind"] in ("video", "audio") and self.item.get("hasAudio", self.item["kind"] == "audio"):
                peaks = M.waveform(self.path)
        except Exception:
            pass
        self.sig.done.emit(self.mid, thumbs, peaks)


class AssetCache(QObject):
    updated = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.thumbs: dict[str, list[QPixmap]] = {}
        self.peaks: dict[str, list[int]] = {}
        self.pending: set[str] = set()
        self.sig = _Sig()
        self.sig.done.connect(self._done)
        self.pool = QThreadPool()
        self.pool.setMaxThreadCount(2)
        self.doc = None
        self.paths: dict[str, str] = {}
        self.posters: dict[str, QPixmap] = {}

    def attach(self, doc, paths: dict[str, str]):
        self.doc, self.paths = doc, paths
        self.thumbs.clear(); self.peaks.clear(); self.pending.clear(); self.posters.clear()

    def ensure(self, mid: str):
        if mid in self.pending or self.doc is None:
            return
        item = self.doc.data["media"].get(mid)
        path = self.paths.get(mid)
        if not item or not path:
            return
        if item.get("peaks"):
            self.peaks[mid] = item["peaks"]
        self.pending.add(mid)
        self.pool.start(_Job(mid, path, item, self.sig))

    def _done(self, mid: str, thumbs, peaks):
        if thumbs:
            self.thumbs[mid] = [to_pixmap(t) for t in thumbs]
        if peaks:
            self.peaks[mid] = peaks
            item = self.doc.data["media"].get(mid) if self.doc else None
            if item is not None:
                item["peaks"] = peaks
                self.doc.dirty = True
        self.updated.emit()

    def poster(self, mid: str, size: int = 64) -> QPixmap | None:
        if mid in self.posters:
            return self.posters[mid]
        item = self.doc.data["media"].get(mid) if self.doc else None
        path = self.paths.get(mid)
        if not item or not path:
            return None
        pm = None
        try:
            if item["kind"] == "image":
                pm = QPixmap(path).scaledToHeight(size, Qt.TransformationMode.SmoothTransformation)
            elif item["kind"] == "video":
                fr = M.thumbnails(path, min(item["duration"], 1.0), item["width"] / max(1, item["height"]), count=1, height=size)
                if fr:
                    pm = to_pixmap(fr[0])
        except Exception:
            pm = None
        if pm is not None:
            self.posters[mid] = pm
        return pm
