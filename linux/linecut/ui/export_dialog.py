"""Diálogo de exportación: el render corre en un hilo y escribe un MP4 con ffmpeg."""
from __future__ import annotations

import copy
from pathlib import Path

from PySide6.QtCore import QObject, QThread, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (QComboBox, QDialog, QFileDialog, QFormLayout, QHBoxLayout, QLabel, QLineEdit,
                               QProgressBar, QPushButton, QVBoxLayout)

from ..export import Cancelled, export_project, export_size
from ..model import calc_duration


class Worker(QObject):
    progress = Signal(float, str)
    finished = Signal(str)
    failed = Signal(str)

    def __init__(self, project, paths, out, res, fps):
        super().__init__()
        self.project, self.paths, self.out, self.res, self.fps = project, paths, out, res, fps
        self._cancel = False

    def cancel(self):
        self._cancel = True

    def run(self):
        try:
            export_project(self.project, self.paths, self.out, self.res, self.fps,
                           progress=lambda p, m: self.progress.emit(p, m), cancelled=lambda: self._cancel)
            self.finished.emit(self.out)
        except Cancelled:
            self.failed.emit("Exportación cancelada")
        except Exception as e:  # noqa: BLE001
            self.failed.emit(str(e))


class ExportDialog(QDialog):
    def __init__(self, doc, paths, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Exportar video")
        self.setMinimumWidth(460)
        self.doc, self.paths = doc, paths
        self.thread_: QThread | None = None
        self.worker: Worker | None = None
        lay = QVBoxLayout(self)
        form = QFormLayout()
        self.res = QComboBox()
        for r in (480, 720, 1080, 1440, 2160):
            self.res.addItem(f"{r}p", r)
        self.res.setCurrentIndex(max(0, self.res.findData(doc.data["res"])))
        self.fps = QComboBox()
        for f in (24, 30, 60):
            self.fps.addItem(f"{f} fps", f)
        self.fps.setCurrentIndex(max(0, self.fps.findData(doc.data["fps"])))
        form.addRow("Resolución", self.res)
        form.addRow("Fotogramas", self.fps)
        row = QHBoxLayout()
        videos = Path.home() / "Videos"
        base = videos if videos.exists() else Path.home()
        safe = "".join(ch for ch in doc.data["name"] if ch.isalnum() or ch in " -_") or "LineCut"
        self.path = QLineEdit(str(base / f"{safe}.mp4"))
        pick = QPushButton("…")
        pick.setFixedWidth(34)
        pick.clicked.connect(self._pick)
        row.addWidget(self.path, 1)
        row.addWidget(pick)
        form.addRow("Guardar en", row)
        lay.addLayout(form)
        self.info = QLabel()
        self.info.setStyleSheet("color:#8b8b97;")
        lay.addWidget(self.info)
        self.bar = QProgressBar()
        self.bar.setRange(0, 1000)
        self.bar.hide()
        lay.addWidget(self.bar)
        self.status = QLabel("")
        lay.addWidget(self.status)
        btns = QHBoxLayout()
        btns.addStretch(1)
        self.cancel_b = QPushButton("Cancelar")
        self.cancel_b.clicked.connect(self._cancel)
        self.go = QPushButton("Exportar")
        self.go.setObjectName("accent")
        self.go.clicked.connect(self.start)
        self.open_b = QPushButton("Abrir carpeta")
        self.open_b.clicked.connect(self._open_folder)
        self.open_b.hide()
        btns.addWidget(self.open_b)
        btns.addWidget(self.cancel_b)
        btns.addWidget(self.go)
        lay.addLayout(btns)
        self.res.currentIndexChanged.connect(self._upd)
        self._upd()

    def _upd(self):
        w, h = export_size(self.doc.data, self.res.currentData())
        self.info.setText(f"{w}×{h} · {calc_duration(self.doc.tracks):.1f} s · MP4 (H.264 + AAC)")

    def _pick(self):
        p, _ = QFileDialog.getSaveFileName(self, "Guardar video", self.path.text(), "Video MP4 (*.mp4)")
        if p:
            self.path.setText(p if p.lower().endswith(".mp4") else p + ".mp4")

    def start(self):
        out = self.path.text().strip()
        if not out:
            return
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        self.go.setEnabled(False)
        self.res.setEnabled(False); self.fps.setEnabled(False); self.path.setEnabled(False)
        self.bar.show()
        self.status.setText("Preparando…")
        self.worker = Worker(copy.deepcopy(self.doc.data), dict(self.paths), out, self.res.currentData(),
                             self.fps.currentData())
        self.thread_ = QThread(self)
        self.worker.moveToThread(self.thread_)
        self.thread_.started.connect(self.worker.run)
        self.worker.progress.connect(self._progress)
        self.worker.finished.connect(self._done)
        self.worker.failed.connect(self._fail)
        self.thread_.start()

    def _progress(self, p, msg):
        self.bar.setValue(int(p * 1000))
        self.status.setText(msg or f"{p * 100:.0f} %")

    def _end_thread(self):
        if self.thread_:
            self.thread_.quit()
            self.thread_.wait(5000)

    def _done(self, out):
        self._end_thread()
        self.bar.setValue(1000)
        self.status.setText(f"✔ Video guardado en:\n{out}")
        self.cancel_b.setText("Cerrar")
        self.open_b.show()
        self.finished_ok = True

    def _fail(self, msg):
        self._end_thread()
        self.status.setText(f"✖ {msg}")
        self.go.setEnabled(True)
        self.res.setEnabled(True); self.fps.setEnabled(True); self.path.setEnabled(True)
        self.bar.hide()

    def _cancel(self):
        if self.worker and self.thread_ and self.thread_.isRunning():
            self.worker.cancel()
            self.status.setText("Cancelando…")
        else:
            self.reject()

    def _open_folder(self):
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(Path(self.path.text()).parent)))

    def closeEvent(self, e):
        if self.worker and self.thread_ and self.thread_.isRunning():
            self.worker.cancel()
            self.thread_.quit()
            self.thread_.wait(8000)
        super().closeEvent(e)

    def reject(self):
        if self.worker and self.thread_ and self.thread_.isRunning():
            self.worker.cancel()
            self.thread_.quit()
            self.thread_.wait(8000)
        super().reject()
