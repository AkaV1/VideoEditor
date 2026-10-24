"""Pantalla del editor: medios, vista previa, línea de tiempo e inspector."""
from __future__ import annotations

import copy
import hashlib
import time
from pathlib import Path

import numpy as np
from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QMimeData, QSize, Qt, QTimer, Signal
from PySide6.QtGui import QAction, QIcon, QKeySequence, QPixmap, QShortcut, QDrag
from PySide6.QtWidgets import (QComboBox, QFileDialog, QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem,
                               QMessageBox, QPushButton, QSlider, QSplitter, QTabWidget, QToolButton, QVBoxLayout,
                               QWidget, QListView)

from .. import audio, storage
from ..media import FrameProvider, kind_of
from ..model import (RATIOS, TEXT_TEMPLATES, Document, clip_end, media_clip, text_clip)
from ..util import fmt_time
from .assets_cache import AssetCache
from .inspector import Inspector
from .preview import PreviewView
from .timeline import Timeline


class MediaList(QListWidget):
    def __init__(self):
        super().__init__()
        self.setViewMode(QListView.ViewMode.IconMode)
        self.setIconSize(QSize(88, 56))
        self.setGridSize(QSize(104, 92))
        self.setResizeMode(QListView.ResizeMode.Adjust)
        self.setMovement(QListView.Movement.Static)
        self.setWordWrap(True)
        self.setDragEnabled(True)
        self.setSelectionMode(QListWidget.SelectionMode.SingleSelection)

    def mimeData(self, items):
        md = QMimeData()
        if items:
            md.setData("application/x-linecut-media", QByteArray(items[0].data(Qt.ItemDataRole.UserRole).encode()))
        return md


class AudioPlayer:
    """Reproduce la mezcla del proyecto con QAudioSink (si hay dispositivo de salida)."""

    def __init__(self):
        self.sink = None
        self.buf = None
        self.mix_key = None
        self.pcm: bytes = b""
        try:
            from PySide6.QtMultimedia import QAudioFormat, QAudioSink, QMediaDevices
            dev = QMediaDevices.defaultAudioOutput()
            if dev.isNull():
                return
            fmt = QAudioFormat()
            fmt.setSampleRate(audio.SR)
            fmt.setChannelCount(2)
            fmt.setSampleFormat(QAudioFormat.SampleFormat.Int16)
            self.sink = QAudioSink(dev, fmt)
        except Exception:
            self.sink = None

    def prepare(self, doc: Document, paths: dict[str, str]):
        if self.sink is None:
            return
        key = hashlib.md5((doc.to_json()).encode()).hexdigest()
        if key == self.mix_key:
            return
        proj = doc.data
        if not audio.has_audio_clips(proj, proj["media"]):
            self.pcm = b""
        else:
            m = audio.mix(proj, proj["media"], paths)
            self.pcm = (np.clip(m, -1, 1) * 32767).astype("<i2").tobytes()
        self.mix_key = key

    def play(self, t: float):
        self.stop()
        if self.sink is None or not self.pcm:
            return
        off = int(t * audio.SR) * 4
        if off >= len(self.pcm):
            return
        self.buf = QBuffer()
        self.buf.setData(QByteArray(self.pcm[off:]))
        self.buf.open(QIODevice.OpenModeFlag.ReadOnly)
        self.sink.start(self.buf)

    def stop(self):
        if self.sink is not None:
            try:
                self.sink.stop()
            except Exception:
                pass
        self.buf = None


