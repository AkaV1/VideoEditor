"""Compositor: dibuja un fotograma del proyecto (capas, transformaciones, transiciones, texto, color)."""
from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path

import numpy as np
from .effects import apply_pixel, motion
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .keyframes import eval_transform
from .util import assets_dir, clamp, data_dir

# ------------------------------------------------------------------ fuentes
_BUNDLED = {
    "Inter": ("Inter-Regular.otf", "Inter-Bold.otf"),
    "DejaVu Sans": ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"),
    "Lora": ("Lora-Variable.ttf", None),
    "Liberation Serif": ("LiberationSerif-Regular.ttf", "LiberationSerif-Bold.ttf"),
    "Liberation Mono": ("LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf"),
    "Carlito": ("Carlito-Regular.ttf", "Carlito-Bold.ttf"),
}


def user_fonts_dir() -> Path:
    p = data_dir() / "fonts"
    p.mkdir(parents=True, exist_ok=True)
    return p


def font_families() -> list[str]:
    fams = list(_BUNDLED)
    for f in sorted(user_fonts_dir().glob("*")):
        if f.suffix.lower() in (".ttf", ".otf"):
            fams.append(f.stem)
    return fams


@lru_cache(maxsize=64)
def _load_font(family: str, bold: bool, size: int):
    fd = assets_dir() / "fonts"
    if family in _BUNDLED:
        reg, bld = _BUNDLED[family]
        name = bld if (bold and bld) else reg
        return ImageFont.truetype(str(fd / name), size), bool(bold and not bld)
    for f in user_fonts_dir().glob("*"):
        if f.stem == family:
            return ImageFont.truetype(str(f), size), bold
    return ImageFont.truetype(str(fd / "Inter-Regular.otf"), size), bold


def _hex(c: str, a: int = 255):
    c = c.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a


_text_cache: dict = {}


def render_text(clip: dict, k: float) -> Image.Image | None:
    import json
    key = (clip.get("text"), json.dumps(clip["style"], sort_keys=True), round(k, 4))
    img = _text_cache.get(key)
    if img is None:
        img = _render_text(clip, k)
        if len(_text_cache) > 40:
            _text_cache.clear()
        _text_cache[key] = img
    return img


