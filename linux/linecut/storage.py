"""Proyectos guardados en ~/.local/share/LineCut/projects/<id>/ (project.json + medios + miniatura)."""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

from .media import make_media_item, probe
from .model import Document
from .util import data_dir, uid


def projects_dir() -> Path:
    p = data_dir() / "projects"
    p.mkdir(parents=True, exist_ok=True)
    return p


def project_dir(pid: str) -> Path:
    return projects_dir() / pid


def list_projects() -> list[dict]:
    out = []
    for d in projects_dir().iterdir():
        f = d / "project.json"
        if not f.exists():
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        dur = max([c["start"] + c["duration"] for t in data.get("tracks", []) for c in t["clips"]] or [0.0])
        out.append({"id": data["id"], "name": data.get("name", "Proyecto"), "ratio": data.get("ratio", "16:9"),
                    "duration": dur, "updated": f.stat().st_mtime,
                    "thumb": str(d / "thumb.png") if (d / "thumb.png").exists() else None})
    return sorted(out, key=lambda p: -p["updated"])


def load(pid: str) -> Document:
    data = json.loads((project_dir(pid) / "project.json").read_text(encoding="utf-8"))
    return Document(data)


def save(doc: Document):
    d = project_dir(doc.data["id"])
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "project.json.tmp"
    tmp.write_text(doc.to_json(), encoding="utf-8")
    os.replace(tmp, d / "project.json")
    doc.dirty = False


def create(doc: Document):
    (project_dir(doc.data["id"]) / "media").mkdir(parents=True, exist_ok=True)
    save(doc)


def delete(pid: str):
    shutil.rmtree(project_dir(pid), ignore_errors=True)


def duplicate(pid: str) -> str:
    new = uid("prj")
    shutil.copytree(project_dir(pid), project_dir(new))
    f = project_dir(new) / "project.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data["id"] = new
    data["name"] = f"{data['name']} (copia)"
    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return new


def rename(pid: str, name: str):
    f = project_dir(pid) / "project.json"
    data = json.loads(f.read_text(encoding="utf-8"))
    data["name"] = name.strip() or "Proyecto sin título"
    f.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def media_paths(doc: Document) -> dict[str, str]:
    base = project_dir(doc.data["id"])
    return {mid: str(base / m["file"]) for mid, m in doc.data["media"].items() if (base / m["file"]).exists()}


def import_media(doc: Document, src: str) -> dict:
    """Copia el archivo al proyecto (para que no se pierda si se mueve) y lo registra."""
    info = probe(src)
    rel_dir = project_dir(doc.data["id"]) / "media"
    rel_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uid('f')}{Path(src).suffix.lower()}"
    dest = rel_dir / name
    try:
        os.link(src, dest)  # mismo disco: sin duplicar espacio
    except OSError:
        shutil.copy2(src, dest)
    item = make_media_item(src, info, f"media/{name}")
    doc.add_media(item)
    return item


def save_thumb(doc: Document, rgb_image) -> None:
    from PIL import Image
    im = Image.fromarray(rgb_image) if not hasattr(rgb_image, "save") else rgb_image
    im.thumbnail((320, 320))
    im.save(project_dir(doc.data["id"]) / "thumb.png")
