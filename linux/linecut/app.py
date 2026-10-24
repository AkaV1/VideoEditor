"""Ventana principal, arranque y autoprueba."""
from __future__ import annotations

import os
import sys

from PySide6.QtCore import QTimer
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication, QMainWindow, QStackedWidget

from . import __version__, storage
from .model import Document, new_project
from .render import render_frame
from .util import assets_dir, data_dir
from .ui.editor import Editor
from .ui.export_dialog import ExportDialog
from .ui.home import Home
from .ui.theme import QSS
from .ui.tutorial import TutorialDialog


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LineCut")
        self.setWindowIcon(QIcon(str(assets_dir() / "logo.png")))
        self.resize(1360, 820)
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)
        self.home = Home()
        self.editor = Editor()
        self.stack.addWidget(self.home)
        self.stack.addWidget(self.editor)
        self.home.new_project.connect(self.create)
        self.home.open_project.connect(self.open)
        self.home.show_tutorial.connect(self.tutorial)
        self.editor.back.connect(self.go_home)
        self.editor.export_requested.connect(self.export)
        self.autosave = QTimer(self)
        self.autosave.setInterval(2500)
        self.autosave.timeout.connect(self.save)
        self.autosave.start()
        self.home.reload()

    # ------------------------------------------------------------ acciones
    def create(self, name: str, ratio: str):
        doc = Document(new_project(name, ratio))
        storage.create(doc)
        self.edit(doc)

    def open(self, pid: str):
        self.edit(storage.load(pid))

    def edit(self, doc: Document):
        self.editor.open_doc(doc)
        self.stack.setCurrentWidget(self.editor)

    def save(self):
        d = self.editor.doc
        if d is not None and d.dirty and self.stack.currentWidget() is self.editor:
            storage.save(d)

    def go_home(self):
        d = self.editor.doc
        if d is not None:
            self.editor.stop()
            self._save_thumb()
            storage.save(d)
            self.editor.close_doc()
            self.editor.doc = None
        self.stack.setCurrentWidget(self.home)
        self.home.reload()

    def _save_thumb(self):
        try:
            d = self.editor.doc
            if d.duration <= 0:
                return
            fr = render_frame(d.data, min(0.5, d.duration / 2), 320, 180 if d.data["ratio"] == "16:9" else 320,
                              self.editor.provider)
            storage.save_thumb(d, fr)
        except Exception:
            pass

    def export(self):
        d = self.editor.doc
        if d.duration <= 0:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.information(self, "LineCut", "Añade algún clip a la línea de tiempo antes de exportar.")
            return
        self.editor.stop()
        storage.save(d)
        ExportDialog(d, self.editor.paths, self).exec()

    def tutorial(self):
        TutorialDialog(self).exec()

    def closeEvent(self, e):
        if self.editor.doc is not None:
            self.editor.stop()
            storage.save(self.editor.doc)
            self.editor.close_doc()
        super().closeEvent(e)


def make_app(argv) -> QApplication:
    app = QApplication(argv)
    app.setApplicationName("LineCut")
    app.setApplicationVersion(__version__)
    app.setDesktopFileName("linecut")
    app.setStyle("Fusion")
    app.setStyleSheet(QSS)
    return app


def main(argv=None) -> int:
    argv = list(sys.argv if argv is None else argv)
    if "--selftest" in argv:
        from .selftest import run
        return run(argv)
    app = make_app(argv)
    w = MainWindow()
    w.show()
    flag = data_dir() / "tutorial_done"
    if not flag.exists():
        flag.write_text("1")
        QTimer.singleShot(400, w.tutorial)
    return app.exec()