def _render_text(clip: dict, k: float) -> Image.Image | None:
    st = clip["style"]
    text = str(clip.get("text") or "")
    if not text.strip():
        text = " "
    size = max(4, int(round(st["size"] * k)))
    font, fake_bold = _load_font(st["font"], bool(st["bold"]), size)
    lines = text.split("\n")
    ls = st.get("letterSpacing", 0) * k
    stroke = int(round(st.get("strokeWidth", 0) * k))
    if fake_bold:
        stroke = max(stroke, max(1, size // 36))

    def width(line):
        base = font.getlength(line)
        return base + ls * max(0, len(line) - 1)

    widths = [width(l) for l in lines]
    lh = size * 1.2
    tw = max(widths + [size * 0.5])
    th = lh * len(lines)
    pad = size * 0.25 if st.get("bgEnabled") else 0
    margin = stroke + (size // 10 if st.get("shadow") else 0) + 2
    W = int(math.ceil(tw + pad * 2 + margin * 2))
    H = int(math.ceil(th + pad * 2 + margin * 2))
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if st.get("bgEnabled"):
        d.rounded_rectangle((margin, margin, W - margin, H - margin), radius=size * 0.2,
                            fill=_hex(st["bgColor"], int(255 * st.get("bgOpacity", 60) / 100)))
    fill = _hex(st["color"])
    sfill = _hex(st.get("strokeColor", "#000000"))

    def draw_pass(dr, ox, oy, fcol, scol):
        for i, line in enumerate(lines):
            lw = widths[i]
            x0 = margin + pad + (0 if st["align"] == "left" else (tw - lw) / 2 if st["align"] == "center" else tw - lw)
            y0 = margin + pad + i * lh + (lh - size) / 2 - size * 0.12
            x0 += ox
            y0 += oy
            if ls:
                x = x0
                for ch in line:
                    dr.text((x, y0), ch, font=font, fill=fcol, stroke_width=stroke, stroke_fill=scol)
                    x += font.getlength(ch) + ls
            else:
                dr.text((x0, y0), line, font=font, fill=fcol, stroke_width=stroke, stroke_fill=scol)

    if st.get("shadow"):
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw_pass(ImageDraw.Draw(sh), size / 16, size / 16, (0, 0, 0, 170), (0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(max(1, size / 24))))
        d = ImageDraw.Draw(img)
    draw_pass(d, 0, 0, fill, sfill if stroke else fill)
    if st.get("italic"):
        img = img.transform(img.size, Image.AFFINE, (1, 0.22, -0.22 * H / 2, 0, 1, 0), Image.BICUBIC)
    return img


# -------------------------------------------------------------------- color
def adjust_color(rgb: np.ndarray, col: dict) -> np.ndarray:
    f = col.get("filter", "none")
    br, ct, sa, tp = col.get("brightness", 0), col.get("contrast", 0), col.get("saturation", 0), col.get("temperature", 0)
    if not (br or ct or sa or tp) and f == "none":
        return rgb
    x = rgb.astype(np.float32) / 255.0
    if f != "none":
        lum = (x * [0.299, 0.587, 0.114]).sum(axis=2, keepdims=True)
        if f in ("bw", "noir"):
            x = np.repeat(lum, 3, axis=2)
            if f == "noir":
                x = np.clip((x - 0.5) * 1.4 + 0.46, 0, 1)
        elif f == "sepia":
            m = np.array([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]], np.float32)
            x = np.clip(x @ m.T, 0, 1)
        elif f == "warm":
            x = np.clip(x * [1.08, 1.0, 0.9] + [0.02, 0.0, 0.0], 0, 1)
        elif f == "cool":
            x = np.clip(x * [0.9, 1.0, 1.1], 0, 1)
        elif f == "vivid":
            x = np.clip(lum + (x - lum) * 1.45, 0, 1)
            x = np.clip((x - 0.5) * 1.1 + 0.5, 0, 1)
        elif f == "fade":
            x = np.clip(x * 0.85 + 0.1, 0, 1)
    if br:
        x = x + br / 200.0
    if ct:
        x = (x - 0.5) * (1 + ct / 100.0) + 0.5
    if sa:
        lum = (x * [0.299, 0.587, 0.114]).sum(axis=2, keepdims=True)
        x = lum + (x - lum) * (1 + sa / 100.0)
    if tp:
        x = x + np.array([tp, 0, -tp], np.float32) / 500.0
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)


# -------------------------------------------------------------- transiciones
def _ease_out(p: float) -> float:
    return 1 - (1 - p) ** 3


def apply_transition(st: dict, kind: str, p: float, out: bool, W: int, H: int):
    e = _ease_out(p)
    d = -1 if out else 1
    if kind == "fade":
        st["alpha"] *= p
    elif kind == "zoomIn":
        st["sc"] *= 0.55 + 0.45 * e
        st["alpha"] *= e
    elif kind == "zoomOut":
        st["sc"] *= 1.5 - 0.5 * e
        st["alpha"] *= e
    elif kind == "slideLeft":
        st["dx"] += d * (1 - e) * W
    elif kind == "slideRight":
        st["dx"] -= d * (1 - e) * W
    elif kind == "slideUp":
        st["dy"] += d * (1 - e) * H
    elif kind == "wipeRight":
        st["wipe"] = (W * (1 - e), 0, W, H) if out else (0, 0, W * e, H)
    elif kind == "wipeDown":
        st["wipe"] = (0, H * (1 - e), W, H) if out else (0, 0, W, H * e)
    elif kind == "spin":
        st["rot"] += d * (1 - e) * 180
        st["sc"] *= e
        st["alpha"] *= e
    elif kind == "slideDown":
        st["dy"] -= d * (1 - e) * H
    elif kind == "wipeLeft":
        st["wipe"] = (0, 0, W * e, H) if out else (W * (1 - e), 0, W, H)
    elif kind == "wipeUp":
        st["wipe"] = (0, 0, W, H * e) if out else (0, H * (1 - e), W, H)
    elif kind == "bounce":
        c1 = 1.70158
        back = 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2
        st["sc"] *= max(0.0, back)
        st["alpha"] *= min(1.0, p * 4)
    elif kind == "shake":
        a = 1 - p
        st["dx"] += a * 0.07 * W * math.sin(p * 60)
        st["dy"] += a * 0.04 * H * math.cos(p * 47)
        st["rot"] += a * 5 * math.sin(p * 53)
        st["alpha"] *= min(1.0, p * 3)
    elif kind == "whip":
        st["dx"] += d * (1 - e) * W
        st.setdefault("fx", []).append({"type": "blur", "amount": (1 - e) * 80})
    elif kind == "flash":
        st.setdefault("fx", []).append({"type": "flash", "amount": (1 - e) * 100})
        st["alpha"] *= 0.35 + 0.65 * e
    elif kind == "blur":
        st.setdefault("fx", []).append({"type": "blur", "amount": (1 - e) * 100})
        st["alpha"] *= min(1.0, e * 2)
    elif kind == "glitch":
        st.setdefault("fx", []).extend([{"type": "glitch", "amount": (1 - p) * 100},
                                        {"type": "rgbsplit", "amount": (1 - p) * 60}])
        st["alpha"] *= min(1.0, p * 5)
    elif kind == "pixelate":
        st.setdefault("fx", []).append({"type": "pixelate", "amount": (1 - e) * 100})
        st["alpha"] *= min(1.0, p * 3)
    elif kind == "rgbsplit":
        st.setdefault("fx", []).append({"type": "rgbsplit", "amount": (1 - e) * 100})
        st["alpha"] *= min(1.0, e * 2)


def _fx_layer(layer: Image.Image, fx: list[dict], local: float, k: float) -> Image.Image:
    """Aplica efectos de imagen (de transición) a una capa RGB o RGBA."""
    arr = np.asarray(layer)
    rgb = apply_pixel(np.ascontiguousarray(arr[:, :, :3]), fx, local, k)
    if layer.mode == "RGBA":
        rgb = np.dstack([rgb, arr[:, :, 3]])
        return Image.fromarray(np.ascontiguousarray(rgb), "RGBA")
    return Image.fromarray(rgb, "RGB")


# --------------------------------------------------------------- composición
def _blend(base: np.ndarray, src: np.ndarray, mode: str) -> np.ndarray:
    b = base.astype(np.float32) / 255
    s = src.astype(np.float32) / 255
    if mode == "multiply":
        r = b * s
    elif mode == "screen":
        r = 1 - (1 - b) * (1 - s)
    elif mode == "overlay":
        r = np.where(b < 0.5, 2 * b * s, 1 - 2 * (1 - b) * (1 - s))
    elif mode == "darken":
        r = np.minimum(b, s)
    elif mode == "lighten":
        r = np.maximum(b, s)
    elif mode == "difference":
        r = np.abs(b - s)
    else:
        r = s
    return r * 255


def draw_clip(canvas: np.ndarray, clip: dict, local: float, k: float, layer: Image.Image):
    """Compone `layer` (RGBA) sobre `canvas` (H,W,3 uint8) aplicando transformación y transiciones."""
    H, W = canvas.shape[:2]
    tf = eval_transform(clip, local)
    st = {"alpha": tf["opacity"] / 100, "sc": tf["scale"] / 100, "dx": tf["x"] * k, "dy": tf["y"] * k,
          "rot": tf["rotation"], "wipe": None}
    if clip.get("effects"):
        mdx, mdy, msc, mrot = motion(clip["effects"], local, clip["duration"])
        st["dx"] += mdx * k
        st["dy"] += mdy * k
        st["sc"] *= msc
        st["rot"] += mrot
    tin, tout = clip.get("transitionIn"), clip.get("transitionOut")
    if tin and tin["duration"] > 0 and local < tin["duration"]:
        apply_transition(st, tin["type"], clamp(local / tin["duration"], 0, 1), False, W, H)
    remain = clip["duration"] - local
    if tout and tout["duration"] > 0 and remain < tout["duration"]:
        apply_transition(st, tout["type"], clamp(remain / tout["duration"], 0, 1), True, W, H)
    alpha = clamp(st["alpha"], 0, 1)
    sc = st["sc"]
    if alpha <= 0.001 or sc <= 0.001:
        return
    mode = tf.get("blend", "normal")
    if st.get("fx"):
        layer = _fx_layer(layer, st["fx"], local, k)
    if layer.mode == "RGB" and (st["wipe"] or mode != "normal" or abs(st["rot"]) > 0.01):
        layer = layer.convert("RGBA")  # estos casos necesitan canal alfa
    if tf.get("flipH"):
        layer = layer.transpose(Image.FLIP_LEFT_RIGHT)
    if tf.get("flipV"):
        layer = layer.transpose(Image.FLIP_TOP_BOTTOM)
    nw, nh = max(1, int(round(layer.width * sc))), max(1, int(round(layer.height * sc)))
    if nw > 6000 or nh > 6000:
        return
    if (nw, nh) != layer.size:
        layer = layer.resize((nw, nh), Image.BILINEAR)
    if abs(st["rot"]) > 0.01:
        layer = layer.rotate(-st["rot"], resample=Image.BILINEAR, expand=True)
    cx, cy = W / 2 + st["dx"], H / 2 + st["dy"]
    x0 = int(round(cx - layer.width / 2))
    y0 = int(round(cy - layer.height / 2))
    # recorte a lo visible
    sx0, sy0 = max(0, -x0), max(0, -y0)
    ex0, ey0 = max(0, x0), max(0, y0)
    ex1, ey1 = min(W, x0 + layer.width), min(H, y0 + layer.height)
    if ex1 <= ex0 or ey1 <= ey0:
        return
    part = np.asarray(layer.crop((sx0, sy0, sx0 + (ex1 - ex0), sy0 + (ey1 - ey0))))
    if layer.mode == "RGB":
        # camino rápido: capa opaca, aritmética entera
        A = int(round(alpha * 256))
        if A >= 256:
            canvas[ey0:ey1, ex0:ex1] = part
        else:
            roi = canvas[ey0:ey1, ex0:ex1]
            canvas[ey0:ey1, ex0:ex1] = ((roi.astype(np.uint16) * (256 - A) + part.astype(np.uint16) * A) >> 8).astype(np.uint8)
        return
    a = part[:, :, 3:4].astype(np.float32) / 255 * alpha
    if st["wipe"]:
        wx0, wy0, wx1, wy1 = st["wipe"]
        mask = np.zeros((ey1 - ey0, ex1 - ex0, 1), np.float32)
        ax0, ay0 = int(max(0, wx0 - ex0)), int(max(0, wy0 - ey0))
        ax1, ay1 = int(min(ex1 - ex0, wx1 - ex0)), int(min(ey1 - ey0, wy1 - ey0))
        if ax1 > ax0 and ay1 > ay0:
            mask[ay0:ay1, ax0:ax1] = 1
        a = a * mask
    roi = canvas[ey0:ey1, ex0:ex1]
    src = part[:, :, :3]
    if mode != "normal":
        src = _blend(roi, src, mode)
    out = roi.astype(np.float32) * (1 - a) + src.astype(np.float32) * a
    canvas[ey0:ey1, ex0:ex1] = (out + 0.5).astype(np.uint8)


def active_clips(project: dict, t: float):
    """Clips visibles en t, de abajo hacia arriba (la primera pista de la lista queda arriba)."""
    out = []
    for track in reversed(project["tracks"]):
        if track["hidden"] or track["kind"] == "audio":
            continue
        for c in track["clips"]:
            if c["start"] - 1e-9 <= t < c["start"] + c["duration"] - 1e-9 or (
                    t >= c["start"] + c["duration"] - 1e-9 and False):
                out.append(c)
    return out


def render_frame(project: dict, t: float, W: int, H: int, provider, base_w: int | None = None) -> np.ndarray:
    """Devuelve el fotograma (H, W, 3) uint8 en el instante t."""
    pw, _ = (base_w or W), None
    k = W / float(pw if base_w else _project_w(project))
    canvas = np.zeros((H, W, 3), np.uint8)
    for c in active_clips(project, t):
        local = t - c["start"]
        if c["type"] == "text":
            layer = render_text(c, k)
        else:
            fr = provider.frame(c, local, W, H)
            if fr is None:
                continue
            fr = adjust_color(fr, c["color"])
            if c.get("effects"):
                fr = apply_pixel(fr, c["effects"], local, k)
            layer = Image.fromarray(fr, "RGB")
        if layer is not None:
            draw_clip(canvas, c, local, k, layer)
    return canvas


def _project_w(project: dict) -> int:
    from .model import project_size
    return project_size(project)[0]


def clip_box(project: dict, clip: dict, t: float, W: int, H: int, provider) -> tuple[float, float, float, float, float] | None:
    """(cx, cy, w, h, rot) del clip en el lienzo W×H, para dibujar los tiradores de selección."""
    k = W / float(_project_w(project))
    local = t - clip["start"]
    tf = eval_transform(clip, local)
    if clip["type"] == "text":
        im = render_text(clip, k)
        if im is None:
            return None
        nw, nh = im.size
    else:
        nat = provider.natural(clip, W, H)
        if nat is None:
            return None
        nw, nh = nat
    s = tf["scale"] / 100
    return (W / 2 + tf["x"] * k, H / 2 + tf["y"] * k, nw * s, nh * s, tf["rotation"])
