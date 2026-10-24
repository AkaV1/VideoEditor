"""Tutorial de primer uso."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QHBoxLayout, QLabel, QPushButton, QStackedWidget, QVBoxLayout, QWidget

STEPS = [
    ("Bienvenido a LineCut", "Un editor de video para tu escritorio.\nVamos a ver lo básico en un minuto."),
    ("1 · Crea un proyecto", "En la pantalla de inicio pulsa «Nuevo proyecto» y elige el formato:\n16:9, 9:16, 1:1 o 4:3."),
    ("2 · Importa tus medios", "En el panel «Medios» pulsa «Importar medios» o arrastra archivos a la ventana.\n"
                              "Haz doble clic en un medio, o arrástralo, para ponerlo en la línea de tiempo."),
    ("3 · Edita en la línea de tiempo", "Arrastra un clip para moverlo. Tira de sus bordes para recortarlo.\n"
                                       "Pon el cabezal rojo donde quieras y pulsa «Dividir» (o la tecla S) para cortar.\n"
                                       "Ctrl + rueda del ratón = zoom."),
    ("4 · Ajusta el clip", "Con un clip seleccionado, el panel derecho te deja cambiar posición, escala, rotación,\n"
                           "opacidad, color, filtros, velocidad, volumen y transiciones de entrada y salida.\n"
                           "También puedes mover y escalar directamente en la vista previa."),
    ("5 · Keyframes ◆", "Pulsa el rombo ◇ junto a una propiedad para fijar un keyframe en la posición del cabezal.\n"
                        "Mueve el cabezal, cambia el valor y se crea otro: la propiedad se animará entre ellos."),
    ("6 · Texto", "En la pestaña «Texto» elige una plantilla. Edita su contenido, fuente, color, contorno y fondo\n"
                  "en el panel derecho."),
    ("7 · Exporta", "Pulsa «Exportar», elige resolución y dónde guardarlo. Se genera un MP4 listo para compartir.\n"
                    "Tu trabajo se guarda solo."),
]


class TutorialDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Tutorial")
        self.setMinimumSize(560, 340)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(28, 24, 28, 18)
        self.stack = QStackedWidget()
        for title, body in STEPS:
            w = QWidget()
            l = QVBoxLayout(w)
            t = QLabel(title)
            t.setStyleSheet("font-size:22px;font-weight:700;color:#ff4d58;")
            b = QLabel(body)
            b.setWordWrap(True)
            b.setStyleSheet("font-size:14px;color:#d8d8e0;")
            b.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
            l.addWidget(t)
            l.addSpacing(10)
            l.addWidget(b, 1)
            self.stack.addWidget(w)
        lay.addWidget(self.stack, 1)
        self.dots = QLabel()
        self.dots.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self.dots)
        row = QHBoxLayout()
        skip = QPushButton("Saltar")
        skip.clicked.connect(self.accept)
        self.prev = QPushButton("Atrás")
        self.prev.clicked.connect(lambda: self._go(-1))
        self.next = QPushButton("Siguiente")
        self.next.setObjectName("accent")
        self.next.clicked.connect(lambda: self._go(1))
        row.addWidget(skip)
        row.addStretch(1)
        row.addWidget(self.prev)
        row.addWidget(self.next)
        lay.addLayout(row)
        self._upd()

    def _go(self, d):
        i = self.stack.currentIndex() + d
        if i >= self.stack.count():
            self.accept()
            return
        self.stack.setCurrentIndex(max(0, i))
        self._upd()

    def _upd(self):
        i, n = self.stack.currentIndex(), self.stack.count()
        self.dots.setText(" ".join("●" if k == i else "○" for k in range(n)))
        self.dots.setStyleSheet("color:#f2323f;letter-spacing:2px;")
        self.prev.setEnabled(i > 0)
        self.next.setText("Empezar" if i == n - 1 else "Siguiente")
