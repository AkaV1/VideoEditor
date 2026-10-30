"""Efectos de texto (19): entrada, salida y continuos, letra a letra, dibujados con Pillow."""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .anim import bounce_out
from .params import P, color, norm, wd

TEXTFX: list = []
BY: dict = {}
F = np.float32


def get_textfx(id):
    return BY.get(id)


def _reg(id, label, mode, params, tags=()):
    it = {"kind": "text", "id": id, "label": label, "mode": mode, "tags": list(tags), "params": params or [wd(P["amount"], 70), P["speed"]]}
    TEXTFX.append(it)
    BY[id] = it


DUR = {"id": "duration", "label": "Duración", "min": 0.2, "max": 4, "def": 1.2, "unit": " s", "step": 0.1}
IN = [DUR, wd(P["amount"], 100)]
for _id, _l, _t in (("typewriter", "Máquina de escribir", ["teclear"]), ("handwriting", "Escritura a mano", ["trazo"]),
                    ("letters", "Aparición por letras", []), ("words", "Aparición por palabras", []),
                    ("fadeT", "Desvanecimiento", []), ("bounceT", "Rebote", []), ("spinT", "Giro", []),
                    ("slideT", "Deslizamiento", []), ("zoomT", "Zoom", []), ("maskreveal", "Revelado por máscara", ["máscara"])):
    _reg(_id, _l, "in", IN, _t)
_reg("disappear", "Desaparición", "out", IN)
_reg("glitchT", "Glitch", "loop", [wd(P["amount"], 70), P["speed"]])
for _id, _l, _c, _a in (("neonT", "Neón", "#00f2fe", 80), ("shadowT", "Sombra animada", "#000000", 70),
                        ("outlineT", "Contorno animado", "#ffffff", 70), ("sparkleT", "Destellos", "#fff6c2", 70),
                        ("d3T", "Efecto 3D", "#ff3b6b", 70)):
    _reg(_id, _l, "loop", [wd(P["amount"], _a), P["speed"], color(_c)])
_reg("vibrateT", "Vibración", "loop", [wd(P["amount"], 60), P["speed"]])
_reg("pulseT", "Pulsación", "loop", [wd(P["amount"], 60), P["speed"]])


def c01(x):
    return max(0.0, min(1.0, x))


def E(p):
    return 1 - (1 - p) ** 3


def hsh(n):
    s = math.sin(n * 127.1) * 43758.5453
    return s - math.floor(s)


def pick_textfx(clip: dict, local: float):
    lst = clip.get("textFx")
    if not lst:
        return None
    remain = clip["duration"] - local
    loop = inn = out = None
    for f in lst:
        if f.get("off"):
            continue
        it = get_textfx(f.get("id"))
        if not it:
            continue
        d = (f.get("p") or {}).get("duration", 1.2)
        if it["mode"] == "in" and local < d and not inn:
            inn = f
        elif it["mode"] == "out" and remain < d and not out:
            out = f
        elif it["mode"] == "loop" and not loop:
            loop = f
    return out or inn or loop


def _rgb(hexs, default=(255, 255, 255)):
    h = str(hexs or "").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except Exception:
        return default


def _hsv(h):
    import colorsys
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360, 0.7, 1.0)
    return int(r * 255), int(g * 255), int(b * 255)


