"""Modelo del proyecto (diccionarios JSON) y operaciones de edición con historial deshacer/rehacer."""
from __future__ import annotations

import copy
import json
from typing import Callable

from .keyframes import (KF_PROPS, EPS, value_at, set_kf, kf_index_at, has_kf, local_time, split_keyframes,
                        shift_keyframes, scale_keyframes, props_for, all_times)
from .util import clamp, uid

RATIOS = {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720), "4:3": (960, 720)}
BLEND_MODES = [("normal", "Normal"), ("multiply", "Multiplicar"), ("screen", "Trama"), ("overlay", "Superponer"),
               ("darken", "Oscurecer"), ("lighten", "Aclarar"), ("difference", "Diferencia")]
TRANSITIONS = [("none", "Ninguna"), ("fade", "Fundido"), ("zoomIn", "Zoom +"), ("zoomOut", "Zoom −"),
               ("slideLeft", "Deslizar ←"), ("slideRight", "Deslizar →"), ("slideUp", "Deslizar ↑"),
               ("wipeRight", "Cortina →"), ("wipeDown", "Cortina ↓"), ("spin", "Giro")]
FILTERS = [("none", "Sin filtro"), ("bw", "Blanco y negro"), ("sepia", "Sepia"), ("warm", "Cálido"),
           ("cool", "Frío"), ("vivid", "Vívido"), ("fade", "Desvanecido"), ("noir", "Noir")]

DEFAULT_TRANSFORM = {"x": 0.0, "y": 0.0, "scale": 100.0, "rotation": 0.0, "opacity": 100.0,
                     "flipH": False, "flipV": False, "blend": "normal"}
DEFAULT_CROP = {"top": 0.0, "bottom": 0.0, "left": 0.0, "right": 0.0}
DEFAULT_COLOR = {"brightness": 0.0, "contrast": 0.0, "saturation": 0.0, "temperature": 0.0, "filter": "none"}
DEFAULT_AUDIO = {"volume": 100.0, "fadeIn": 0.0, "fadeOut": 0.0, "balance": 0.0}
DEFAULT_TEXT_STYLE = {"font": "Inter", "size": 72, "bold": True, "italic": False, "align": "center",
                      "color": "#ffffff", "strokeWidth": 0, "strokeColor": "#000000", "shadow": False,
                      "bgEnabled": False, "bgColor": "#000000", "bgOpacity": 60, "letterSpacing": 0}
TEXT_TEMPLATES = [
    ("Básico", "Texto", {}),
    ("Título", "TÍTULO", {"size": 120, "letterSpacing": 4}),
    ("Subtítulo", "Subtítulo", {"size": 48, "bold": False, "shadow": True}),
    ("Neón", "NEÓN", {"size": 100, "color": "#00f2fe", "shadow": True, "strokeWidth": 2, "strokeColor": "#ffffff"}),
    ("Pop", "POP!", {"size": 130, "color": "#ffe600", "strokeWidth": 10}),
    ("Caja", "Caja", {"size": 64, "bgEnabled": True, "bgOpacity": 70}),
]


def new_track(kind: str, name: str) -> dict:
    return {"id": uid("trk"), "kind": kind, "name": name, "muted": False, "hidden": False, "locked": False,
            "clips": []}


def new_project(name: str = "Proyecto sin título", ratio: str = "16:9") -> dict:
    return {"id": uid("prj"), "name": name, "ratio": ratio, "res": 1080, "fps": 30,
            "tracks": [new_track("text", "Texto"), new_track("video", "Video"), new_track("audio", "Audio")],
            "markers": [], "media": {}}


def base_clip(ctype: str, **extra) -> dict:
    c = {"id": uid("clip"), "type": ctype, "name": "", "start": 0.0, "duration": 3.0, "trimStart": 0.0,
         "speed": 1.0, "transform": dict(DEFAULT_TRANSFORM), "crop": dict(DEFAULT_CROP),
         "color": dict(DEFAULT_COLOR), "audio": dict(DEFAULT_AUDIO), "transitionIn": None,
         "transitionOut": None, "keyframes": {}, "effects": []}
    c.update(extra)
    return c


