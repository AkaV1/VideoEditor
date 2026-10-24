"""Controles reutilizables: deslizador con campo numérico y rombo de keyframe, selector de color."""
from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QColorDialog, QDoubleSpinBox, QHBoxLayout, QLabel, QPushButton, QSlider, QToolButton,
                               QWidget)

from .theme import ACCENT, MUTED


class PropSlider(QWidget):
    """Etiqueta + (rombo de keyframe) + deslizador + campo numérico."""
    changed = Signal(float)
    diamond_clicked = Signal()

    def __init__(self, label: str, lo: float, hi: float, step: float = 1.0, unit: str = "", decimals: int = 0,
                 hard_max: float | None = None, with_kf: bool = False, parent=None):
        super().__init__(parent)
        self.lo, self.hi, self.step = lo, hi, step
        self.scale = 10 ** decimals
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(6)
        self.label = QLabel(label)
        self.label.setFixedWidth(78)
        self.label.setStyleSheet(f"color:#b7b7c2;font-size:12px;")
        lay.addWidget(self.label)
        self.kf = QToolButton()
        self.kf.setFixedWidth(22)
        self.kf.setText("◇")
        self.kf.setToolTip("Añadir/quitar keyframe en el cabezal")
        self.kf.clicked.connect(self.diamond_clicked)
        self.kf.setVisible(with_kf)
        lay.addWidget(self.kf)
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(int(lo * self.scale), int(hi * self.scale))
        self.slider.valueChanged.connect(self._on_slider)
        lay.addWidget(self.slider, 1)
        self.spin = QDoubleSpinBox()
        self.spin.setDecimals(decimals)
        self.spin.setRange(lo, hard_max if hard_max is not None else hi)
        self.spin.setSingleStep(step)
        self.spin.setSuffix(unit)
        self.spin.setFixedWidth(78)
        self.spin.setButtonSymbols(QDoubleSpinBox.ButtonSymbols.NoButtons)
        self.spin.setAlignment(Qt.AlignmentFlag.AlignRight)
        self.spin.valueChanged.connect(self._on_spin)
        lay.addWidget(self.spin)
        self._lock = False

    def _on_slider(self, v: int):
        if self._lock:
            return
        val = v / self.scale
        self._lock = True
        self.spin.setValue(val)
        self._lock = False
        self.changed.emit(val)

    def _on_spin(self, val: float):
        if self._lock:
            return
        self._lock = True
        self.slider.setValue(int(round(max(self.lo, min(self.hi, val)) * self.scale)))
        self._lock = False
        self.changed.emit(val)

    def set_value(self, val: float):
        self._lock = True
        self.spin.setValue(val)
        self.slider.setValue(int(round(max(self.lo, min(self.hi, val)) * self.scale)))
        self._lock = False

    def set_kf_state(self, state: str):
        """'off' | 'near' | 'on'"""
        self.kf.setText("◆" if state == "on" else "◇")
        color = "#ffc933" if state in ("on", "near") else MUTED
        self.kf.setStyleSheet(f"color:{color};font-size:15px;")


class ColorButton(QPushButton):
    changed = Signal(str)

    def __init__(self, color: str = "#ffffff", parent=None):
        super().__init__(parent)
        self.setFixedSize(46, 24)
        self._color = color
        self._paint()
        self.clicked.connect(self._pick)

    def _paint(self):
        self.setStyleSheet(f"background:{self._color};border:1px solid #555;border-radius:5px;")

    def set_color(self, c: str):
        self._color = c
        self._paint()

    def _pick(self):
        col = QColorDialog.getColor(QColor(self._color), self, "Color")
        if col.isValid():
            self._color = col.name()
            self._paint()
            self.changed.emit(self._color)


def section_label(text: str) -> QLabel:
    lb = QLabel(text.upper())
    lb.setStyleSheet(f"color:{MUTED};font-size:11px;font-weight:600;letter-spacing:1px;padding-top:6px;")
    return lb
