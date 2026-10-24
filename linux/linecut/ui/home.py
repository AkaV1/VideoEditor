"""Pantalla de inicio: proyectos guardados."""
from __future__ import annotations

import time

from PySide6.QtCore import QSize, Qt, Signal
from PySide6.QtGui import QIcon, QPixmap
from PySide6.QtWidgets import (QComboBox, QDialog, QDialogButtonBox, QFormLayout, QHBoxLayout, QInputDialog, QLabel,
                               QLineEdit, QListView, QListWidget, QListWidgetItem, QMenu, QMessageBox, QPushButton,
                               QVBoxLayout, QWidget)

from .. import storage
from ..model import RATIOS
from ..util import assets_dir, fmt_time


class NewProjectDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Nuevo proyecto")
        f = QFormLayout(self)
        self.name = QLineEdit("Proyecto sin título")
        self.ratio = QComboBox()
        for r in RATIOS:
            self.ratio.addItem(r)
        f.addRow("Nombre", self.name)
        f.addRow("Formato", self.ratio)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        f.addRow(bb)


class Home(QWidget):
    new_project = Signal(str, str)
    open_project = Signal(str)
    show_tutorial = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(36, 28, 36, 20)
        head = QHBoxLayout()
        logo = QLabel()
        pm = QPixmap(str(assets_dir() / "logo.png"))
        if not pm.isNull():
            logo.setPixmap(pm.scaledToHeight(44, Qt.TransformationMode.SmoothTransformation))
        head.addWidget(logo)
        t = QLabel("LineCut")
        t.setStyleSheet("font-size:26px;font-weight:700;")
        head.addWidget(t)
        head.addStretch(1)
        tb = QPushButton("¿Cómo se usa?")
        tb.clicked.connect(self.show_tutorial.emit)
        head.addWidget(tb)
        nb = QPushButton("＋ Nuevo proyecto")
        nb.setObjectName("accent")
        nb.clicked.connect(self._new)
        head.addWidget(nb)
        lay.addLayout(head)
        sub = QLabel("Tus proyectos")
        sub.setStyleSheet("color:#8b8b97;margin-top:18px;")
        lay.addWidget(sub)
        self.list = QListWidget()
        self.list.setViewMode(QListView.ViewMode.IconMode)
        self.list.setIconSize(QSize(220, 124))
        self.list.setGridSize(QSize(250, 190))
        self.list.setResizeMode(QListView.ResizeMode.Adjust)
        self.list.setMovement(QListView.Movement.Static)
        self.list.setSpacing(6)
        self.list.itemActivated.connect(lambda it: self.open_project.emit(it.data(Qt.ItemDataRole.UserRole)))
        self.list.itemDoubleClicked.connect(lambda it: self.open_project.emit(it.data(Qt.ItemDataRole.UserRole)))
        self.list.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.list.customContextMenuRequested.connect(self._menu)
        lay.addWidget(self.list, 1)
        self.empty = QLabel("Aún no tienes proyectos.\nPulsa «Nuevo proyecto» para empezar.")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.empty.setStyleSheet("color:#8b8b97;font-size:15px;")
        lay.addWidget(self.empty)

    def reload(self):
        self.list.clear()
        items = storage.list_projects()
        for p in items:
            it = QListWidgetItem(f"{p['name']}\n{p['ratio']} · {fmt_time(p['duration'])} · "
                                 f"{time.strftime('%d/%m/%Y', time.localtime(p['updated']))}")
            it.setData(Qt.ItemDataRole.UserRole, p["id"])
            if p["thumb"]:
                it.setIcon(QIcon(QPixmap(p["thumb"]).scaled(220, 124, Qt.AspectRatioMode.KeepAspectRatio,
                                                           Qt.TransformationMode.SmoothTransformation)))
            else:
                pm = QPixmap(220, 124)
                pm.fill(Qt.GlobalColor.black)
                it.setIcon(QIcon(pm))
            self.list.addItem(it)
        self.empty.setVisible(not items)
        self.list.setVisible(bool(items))

    def _new(self):
        d = NewProjectDialog(self)
        if d.exec():
            self.new_project.emit(d.name.text().strip() or "Proyecto sin título", d.ratio.currentText())

    def _menu(self, pos):
        it = self.list.itemAt(pos)
        if not it:
            return
        pid = it.data(Qt.ItemDataRole.UserRole)
        m = QMenu(self)
        a_open, a_ren, a_dup, a_del = (m.addAction(x) for x in ("Abrir", "Renombrar", "Duplicar", "Eliminar"))
        act = m.exec(self.list.mapToGlobal(pos))
        if act is a_open:
            self.open_project.emit(pid)
        elif act is a_ren:
            name, ok = QInputDialog.getText(self, "Renombrar", "Nombre:", text=it.text().split("\n")[0])
            if ok:
                storage.rename(pid, name)
                self.reload()
        elif act is a_dup:
            storage.duplicate(pid)
            self.reload()
        elif act is a_del:
            if QMessageBox.question(self, "Eliminar", "¿Eliminar este proyecto y sus medios? No se puede deshacer.") \
                    == QMessageBox.StandardButton.Yes:
                storage.delete(pid)
                self.reload()