def media_clip(media: dict, start: float) -> dict:
    kind = media["kind"]
    dur = 5.0 if kind == "image" else max(0.1, media.get("duration") or 5.0)
    return base_clip(kind, mediaId=media["id"], name=media["name"], start=start, duration=dur)


def text_clip(template: tuple | None, start: float) -> dict:
    name, text, st = template or TEXT_TEMPLATES[0]
    return base_clip("text", name=name, text=text, style={**DEFAULT_TEXT_STYLE, **st}, start=start, duration=3.0)


def track_kind_for(ctype: str) -> str:
    return "audio" if ctype == "audio" else "video" if ctype in ("video", "image") else "text"


def clip_end(c: dict) -> float:
    return c["start"] + c["duration"]


def calc_duration(tracks: list[dict]) -> float:
    return max([clip_end(c) for t in tracks for c in t["clips"]] or [0.0])


def find_clip(tracks: list[dict], cid: str | None):
    if not cid:
        return None
    for ti, t in enumerate(tracks):
        for ci, c in enumerate(t["clips"]):
            if c["id"] == cid:
                return c, t, ti, ci
    return None


def project_size(p: dict) -> tuple[int, int]:
    return RATIOS.get(p["ratio"], RATIOS["16:9"])


def is_free(track: dict, start: float, dur: float, ignore: str | None = None) -> bool:
    return all(c["id"] == ignore or clip_end(c) <= start + 1e-6 or c["start"] >= start + dur - 1e-6
               for c in track["clips"])


def resolve_start(track: dict, ignore: str | None, start: float, dur: float) -> float:
    """Posición válida más cercana a `start` en la pista (sin solapar clips)."""
    start = max(0.0, start)
    if is_free(track, start, dur, ignore):
        return start
    cands = []
    for c in track["clips"]:
        if c["id"] == ignore:
            continue
        cands += [clip_end(c), c["start"] - dur]
    best = None
    for cand in cands:
        if cand >= 0 and is_free(track, cand, dur, ignore):
            if best is None or abs(cand - start) < abs(best - start):
                best = cand
    return best if best is not None else start