class _Canvas:
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.a = np.zeros((H, W, 4), F)  # RGBA 0..1 straight sobre premultiplicado (se guarda premultiplicado)

    def blit(self, tile: Image.Image, x: int, y: int, alpha=1.0, additive=False):
        t = np.asarray(tile, dtype=F) / 255.0
        h, w = t.shape[:2]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(self.W, x + w), min(self.H, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        t = t[y0 - y:y1 - y, x0 - x:x1 - x]
        a = t[..., 3:4] * alpha
        src = t[..., :3] * a  # premultiplicado
        dst = self.a[y0:y1, x0:x1]
        if additive:
            dst[..., :3] += src
            dst[..., 3:4] = np.maximum(dst[..., 3:4], a)
        else:
            dst[...] = np.concatenate([src, a], -1) + dst * (1 - a)

    def image(self):
        a = self.a[..., 3:4]
        rgb = np.where(a > 1e-4, self.a[..., :3] / np.maximum(a, 1e-4), 0)
        out = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)], -1)
        return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def render_text_fx(clip: dict, k: float, local: float, fx: dict, base: Image.Image):
    """Devuelve una imagen RGBA con el texto animado (centro = centro de `base`), o None."""
    from ..render import _load_font  # import perezoso
    it = get_textfx(fx.get("id"))
    if not it:
        return None
    pr = norm(it, fx.get("p"))
    amt, spd = pr.amount, pr.speed
    dur = max(0.05, float(pr.get("duration") or 1.2))
    st = clip["style"]
    size = max(4, int(round(st["size"] * k)))
    font, fake_bold = _load_font(st["font"], bool(st["bold"]), size)
    ls = st.get("letterSpacing", 0) * k
    stroke_w = int(round(st.get("strokeWidth", 0) * k))
    if fake_bold:
        stroke_w = max(stroke_w, max(1, size // 36))
    text = str(clip.get("text") or " ") or " "
    lines = text.split("\n")
    lh = size * 1.2

    def lw(s):
        return font.getlength(s) + ls * max(0, len(s) - 1)

    widths = [lw(l) for l in lines]
    tw = max(widths + [size * 0.5])
    th = lh * len(lines)
    padc = int(size * 2.2)
    W = base.width + padc * 2
    H = base.height + padc * 2
    cx0, cy0 = W / 2, H / 2
    units = []
    words = 0
    top = -th / 2
    for li, line in enumerate(lines):
        w = widths[li]
        x0 = -tw / 2 if st["align"] == "left" else tw / 2 - w if st["align"] == "right" else -w / 2
        y = top + lh * (li + 0.5)
        wi = words
        for i, ch in enumerate(line):
            pre = font.getlength(line[:i]) + ls * i
            cw = font.getlength(ch)
            if ch == " ":
                words += 1
                wi = words
            units.append({"ch": ch, "x": x0 + pre, "y": y, "w": cw, "word": wi, "idx": len(units)})
        words += 1
    n = max(1, len(units))
    n_words = max(1, words)
    p_in = c01(local / dur)
    p_out = c01((clip["duration"] - local) / dur)
    p = p_out if it["mode"] == "out" else p_in
    cv = _Canvas(W, H)
    fill0 = _rgb(st["color"])
    scol = _rgb(st.get("strokeColor", "#000000"))
    T = int(size * 2.6) + 4

    def prog(i, total):
        return c01((p * (total + 3) - i) / 3)

    def paint(u, ox=0.0, oy=0.0, rot=0.0, sc=1.0, alpha=1.0, fill=None, shadow=None, no_stroke=False,
              stroke_only=None, no_fill=False, additive=False):
        if u["ch"] == " " or alpha <= 0.002:
            return
        pad = int(size * 0.6) if shadow else 0
        TT = T + pad * 2
        tile = Image.new("RGBA", (TT, TT), (0, 0, 0, 0))
        d = ImageDraw.Draw(tile)
        c = TT // 2
        f = fill or fill0
        sw = 0 if no_stroke else stroke_w
        if shadow and shadow.get("b", 0) > 0 and shadow.get("c"):
            sh = Image.new("RGBA", (TT, TT), (0, 0, 0, 0))
            ImageDraw.Draw(sh).text((c + shadow.get("x", 0), c + shadow.get("y", 0)), u["ch"], font=font,
                                    fill=(*shadow["c"], int(255 * shadow.get("a", 1))), anchor="mm")
            tile.alpha_composite(sh.filter(ImageFilter.GaussianBlur(max(1, shadow["b"] / 2))))
            d = ImageDraw.Draw(tile)
        elif shadow and shadow.get("c") and shadow.get("b", 0) == 0 and (shadow.get("x") or shadow.get("y")):
            ImageDraw.Draw(tile).text((c + shadow["x"], c + shadow["y"]), u["ch"], font=font, fill=(*shadow["c"], 200), anchor="mm")
        if stroke_only:
            d.text((c, c), u["ch"], font=font, fill=(0, 0, 0, 0), stroke_width=max(1, int(stroke_only["w"])),
                   stroke_fill=(*stroke_only["c"], 255), anchor="mm")
        elif not no_fill:
            d.text((c, c), u["ch"], font=font, fill=(*f, 255), stroke_width=sw, stroke_fill=(*scol, 255) if sw else (*f, 255), anchor="mm")
        if sc != 1.0:
            s = max(0.01, sc)
            nt = max(2, int(TT * s))
            tile = tile.resize((nt, nt), Image.BILINEAR)
        if rot:
            tile = tile.rotate(-math.degrees(rot), resample=Image.BILINEAR)
        cv.blit(tile, int(round(cx0 + u["x"] + u["w"] / 2 + ox - tile.width / 2)),
                int(round(cy0 + u["y"] + oy - tile.height / 2)), alpha, additive)

    fid = fx["id"]
    if fid == "typewriter":
        shown = int(p * n + 0.0001)
        for i, u in enumerate(units):
            if i < shown:
                paint(u)
        if p_in < 1 or int(local * 2) % 2 == 0:
            last = units[min(shown, n - 1)]
            cx = last["x"] + last["w"] if shown >= n else last["x"]
            bar = Image.new("RGBA", (max(2, int(size * 0.06)), int(size * 0.9)), (*fill0, 255))
            cv.blit(bar, int(cx0 + cx + size * 0.04), int(cy0 + last["y"] - size * 0.45))
    elif fid == "handwriting":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q <= 0:
                continue
            paint(u, no_fill=q < 0.55, stroke_only={"w": max(1.5, size * 0.03), "c": fill0} if q < 1 else None)
            if 0.55 <= q < 1:
                paint(u, alpha=(q - 0.55) / 0.45)
    elif fid == "letters":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q > 0:
                paint(u, 0, (1 - E(q)) * size * 0.3, alpha=q)
    elif fid == "words":
        for u in units:
            q = c01((p * (n_words + 2) - u["word"]) / 2)
            if q > 0:
                paint(u, 0, (1 - E(q)) * size * 0.25, alpha=q)
    elif fid == "fadeT":
        for u in units:
            paint(u, alpha=p)
    elif fid == "bounceT":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q > 0:
                paint(u, 0, -(1 - bounce_out(q)) * size * 1.2 * amt, alpha=min(1, q * 4))
    elif fid == "spinT":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q > 0:
                paint(u, rot=(1 - E(q)) * math.pi * 2 * amt, sc=max(0.01, E(q)), alpha=q)
    elif fid == "slideT":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q > 0:
                paint(u, -(1 - E(q)) * size * 3 * amt, 0, alpha=min(1, q * 3))
    elif fid == "zoomT":
        for i, u in enumerate(units):
            q = prog(i, n)
            if q > 0:
                paint(u, sc=1 + (1 - E(q)) * 2.5 * amt, alpha=q)
    elif fid == "maskreveal":
        for u in units:
            paint(u)
        w, hh = tw + size, th + size
        edge = int(cx0 - w / 2 + w * E(p))
        arr = cv.a
        arr[:, min(W, max(0, edge)):] = 0
        if p < 1:
            bar = Image.new("RGBA", (3, int(hh)), (*fill0, 255))
            cv.blit(bar, edge - 2, int(cy0 - hh / 2))
    elif fid == "disappear":
        for i, u in enumerate(units):
            q = prog(n - 1 - i, n)
            paint(u, 0, -(1 - q) * size * 0.3 * amt, alpha=q)
    elif fid == "glitchT":
        tq = math.floor(local * spd * 10)
        j = amt * size * 0.12
        shift = (hsh(tq) - 0.5) * j * 2
        for col, o in (((255, 0, 68), -shift - j * 0.4), ((0, 242, 254), shift + j * 0.4)):
            for u in units:
                paint(u, o, 0, alpha=0.8, fill=col, no_stroke=True, additive=True)
        for u in units:
            paint(u, (hsh(tq * 3 + u["idx"]) - 0.5) * j * 3 if hsh(tq + u["idx"]) > 0.93 else 0, 0)
    elif fid == "neonT":
        fl = 0.75 + 0.25 * math.sin(local * spd * 9) + (-0.4 if hsh(math.floor(local * spd * 12)) > 0.96 else 0)
        c = _rgb(pr.get("color") or "#00f2fe")
        for r in (3, 2, 1):
            for u in units:
                paint(u, fill=(255, 255, 255) if r == 1 else c, no_stroke=True, alpha=1 if r == 1 else max(0, 0.55 * fl),
                      shadow={"c": c, "b": max(1, size * 0.18 * r * amt * 2 * fl)})
    elif fid == "shadowT":
        a = local * spd * 2
        d = size * 0.08 * amt * 2
        c = _rgb(pr.get("color") or "#000000", (0, 0, 0))
        for u in units:
            paint(u, shadow={"c": c, "a": 0.85, "b": max(1, size * 0.05), "x": math.cos(a) * d, "y": math.sin(a) * d})
    elif fid == "outlineT":
        for u in units:
            paint(u, no_stroke=True)
        col = pr.get("color")
        sc_ = _rgb(col) if col and str(col).lower() != "#ffffff" else _hsv(local * spd * 90)
        w = max(2, size * 0.04 * (0.7 + 0.5 * math.sin(local * spd * 4)) * (0.5 + amt))
        for u in units:
            paint(u, no_fill=True, stroke_only={"w": w, "c": sc_}, no_stroke=True)
    elif fid == "sparkleT":
        for u in units:
            paint(u)
        c = _rgb(pr.get("color") or "#fff6c2")
        N = int(round(10 + amt * 24))
        for i in range(N):
            ph = (local * spd * 0.9 + hsh(i * 7.3)) % 1
            tw_ = math.sin(ph * math.pi)
            x = (hsh(i * 3.1) - 0.5) * (tw + size * 0.4)
            y = (hsh(i * 5.7) - 0.5) * (th + size * 0.2)
            r = size * (0.06 + 0.1 * hsh(i * 9.1)) * tw_ * 1.5
            if r < 1:
                continue
            S = int(r * 2 + 2)
            tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            dd = ImageDraw.Draw(tile)
            m = S / 2
            dd.polygon([(m, 0), (m + r * 0.18, m - r * 0.18), (S, m), (m + r * 0.18, m + r * 0.18), (m, S), (m - r * 0.18, m + r * 0.18), (0, m), (m - r * 0.18, m - r * 0.18)], fill=(*c, 255))
            cv.blit(tile, int(cx0 + x - m), int(cy0 + y - m), tw_, True)
    elif fid == "d3T":
        a = local * spd * 0.8
        dx, dy = math.cos(a) * size * 0.012, math.sin(a) * size * 0.012 + size * 0.01
        depth = int(round(6 + amt * 10))
        c = _rgb(pr.get("color") or "#ff3b6b")
        for dd_ in range(depth, 0, -1):
            for u in units:
                paint(u, dx * dd_, dy * dd_, fill=c, no_stroke=True)
        for u in units:
            paint(u)
    elif fid == "vibrateT":
        tq = math.floor(local * spd * 40)
        for u in units:
            paint(u, (hsh(tq + u["idx"]) - 0.5) * size * 0.05 * amt * 2, (hsh(tq * 2 + u["idx"]) - 0.5) * size * 0.05 * amt * 2)
    elif fid == "pulseT":
        s = 1 + (0.5 + 0.5 * math.sin(local * spd * 6)) ** 2 * 0.18 * amt * 2
        for u in units:
            paint({**u, "x": u["x"] * s, "y": u["y"] * s}, sc=s)
    else:
        for u in units:
            paint(u)
    return cv.image()
