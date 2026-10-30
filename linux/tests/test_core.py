"""Prueba del núcleo sin interfaz: crea un proyecto, lo exporta a MP4 y verifica la duración."""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from linecut import audio, storage
from linecut.export import export_project
from linecut.media import probe
from linecut.model import *
from linecut.util import ffmpeg_path


def make_media(tmp: str):
    ff = ffmpeg_path()
    v = os.path.join(tmp, "v.mp4")
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i",
                    "sine=frequency=440", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", v], check=True)
    img = os.path.join(tmp, "p.png")
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=300x400", "-frames:v", "1", img], check=True)
    return v, img


def main():
    tmp = tempfile.mkdtemp()
    os.environ["LINECUT_HOME"] = tmp
    v, img = make_media(tmp)
    doc = Document(new_project("Prueba"))
    storage.create(doc)
    mv = storage.import_media(doc, v)
    mi = storage.import_media(doc, img)
    a = doc.insert_clip(media_clip(mv, 0))
    b = doc.insert_clip(media_clip(mi, 1.0))
    doc.insert_clip(text_clip(TEXT_TEMPLATES[1], 0.5))
    doc.patch_group(b, "transform", {"scale": 50, "x": 150})
    doc.toggle_keyframe(b, "scale", 1.0)
    doc.patch_group(b, "transform", {"scale": 120}, local=2.0)
    doc.apply_transition(b, "fade", "out")
    doc.split_clip(a, 3.0)
    # biblioteca de efectos: todo el catálogo se ejecuta y se exporta
    from linecut.fxlib import catalog, ops
    assert catalog.total() >= 230
    ops.add_clip_fx(doc, a, "fx", "vhs"); ops.add_clip_fx(doc, a, "filter", "tealorange")
    ops.add_clip_fx(doc, a, "audio", "pitchup"); ops.add_clip_fx(doc, a, "audio", "echo")
    ops.set_anim(doc, a, "in", "zoomInA"); ops.set_anim(doc, a, "loop", "floatL")
    ops.set_transition(doc, a, "in", "cube", None, 0.5)
    ops.set_transition(doc, b, "in", "liquid", None, 0.5)
    tx = next(c["id"] for t in doc.tracks for c in t["clips"] if c["type"] == "text")
    ops.add_clip_fx(doc, tx, "text", "typewriter")
    ops.add_layer(doc, 0.5, "particles", "rain", None, 2.0)
    ops.add_layer(doc, 1.5, "fx", "glow", None, 2.0)
    from linecut.fxlib import registry as _R, runtime as _RT, params as _P
    import numpy as _np
    _img = _np.random.default_rng(1).random((72, 128, 4)).astype(_np.float32); _img[..., 3] = 1
    for _it in catalog.items("fx") + catalog.items("filter") + catalog.items("transition"):
        _pr = _P.norm(_it, None)
        _o = _RT.run_passes(_img, _R.build_passes(_it, _pr, _RT.C(0.5, 0.5, 2.0, 0.5, 128, 72)), 0.5, ns=_it["id"])
        assert _o.shape == _img.shape and _np.isfinite(_o).all(), _it["id"]
    for _it in catalog.items("particles"):
        from linecut.fxlib.particles import draw_particles
        assert _np.isfinite(draw_particles(_img, 1.3, _it["id"], None, 0.1)).all(), _it["id"]
    paths = storage.media_paths(doc)
    out = os.path.join(tmp, "out.mp4")
    t0 = time.time()
    prog = []
    export_project(doc.data, paths, out, res=480, fps=30, progress=lambda p, s: prog.append(p))
    info = probe(out)
    print(json.dumps({"seconds": round(time.time() - t0, 1), "out": info, "size": os.path.getsize(out), "progress_last": prog[-1]}))
    assert abs(info["duration"] - doc.duration) < 0.2, info
    assert info["hasAudio"] and info["width"] == 854 or info["width"] in (852, 854, 856), info
    storage.save(doc)
    d2 = storage.load(doc.data["id"])
    assert d2.data["tracks"] == doc.data["tracks"]
    assert len(storage.list_projects()) == 1
    print("CORE OK")


if __name__ == "__main__":
    main()