class Document:
    """Proyecto abierto + historial. Toda edición pasa por `mutate` para poder deshacer."""

    def __init__(self, data: dict):
        self.data = data
        self.past: list[dict] = []
        self.future: list[dict] = []
        self._last_key: str | None = None
        self._last_ts = 0.0
        self.listeners: list[Callable[[], None]] = []
        self.dirty = False

    # ------------------------------------------------------------ utilidades
    @property
    def tracks(self) -> list[dict]:
        return self.data["tracks"]

    @property
    def duration(self) -> float:
        return calc_duration(self.tracks)

    def on_change(self, fn: Callable[[], None]):
        self.listeners.append(fn)

    def notify(self):
        self.dirty = True
        for fn in list(self.listeners):
            fn()

    def clip(self, cid):
        f = find_clip(self.tracks, cid)
        return f[0] if f else None

    def _snapshot(self) -> dict:
        return {k: copy.deepcopy(self.data[k]) for k in ("name", "ratio", "res", "fps", "tracks", "markers")}

    def mutate(self, fn: Callable[[dict], bool | None], key: str | None = None) -> bool:
        import time
        before = self._snapshot()
        res = fn(self.data)
        if res is False:
            return False
        now = time.time()
        if not (key and key == self._last_key and now - self._last_ts < 1.2):
            self.past.append(before)
            self.past = self.past[-100:]
        self._last_key, self._last_ts = key, now
        self.future.clear()
        self.notify()
        return True

    def undo(self):
        if not self.past:
            return
        self.future.append(self._snapshot())
        self.data.update(self.past.pop())
        self._last_key = None
        self.notify()

    def redo(self):
        if not self.future:
            return
        self.past.append(self._snapshot())
        self.data.update(self.future.pop())
        self._last_key = None
        self.notify()

    # ------------------------------------------------------------- medios
    def add_media(self, item: dict):
        self.data["media"][item["id"]] = item
        self.notify()

    # --------------------------------------------------------------- clips
    def insert_clip(self, clip: dict, track_id: str | None = None) -> str | None:
        kind = track_kind_for(clip["type"])

        def fn(d):
            tr = next((t for t in d["tracks"] if t["id"] == track_id and t["kind"] == kind and not t["locked"]), None)
            if tr is None:
                tr = next((t for t in d["tracks"] if t["kind"] == kind and not t["locked"]
                           and is_free(t, clip["start"], clip["duration"])), None)
            if tr is None:
                tr = new_track(kind, {"text": "Texto", "video": "Video", "audio": "Audio"}[kind])
                if kind == "video":
                    # capa nueva por encima de las pistas de video existentes
                    idx = next((i for i, t in enumerate(d["tracks"]) if t["kind"] == "video"), len(d["tracks"]))
                    d["tracks"].insert(idx, tr)
                else:
                    d["tracks"].append(tr)
            clip["start"] = resolve_start(tr, None, clip["start"], clip["duration"])
            tr["clips"].append(clip)
            tr["clips"].sort(key=lambda c: c["start"])

        self.mutate(fn)
        return clip["id"]

    def patch_clip(self, cid: str, fn: Callable[[dict], None], key: str | None = None):
        def run(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            fn(f[0])

        self.mutate(run, key)

    def patch_group(self, cid: str, group: str, patch: dict, local: float | None = None):
        """Cambia propiedades de un grupo. Si la propiedad tiene keyframes se guarda como keyframe en `local`."""
        def fn(c):
            kfs = c.setdefault("keyframes", {})
            for k, v in patch.items():
                if KF_PROPS.get(k) == group and kfs.get(k):
                    kfs[k] = set_kf(kfs[k], clamp(local or 0.0, 0.0, c["duration"]), v)
                else:
                    c[group][k] = v

        self.patch_clip(cid, fn, f"{group}:{','.join(patch)}:{cid}")

    def delete_clip(self, cid: str):
        def fn(d):
            for t in d["tracks"]:
                t["clips"] = [c for c in t["clips"] if c["id"] != cid]

        self.mutate(fn)

    def split_clip(self, cid: str, t: float):
        def fn(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            c, tr, _, ci = f
            if t <= c["start"] + 0.05 or t >= clip_end(c) - 0.05:
                return False
            d1 = t - c["start"]
            d2 = clip_end(c) - t
            kl, kr = split_keyframes(c, d1)
            right = copy.deepcopy(c)
            right.update(id=uid("clip"), start=t, duration=d2, transitionIn=None, keyframes=kr)
            right["audio"]["fadeIn"] = 0.0
            if c["type"] in ("video", "audio", "image"):
                right["trimStart"] = c["trimStart"] + d1 * c["speed"]
            c["duration"] = d1
            c["keyframes"] = kl
            c["transitionOut"] = None
            c["audio"]["fadeOut"] = 0.0
            tr["clips"].insert(ci + 1, right)

        self.mutate(fn)

    def move_clip(self, cid: str, start: float, track_id: str | None = None):
        def fn(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            c, tr, _, _ = f
            target = next((t for t in d["tracks"] if t["id"] == track_id), tr)
            if target["kind"] != tr["kind"] or target["locked"]:
                target = tr
            pos = resolve_start(target, cid, start, c["duration"])
            if target is tr and abs(pos - c["start"]) < 1e-9:
                return False
            c["start"] = pos
            if target is not tr:
                tr["clips"].remove(c)
                target["clips"].append(c)
            target["clips"].sort(key=lambda x: x["start"])

        self.mutate(fn, f"move:{cid}")

    def trim_left(self, cid: str, time: float, media_dur: float = float("inf")):
        def fn(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            c, tr, _, _ = f
            is_media = c["type"] in ("video", "audio")
            prev_end = max([clip_end(x) for x in tr["clips"] if x["id"] != cid and clip_end(x) <= c["start"] + 1e-6] or [0.0])
            min_start = prev_end
            if is_media:
                min_start = max(min_start, c["start"] - c["trimStart"] / c["speed"])
            ns = clamp(time, min_start, clip_end(c) - 0.1)
            delta = ns - c["start"]
            if is_media:
                c["trimStart"] += delta * c["speed"]
            nd = clip_end(c) - ns
            c["start"], c["duration"] = ns, nd
            c["keyframes"] = shift_keyframes(c.get("keyframes", {}), -delta, nd)

        self.mutate(fn, f"trimL:{cid}")

    def trim_right(self, cid: str, time: float, media_dur: float = float("inf")):
        def fn(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            c, tr, _, _ = f
            is_media = c["type"] in ("video", "audio")
            nxt = min([x["start"] for x in tr["clips"] if x["id"] != cid and x["start"] >= clip_end(c) - 1e-6] or [float("inf")])
            max_end = nxt
            if is_media:
                max_end = min(max_end, c["start"] + max(0.1, (media_dur - c["trimStart"]) / c["speed"]))
            ne = clamp(time, c["start"] + 0.1, max(c["start"] + 0.1, max_end))
            c["duration"] = ne - c["start"]

        self.mutate(fn, f"trimR:{cid}")

    def set_speed(self, cid: str, speed: float):
        speed = clamp(speed, 0.1, 100.0)

        def fn(d):
            f = find_clip(d["tracks"], cid)
            if not f:
                return False
            c, tr, _, _ = f
            dur = max(0.1, c["duration"] * c["speed"] / speed)
            nxt = min([x["start"] for x in tr["clips"] if x["id"] != cid and x["start"] >= clip_end(c) - 1e-6] or [float("inf")])
            dur = min(dur, nxt - c["start"])
            c["keyframes"] = scale_keyframes(c.get("keyframes", {}), dur / c["duration"])
            c["speed"], c["duration"] = speed, dur

        self.mutate(fn, f"speed:{cid}")

    def apply_transition(self, cid: str, kind: str, side: str = "in"):
        key = "transitionOut" if side == "out" else "transitionIn"

        def fn(c):
            c[key] = None if kind == "none" else {"type": kind, "duration": (c[key] or {}).get("duration", min(1.0, c["duration"] / 2))}

        self.patch_clip(cid, fn)

    # ------------------------------------------------------------ keyframes
    def toggle_keyframe(self, cid: str, prop: str, t: float):
        def fn(c):
            local = local_time(c, t)
            lst = c.get("keyframes", {}).get(prop)
            i = kf_index_at(lst, local)
            group = KF_PROPS[prop]
            cur = value_at(c, prop, local)
            if i >= 0:
                rest = [k for j, k in enumerate(lst) if j != i]
                if rest:
                    c["keyframes"][prop] = rest
                else:
                    c["keyframes"].pop(prop, None)
                    c[group][prop] = cur
            else:
                c.setdefault("keyframes", {})[prop] = set_kf(lst, local, cur)

        self.patch_clip(cid, fn)

    def toggle_all_keyframes(self, cid: str, t: float):
        c = self.clip(cid)
        if not c:
            return

        def fn(c):
            local = local_time(c, t)
            props = props_for(c)
            all_on = all(kf_index_at(c.get("keyframes", {}).get(p), local) >= 0 for p in props)
            kfs = c.setdefault("keyframes", {})
            for p in props:
                cur = value_at(c, p, local)
                if all_on:
                    rest = [k for k in kfs.get(p, []) if abs(k["t"] - local) >= EPS]
                    if rest:
                        kfs[p] = rest
                    else:
                        kfs.pop(p, None)
                        c[KF_PROPS[p]][p] = cur
                else:
                    kfs[p] = set_kf(kfs.get(p), local, cur)

        self.patch_clip(cid, fn)

    def set_keyframe_ease(self, cid: str, t: float, ease: str):
        def fn(c):
            local = local_time(c, t)
            for lst in c.get("keyframes", {}).values():
                for k in lst:
                    if abs(k["t"] - local) < EPS:
                        k["e"] = ease

        self.patch_clip(cid, fn)

    def clear_keyframes(self, cid: str, t: float):
        def fn(c):
            local = local_time(c, t)
            for p in list(c.get("keyframes", {})):
                c[KF_PROPS[p]][p] = value_at(c, p, local)
            c["keyframes"] = {}

        self.patch_clip(cid, fn)

    def next_keyframe(self, cid: str, t: float, direction: int) -> float | None:
        c = self.clip(cid)
        if not c:
            return None
        times = [c["start"] + k for k in all_times(c)]
        if direction > 0:
            return next((x for x in times if x > t + EPS), None)
        return next((x for x in reversed(times) if x < t - EPS), None)

    # ------------------------------------------------------------ persistencia
    def to_json(self) -> str:
        return json.dumps(self.data, ensure_ascii=False)