class Editor(QWidget):
    back = Signal()
    export_requested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.doc: Document | None = None
        self.paths: dict[str, str] = {}
        self.provider: FrameProvider | None = None
        self.t = 0.0
        self.sel: str | None = None
        self.playing = False
        self._play_t0 = 0.0
        self._play_wall = 0.0
        self.assets = AssetCache(self)
        self.audio = AudioPlayer()
        self._rendering = False
        self._pending = False

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)
        root.addWidget(self._topbar())

        # --- zona central
        self.media_list = MediaList()
        self.media_list.itemDoubleClicked.connect(lambda it: self.add_media_clip(it.data(Qt.ItemDataRole.UserRole)))
        left = QTabWidget()
        mw = QWidget()
        ml = QVBoxLayout(mw)
        ml.setContentsMargins(8, 8, 8, 8)
        imp = QPushButton("＋ Importar medios")
        imp.setObjectName("accent")
        imp.clicked.connect(self.import_dialog)
        ml.addWidget(imp)
        hint = QLabel("Doble clic o arrastra a la línea de tiempo")
        hint.setStyleSheet("color:#8b8b97;font-size:11px;")
        ml.addWidget(hint)
        ml.addWidget(self.media_list, 1)
        left.addTab(mw, "Medios")
        tw = QWidget()
        tl = QVBoxLayout(tw)
        tl.setContentsMargins(8, 8, 8, 8)
        for tpl in TEXT_TEMPLATES:
            b = QPushButton(f"{tpl[0]}  —  {tpl[1]}")
            b.clicked.connect(lambda _=False, t=tpl: self.add_text(t))
            tl.addWidget(b)
        tl.addStretch(1)
        left.addTab(tw, "Texto")
        left.setMinimumWidth(250)
        left.setMaximumWidth(340)

        self.preview = PreviewView(self)
        self.preview.select_clip.connect(self.select)
        centre = QWidget()
        cl = QVBoxLayout(centre)
        cl.setContentsMargins(0, 0, 0, 0)
        cl.setSpacing(0)
        cl.addWidget(self.preview, 1)
        cl.addWidget(self._transport())

        self.inspector = Inspector(self)
        self.inspector.setMinimumWidth(310)
        self.inspector.setMaximumWidth(400)

        top = QSplitter(Qt.Orientation.Horizontal)
        top.addWidget(left)
        top.addWidget(centre)
        top.addWidget(self.inspector)
        top.setStretchFactor(1, 1)
        top.setSizes([280, 700, 340])

        self.timeline = Timeline(self)
        self.timeline.canvas.seek.connect(self.set_time)
        self.timeline.canvas.select.connect(self.select)
        self.assets.updated.connect(self.timeline.canvas.update)
        bottom = QWidget()
        bl = QVBoxLayout(bottom)
        bl.setContentsMargins(0, 0, 0, 0)
        bl.setSpacing(0)
        bl.addWidget(self._tl_toolbar())
        bl.addWidget(self.timeline, 1)

        vs = QSplitter(Qt.Orientation.Vertical)
        vs.addWidget(top)
        vs.addWidget(bottom)
        vs.setStretchFactor(0, 3)
        vs.setStretchFactor(1, 2)
        vs.setSizes([520, 280])
        root.addWidget(vs, 1)

        self.timer = QTimer(self)
        self.timer.setInterval(15)
        self.timer.timeout.connect(self._tick)
        self._shortcuts()
        self.setAcceptDrops(True)

    # ------------------------------------------------------------- piezas UI
    def _topbar(self) -> QWidget:
        w = QWidget()
        w.setObjectName("panel")
        l = QHBoxLayout(w)
        l.setContentsMargins(10, 6, 10, 6)
        b = QToolButton(); b.setText("‹ Proyectos"); b.clicked.connect(self.back.emit)
        l.addWidget(b)
        self.name_edit = QLineEdit()
        self.name_edit.setFixedWidth(240)
        self.name_edit.editingFinished.connect(self._rename)
        l.addWidget(self.name_edit)
        self.undo_b = QToolButton(); self.undo_b.setText("↶"); self.undo_b.setToolTip("Deshacer (Ctrl+Z)")
        self.redo_b = QToolButton(); self.redo_b.setText("↷"); self.redo_b.setToolTip("Rehacer (Ctrl+Shift+Z)")
        self.undo_b.clicked.connect(lambda: self.doc.undo())
        self.redo_b.clicked.connect(lambda: self.doc.redo())
        l.addWidget(self.undo_b); l.addWidget(self.redo_b)
        l.addStretch(1)
        self.ratio = QComboBox()
        for r in RATIOS:
            self.ratio.addItem(r, r)
        self.ratio.activated.connect(self._ratio)
        l.addWidget(QLabel("Formato"))
        l.addWidget(self.ratio)
        ex = QPushButton("Exportar")
        ex.setObjectName("accent")
        ex.clicked.connect(self.export_requested.emit)
        l.addWidget(ex)
        return w

    def _transport(self) -> QWidget:
        w = QWidget()
        w.setObjectName("panel")
        l = QHBoxLayout(w)
        l.setContentsMargins(10, 5, 10, 5)
        self.time_lbl = QLabel("00:00.0 / 00:00.0")
        self.time_lbl.setStyleSheet("font-family:monospace;")
        l.addWidget(self.time_lbl)
        l.addStretch(1)
        for txt, tip, fn in (("⏮", "Inicio", lambda: self.set_time(0)),
                             ("◀", "Fotograma anterior", lambda: self.step(-1)),
                             ("▶", "Reproducir / pausa (Espacio)", self.toggle_play),
                             ("▶|", "Fotograma siguiente", lambda: self.step(1))):
            b = QToolButton(); b.setText(txt); b.setToolTip(tip); b.clicked.connect(fn)
            b.setStyleSheet("font-size:16px;padding:4px 10px;")
            if txt == "▶":
                self.play_b = b
            l.addWidget(b)
        l.addStretch(1)
        return w

    def _tl_toolbar(self) -> QWidget:
        w = QWidget()
        w.setObjectName("panel")
        l = QHBoxLayout(w)
        l.setContentsMargins(10, 4, 10, 4)
        for txt, tip, fn in (("✂ Dividir", "Dividir en el cabezal (S)", lambda: self.split_selected()),
                             ("⧉ Duplicar", "Duplicar clip", lambda: self.duplicate_selected()),
                             ("🗑 Eliminar", "Eliminar clip (Supr)", lambda: self.delete_selected())):
            b = QToolButton(); b.setText(txt); b.setToolTip(tip); b.clicked.connect(fn)
            l.addWidget(b)
        l.addStretch(1)
        l.addWidget(QLabel("Zoom"))
        mi = QToolButton(); mi.setText("−"); mi.clicked.connect(lambda: self.timeline.zoom(1 / 1.3))
        pl = QToolButton(); pl.setText("＋"); pl.clicked.connect(lambda: self.timeline.zoom(1.3))
        l.addWidget(mi); l.addWidget(pl)
        return w

    def _shortcuts(self):
        def sc(keys, fn):
            for k in keys if isinstance(keys, list) else [keys]:
                QShortcut(QKeySequence(k), self, activated=fn)
        sc("Space", self.toggle_play)
        sc("S", lambda: self.split_selected())
        sc(["Delete", "Backspace"], lambda: self.delete_selected())
        sc("Ctrl+Z", lambda: self.doc.undo())
        sc(["Ctrl+Shift+Z", "Ctrl+Y"], lambda: self.doc.redo())
        sc("Left", lambda: self.step(-1))
        sc("Right", lambda: self.step(1))
        sc("Home", lambda: self.set_time(0))

    # --------------------------------------------------------------- carga
    def open_doc(self, doc: Document):
        self.stop()
        if self.provider:
            self.provider.close()
        self.doc = doc
        self.t = 0.0
        self.sel = None
        self.paths = storage.media_paths(doc)
        self.provider = FrameProvider(self.paths, doc.data["media"], doc.data["fps"])
        self.assets.attach(doc, self.paths)
        doc.on_change(self._on_change)
        self.name_edit.setText(doc.data["name"])
        self.ratio.setCurrentIndex(max(0, self.ratio.findData(doc.data["ratio"])))
        self.inspector.built_for = "x"
        self.timeline.canvas.off = 0
        self._fill_media()
        self._on_change()

    def close_doc(self):
        self.stop()
        if self.provider:
            self.provider.close()
            self.provider = None

    def _fill_media(self):
        self.media_list.clear()
        for mid, m in self.doc.data["media"].items():
            it = QListWidgetItem(m["name"][:16])
            it.setData(Qt.ItemDataRole.UserRole, mid)
            it.setToolTip(f"{m['name']}  ·  {fmt_time(m['duration'])}")
            pm = self.assets.poster(mid, 56) if m["kind"] != "audio" else None
            if pm:
                it.setIcon(QIcon(pm))
            else:
                it.setText("♪ " + m["name"][:14])
            self.media_list.addItem(it)

    # ------------------------------------------------------------- estado
    def selected_clip(self):
        return self.doc.clip(self.sel) if self.doc and self.sel else None

    def select(self, cid: str):
        self.sel = cid or None
        self._on_change(skip_preview=False)

    def _on_change(self, skip_preview=False):
        if self.doc is None:
            return
        if self.sel and not self.doc.clip(self.sel):
            self.sel = None
        self.t = min(self.t, max(self.doc.duration, 0.0))
        self.undo_b.setEnabled(bool(self.doc.past))
        self.redo_b.setEnabled(bool(self.doc.future))
        r = self.doc.data["ratio"]
        if self.ratio.currentData() != r:
            self.ratio.setCurrentIndex(max(0, self.ratio.findData(r)))
        self.inspector.refresh()
        self.timeline.canvas.update()
        self.timeline.sync_bar()
        self._update_time()
        if not self.playing:
            self.render_now()

    def _update_time(self):
        self.time_lbl.setText(f"{fmt_time(self.t)} / {fmt_time(self.doc.duration)}")

    def render_now(self):
        if self.doc is None or self.provider is None:
            return
        self.preview.refresh()

    def _rename(self):
        n = self.name_edit.text().strip() or "Proyecto sin título"
        self.doc.mutate(lambda d: d.__setitem__("name", n))

    def _ratio(self, _i):
        r = self.ratio.currentData()
        self.doc.mutate(lambda d: d.__setitem__("ratio", r))

    # ------------------------------------------------------------- tiempo
    def set_time(self, t: float):
        self.t = max(0.0, min(t, max(self.doc.duration, 0.0)))
        if self.playing:
            self._play_t0, self._play_wall = self.t, time.monotonic()
            self.audio.play(self.t)
        self.inspector.refresh()
        self._update_time()
        self.timeline.canvas.update()
        if not self.playing:
            self.render_now()

    def step(self, n: int):
        self.set_time(self.t + n / self.doc.data["fps"])

    def toggle_play(self):
        if self.playing:
            self.stop()
        else:
            self.play()

    def play(self):
        if self.doc.duration <= 0:
            return
        if self.t >= self.doc.duration - 0.05:
            self.t = 0.0
        QApplication_setOverride()
        try:
            self.audio.prepare(self.doc, self.paths)
        finally:
            QApplication_restore()
        self.playing = True
        self.play_b.setText("⏸")
        self._play_t0, self._play_wall = self.t, time.monotonic()
        self.audio.play(self.t)
        self.timer.start()

    def stop(self):
        was = self.playing
        self.playing = False
        self.timer.stop()
        self.audio.stop()
        if hasattr(self, "play_b"):
            self.play_b.setText("▶")
        if was and self.doc:
            self.render_now()

    def _tick(self):
        if self._rendering:
            return
        self._rendering = True
        try:
            t = self._play_t0 + (time.monotonic() - self._play_wall)
            if t >= self.doc.duration:
                self.t = self.doc.duration
                self.stop()
                self._update_time()
                self.timeline.canvas.update()
                return
            self.t = t
            self.preview.refresh()
            self.inspector.refresh()
            self._update_time()
            self.timeline.canvas.ensure_visible(t)
            self.timeline.canvas.update()
        finally:
            self._rendering = False

    # ---------------------------------------------------------- operaciones
    def import_dialog(self):
        exts = "Medios (*.mp4 *.m4v *.mov *.webm *.mkv *.avi *.3gp *.mp3 *.wav *.m4a *.aac *.ogg *.flac *.opus " \
               "*.jpg *.jpeg *.png *.webp *.bmp *.gif);;Todos los archivos (*)"
        files, _ = QFileDialog.getOpenFileNames(self, "Importar medios", str(Path.home()), exts)
        self.import_files(files)

    def import_files(self, files: list[str]) -> list[str]:
        ids = []
        for f in files:
            if not kind_of(f):
                QMessageBox.warning(self, "LineCut", f"Formato no compatible:\n{Path(f).name}")
                continue
            try:
                item = storage.import_media(self.doc, f)
            except Exception as e:  # noqa: BLE001
                QMessageBox.warning(self, "LineCut", f"No se pudo importar {Path(f).name}:\n{e}")
                continue
            self.paths = storage.media_paths(self.doc)
            self.provider.paths = self.paths
            self.assets.paths = self.paths
            ids.append(item["id"])
        self._fill_media()
        return ids

    def add_media_clip(self, mid: str, start: float | None = None, track_id: str | None = None):
        m = self.doc.data["media"].get(mid)
        if not m:
            return
        cid = self.doc.insert_clip(media_clip(m, self.t if start is None else start), track_id)
        self.select(cid)

    def add_text(self, tpl):
        cid = self.doc.insert_clip(text_clip(tpl, self.t))
        self.select(cid)

    def split_selected(self):
        c = self.selected_clip()
        if c:
            self.doc.split_clip(c["id"], self.t)

    def delete_selected(self):
        if self.sel:
            self.doc.delete_clip(self.sel)

    def duplicate_selected(self):
        c = self.selected_clip()
        if not c:
            return
        from ..util import uid
        n = copy.deepcopy(c)
        n["id"] = uid("clip")
        n["start"] = clip_end(c)
        self.select(self.doc.insert_clip(n))

    # --------------------------------------------------- soltar archivos
    def dragEnterEvent(self, e):
        if e.mimeData().hasUrls():
            e.acceptProposedAction()

    def dropEvent(self, e):
        files = [u.toLocalFile() for u in e.mimeData().urls() if u.isLocalFile()]
        ids = self.import_files(files)
        t = self.t
        for mid in ids:
            self.add_media_clip(mid, t)
            t += self.doc.data["media"][mid]["duration"] if self.doc.data["media"][mid]["kind"] != "image" else 5.0


def QApplication_setOverride():
    from PySide6.QtGui import QGuiApplication
    QGuiApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)


def QApplication_restore():
    from PySide6.QtGui import QGuiApplication
    QGuiApplication.restoreOverrideCursor()
