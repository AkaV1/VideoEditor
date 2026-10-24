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
