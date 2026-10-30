"""Autoprueba sin pantalla: recorre la interfaz, hace capturas y exporta un video real."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path


def _quit(code: int):
    """Sale sin destruir Qt (en algunos sistemas la destrucción al cerrar provoca un fallo tras terminar bien)."""
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


def run(argv) -> int:
    import faulthandler
    faulthandler.dump_traceback_later(150, exit=True)
    os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
    out_dir = Path(argv[argv.index("--selftest") + 1]) if len(argv) > argv.index("--selftest") + 1 else Path(tempfile.mkdtemp())
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="linecut-selftest-")
    os.environ["LINECUT_HOME"] = tmp
    res = out_dir / "result.txt"
    try:
        code = _run(out_dir, tmp)
        res.write_text("SELFTEST OK\n", encoding="utf-8")
        _quit(code)
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        print("SELFTEST FAILED")
        res.write_text("SELFTEST FAILED\n" + traceback.format_exc(), encoding="utf-8")
        _quit(1)


def _run(out_dir: Path, tmp: str) -> int:
    from PySide6.QtCore import QEventLoop, QTimer, QThread
    from PySide6.QtWidgets import QApplication

    from . import storage
    from .app import MainWindow, make_app
    from .media import probe
    from .model import TEXT_TEMPLATES
    from .ui.export_dialog import ExportDialog
    from .ui.tutorial import TutorialDialog
    from .util import ffmpeg_path

    app = make_app(["linecut"])

    def pump(ms=150):
        loop = QEventLoop()
        QTimer.singleShot(ms, loop.quit)
        loop.exec()

    def shot(w, name):
        w.grab().save(str(out_dir / f"{name}.png"))

    ff = ffmpeg_path()
    v = os.path.join(tmp, "clip.mp4")
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
                    "sine=frequency=440", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", v], check=True)
    img = os.path.join(tmp, "pic.png")
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x2255aa:s=400x400", "-frames:v", "1", img], check=True)

    w = MainWindow()
    w.show()
    pump()
    shot(w, "1-inicio")
    td = TutorialDialog(w)
    td.show(); pump(); shot(td, "2-tutorial"); td.close()

    w.create("Prueba", "16:9")
    pump()
    ed = w.editor
    ids = ed.import_files([v, img])
    assert len(ids) == 2, "importación"
    ed.add_media_clip(ids[0], 0.0)
    ed.add_media_clip(ids[1], 4.0)
    ed.set_time(1.0)
    ed.add_text(TEXT_TEMPLATES[1])
    pump(1200)  # miniaturas y onda
    clip = ed.selected_clip()
    assert clip and clip["type"] == "text"
    ed.doc.toggle_keyframe(clip["id"], "scale", 1.0)
    ed.set_time(2.5)
    ed.doc.patch_group(clip["id"], "transform", {"scale": 160}, local=1.5)
    ed.inspector.refresh()
    pump()
    shot(w, "3-editor")
    from .effects import new_effect
    vcl = next(c for t in ed.doc.tracks for c in t["clips"] if c["type"] == "video")
    ed.select(vcl["id"])
    for kind in ("shake", "glitch", "rgbsplit", "vignette"):
        ed.doc.patch_clip(vcl["id"], lambda cl, k=kind: cl.setdefault("effects", []).append(new_effect(k)))
    ed.set_time(1.2)
    ed.inspector.tabs.setCurrentIndex(ed.inspector.tabs.count() - 3)
    pump(); shot(w, "3b-efectos")
    ed.doc.undo(); ed.doc.undo(); ed.doc.undo(); ed.doc.undo()
    ed.doc.patch_clip(vcl["id"], lambda cl: cl.__setitem__("effects", [new_effect("blur"), new_effect("zoomIn")]))
    # deshacer / rehacer / dividir
    n = len(ed.doc.tracks[1]["clips"]) + len(ed.doc.tracks[0]["clips"])
    vc = next(c for t in ed.doc.tracks for c in t["clips"] if c["type"] == "video")
    ed.select(vc["id"]); ed.set_time(2.0); ed.split_selected()
    assert sum(len(t["clips"]) for t in ed.doc.tracks) == n + 1, "dividir"
    ed.doc.undo()
    assert sum(len(t["clips"]) for t in ed.doc.tracks) == n, "deshacer"
    ed.doc.redo()
    pump()
    shot(w, "4-inspector")
    # reproducción breve
    ed.set_time(0.0)
    print('selftest: reproduccion', flush=True)
    ed.play(); pump(500); ed.stop()
    assert ed.t > 0.1, "reproducción"
    # guardar, volver a inicio y reabrir
    w.go_home(); pump()
    assert storage.list_projects(), "guardado"
    shot(w, "5-inicio-con-proyecto")
    pid = storage.list_projects()[0]["id"]
    w.open(pid); pump(300)
    assert sum(len(t["clips"]) for t in w.editor.doc.tracks) == n + 1, "reabrir"
    print('selftest: biblioteca', flush=True)
    from .fxlib import catalog, ops
    ed = w.editor
    assert catalog.total() >= 230, "catálogo"
    lib = ed.fxlib
    vcl = next(c for t in ed.doc.tracks for c in t["clips"] if c["type"] == "video")
    tcl = next(c for t in ed.doc.tracks for c in t["clips"] if c["type"] == "text")
    ed.select(vcl["id"]); ed.set_time(1.0)
    ed.inspector.tabs.setCurrentIndex(0)
    # panel: todas las categorías se rellenan y generan miniaturas
    for i in range(lib.kind.count()):
        lib.kind.setCurrentIndex(i); pump(60)
        assert lib.list.count() > 0 or lib.kind.currentData() == "fav", f"biblioteca vacía: {lib.kind.currentText()}"
    lib.kind.setCurrentIndex(0); pump(600)
    lib.list.setCurrentRow(2); pump(200)
    assert lib.cur and lib.editor_w is not None, "detalle"
    lib.apply_clip(); pump(100)
    assert ed.selected_clip().get("fx"), "aplicar efecto del catálogo"
    shot(w, "7-biblioteca")
    ops.add_clip_fx(ed.doc, vcl["id"], "filter", "cinematic")
    ops.add_clip_fx(ed.doc, vcl["id"], "fx", "vignettefx")
    ops.set_transition(ed.doc, vcl["id"], "in", "cube", None, 0.6)
    ops.set_transition(ed.doc, vcl["id"], "out", "liquid", None, 0.6)
    ops.set_anim(ed.doc, vcl["id"], "in", "zoomSpinA")
    ops.set_anim(ed.doc, vcl["id"], "loop", "floatL")
    ops.add_clip_fx(ed.doc, vcl["id"], "audio", "pitchup")
    ops.add_clip_fx(ed.doc, tcl["id"], "text", "neonT")
    lid = ops.add_layer(ed.doc, 0.5, "particles", "snow", None, 2.0)
    lid2 = ops.add_layer(ed.doc, 1.0, "fx", "glow", None, 2.0)
    assert lid and lid2, "capas de efecto"
    ed.select(lid2); pump(100)
    shot(w, "8-capa-efecto")
    ed.select(vcl["id"]); ed.set_time(0.3); pump(200)
    ed.inspector.tabs.setCurrentIndex(ed.inspector.tabs.count() - 2)
    pump(100); shot(w, "9-inspector-biblioteca")
    for tt in (0.2, 0.8, 1.4, 2.6, 3.6):
        ed.set_time(tt); pump(80)
    ed.doc.undo(); ed.doc.redo(); pump(100)
    print('selftest: exportacion', flush=True)
    # exportación real (sin pantalla)
    dlg = ExportDialog(w.editor.doc, w.editor.paths, w)
    dlg.path.setText(os.path.join(tmp, "salida.mp4"))
    dlg.res.setCurrentIndex(dlg.res.findData(480))
    dlg.show()
    dlg.start()
    for _ in range(2400):
        pump(100)
        if getattr(dlg, "finished_ok", False) or "✖" in dlg.status.text():
            break
    shot(dlg, "6-exportar")
    assert getattr(dlg, "finished_ok", False), f"exportación: {dlg.status.text()}"
    info = probe(os.path.join(tmp, "salida.mp4"))
    print(json.dumps(info))
    assert abs(info["duration"] - w.editor.doc.duration) < 0.6, "duración del video exportado"
    assert info["hasAudio"], "audio"
    dlg.close()
    w.close()
    print("SELFTEST OK")
    return 0
