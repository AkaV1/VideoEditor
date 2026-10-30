"""Partículas y clima (14 emisores). Cada partícula es función determinista del tiempo (igual que la versión web)."""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

F = np.float32
PARTICLES: list = []
BYID: dict = {}


def get_particles(id):
    return BYID.get(id)


def _p(id, label, mn, mx, df, unit="", step=None):
    return {"id": id, "label": label, "min": mn, "max": mx, "def": df, "unit": unit,
            "step": step if step is not None else (1 if mx - mn > 20 else 0.05)}


def _sel(id, label, options, df):
    return {"id": id, "label": label, "type": "select", "options": [(str(v), l) for v, l in options], "def": df}


AMOUNT = {"id": "amount", "label": "Intensidad", "min": 0, "max": 100, "def": 80, "unit": "%"}


def fx(id, label, tags, params, draw):
    it = {"kind": "particles", "id": id, "label": label, "tags": tags, "params": [AMOUNT, *params], "draw": draw}
    PARTICLES.append(it)
    BYID[id] = it


def hash_(n):
    x = math.sin(n * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)


def hash2(a, b):
    return hash_(a * 57.0 + b * 113.0 + 7.3)


def clamp(x, a, b):
    return max(a, min(b, x))


def hsl(h, s, l, a=1.0):
    import colorsys
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l / 100.0, s / 100.0)
    return (r * 255, g * 255, b * 255, clamp(a, 0, 1))


def hex_rgb(h):
    h = str(h or "#ffffff").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    except Exception:
        return 255, 255, 255


def life(t, i, mn, mx):
    L = mn + hash_(i * 3.7 + 1) * (mx - mn)
    x = t / L + hash_(i * 1.3 + 5)
    return x - math.floor(x), math.floor(x), L


class X:
    """Lienzo de partículas: acumula contenido «normal» (source-over) y «aditivo» (lighter)."""

    def __init__(self, W, H, k, t, src):
        self.W, self.H, self.k, self.t, self.src = W, H, k, t, src
        self.over = np.zeros((H, W, 4), F)
        self.add = np.zeros((H, W, 3), F)
        self._pil = {}

    # --- sprites radiales (numpy)
    def glow(self, x, y, r, stops, mode="over"):
        r = max(0.5, r)
        x0, y0 = int(max(0, math.floor(x - r))), int(max(0, math.floor(y - r)))
        x1, y1 = int(min(self.W, math.ceil(x + r) + 1)), int(min(self.H, math.ceil(y + r) + 1))
        if x1 <= x0 or y1 <= y0:
            return
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(F)
        d = np.clip(np.sqrt((xx - x) ** 2 + (yy - y) ** 2) / r, 0, 1)
        pos = [s[0] for s in stops]
        chans = [np.interp(d, pos, [s[1][c] for s in stops]).astype(F) for c in range(4)]
        a = chans[3] * (d < 1.0)
        self._put(x0, y0, x1, y1, chans[0] / 255, chans[1] / 255, chans[2] / 255, a, mode)

    def _put(self, x0, y0, x1, y1, r, g, b, a, mode):
        if mode == "add":
            self.add[y0:y1, x0:x1] += np.stack([r * a, g * a, b * a], -1)
        else:
            dst = self.over[y0:y1, x0:x1]
            a3 = a[..., None]
            dst[...] = np.concatenate([np.stack([r, g, b], -1) * a3, a3], -1) + dst * (1 - a3)

    # --- formas con Pillow (sobrescriben)
    def pil(self, mode="over"):
        if mode not in self._pil:
            im = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
            self._pil[mode] = (im, ImageDraw.Draw(im))
        return self._pil[mode][1]

    def line(self, pts, width, col, mode="over"):
        c = (int(col[0]), int(col[1]), int(col[2]), int(clamp(col[3], 0, 1) * 255))
        if c[3] <= 0:
            return
        self.pil(mode).line(pts, fill=c, width=max(1, int(round(width))), joint="curve")

    def circle(self, x, y, r, fill=None, outline=None, width=1, mode="over"):
        d = self.pil(mode)
        f = None if fill is None else (int(fill[0]), int(fill[1]), int(fill[2]), int(clamp(fill[3], 0, 1) * 255))
        o = None if outline is None else (int(outline[0]), int(outline[1]), int(outline[2]), int(clamp(outline[3], 0, 1) * 255))
        d.ellipse((x - r, y - r, x + r, y + r), fill=f, outline=o, width=max(1, int(round(width))))

    def poly(self, pts, col, mode="over"):
        c = (int(col[0]), int(col[1]), int(col[2]), int(clamp(col[3], 0, 1) * 255))
        self.pil(mode).polygon(pts, fill=c)

    def rect(self, col, mode="over"):
        self.pil(mode).rectangle((0, 0, self.W, self.H), fill=(int(col[0]), int(col[1]), int(col[2]), int(clamp(col[3], 0, 1) * 255)))

    def result(self, base):
        """Compone sobre `base` (H,W,4 premultiplicado) y devuelve el nuevo fotograma."""
        over = self.over
        for mode, (im, _) in self._pil.items():
            a = np.asarray(im, dtype=F) / 255.0
            pa = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], -1)
            if mode == "add":
                self.add += pa[..., :3]
            else:
                over = pa + over * (1 - pa[..., 3:4])
        out = base * (1 - over[..., 3:4]) + over
        out[..., :3] += self.add
        out[..., :3] = np.minimum(out[..., :3], 1.0)
        out[..., 3] = np.clip(np.maximum(out[..., 3], over[..., 3]), 0, 1)
        out[..., :3] = np.minimum(out[..., :3], out[..., 3:4] if False else 1.0)
        return out.astype(F)


def draw_particles(img: np.ndarray, t: float, id: str, raw: dict | None, k: float | None = None) -> np.ndarray:
    it = BYID.get(id)
    if not it:
        return img
    H, W = img.shape[:2]
    p = {d["id"]: (raw or {}).get(d["id"], d["def"]) for d in it["params"]}
    for kk, v in list(p.items()):
        if isinstance(v, str):
            try:
                p[kk] = float(v)
            except ValueError:
                pass
    p["a"] = float(p.get("amount", 80)) / 100 * 1.25
    if k is None:
        k = W / 1280.0
    x = X(W, H, k, t, img)
    it["draw"](x, p)
    return x.result(img)


def _hold(p):
    return clamp(p["a"], 0, 1.2)


# ---------------------------------------------------------------- emisores
def d_rain(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    a = math.radians(p["angle"])
    dx, dy = math.sin(a), math.cos(a)
    if p["tint"] == "yes":
        x.rect((20, 30, 50, 0.22 * p["a"]))
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 0.35, 0.7)
        ln = (18 + hash_(i * 2.2) * 34) * k
        x0 = hash2(i, cyc) * (W + H * 0.5) - H * 0.25
        travel = H + ln * 2
        y = age * travel - ln
        xx = x0 + dx * (age * travel)
        x.line([(xx, y), (xx - dx * ln, y - dy * ln)], (0.7 + hash_(i * 5.1) * 1.3) * k,
               (200, 220, 255, (0.25 + hash_(i * 7.7) * 0.4) * _hold(p)))


def d_snow(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 4, 9)
        depth = 0.35 + hash_(i * 6.1) * 0.65
        xx = hash2(i, cyc) * W + math.sin(age * 12 + i) * 28 * k * depth
        y = -10 * k + age * (H + 20 * k)
        r = (0.6 + depth * p["size"] * 0.6) * k
        x.glow(xx, y, r, [(0, (255, 255, 255, 0.95 * depth * _hold(p))), (1, (255, 255, 255, 0))])


def d_confetti(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    cols = [330, 50, 180, 270, 120, 20, 210]
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 3, 5.5)
        xx = hash2(i, cyc) * W + math.sin(age * 9 + i) * 40 * k
        y = -20 * k + age * (H + 40 * k) * (0.7 + hash_(i * 2.9) * 0.6)
        w = (5 + hash_(i * 4.4) * 9) * k
        h = w * (0.5 + hash_(i * 8.1) * 0.8)
        rot = age * 14 * (hash_(i * 9.2) - 0.5) + i
        sy = math.cos(age * 18 + i)
        c, s = math.cos(rot), math.sin(rot)
        pts = []
        for px, py in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
            py *= sy
            pts.append((xx + px * c - py * s, y + px * s + py * c))
        x.poly(pts, hsl(cols[i % 7], 90, 58, clamp(p["a"], 0, 1)))


def d_sparks(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    ox, oy = W * 0.5, H * 0.85
    for i in range(int(p["count"])):
        age, cyc, L = life(t, i, 0.7, 1.6)
        ang = -math.pi / 2 + (hash2(i, cyc) - 0.5) * 1.6
        sp = (0.35 + hash2(i + 9, cyc) * 0.65) * (p["power"] / 100) * H * 1.1
        ts = age * L
        xx = ox + math.cos(ang) * sp * ts
        y = oy + math.sin(ang) * sp * ts + 0.5 * H * 1.4 * ts * ts
        vx = math.cos(ang) * sp
        vy = math.sin(ang) * sp + H * 1.4 * ts
        al = (1 - age) ** 1.3 * _hold(p)
        x.line([(xx, y), (xx - vx * 0.035, y - vy * 0.035)], (1 + hash_(i * 3.3) * 2) * k,
               (255, int(170 + hash_(i) * 70), int(60 + hash_(i * 2) * 60), al), "add")


def d_fire(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    hh = p["height"] / 100
    ys = int(H * (1 - hh))
    if ys < H:
        yy = np.arange(ys, H, dtype=F)
        al = (0.35 * p["a"]) * (yy - ys) / max(1, H - ys)
        x.over[ys:H, :, :3] += (np.array([255, 90, 10], F) / 255)[None, None, :] * al[:, None, None]
        x.over[ys:H, :, 3] = np.maximum(x.over[ys:H, :, 3], al[:, None])
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 0.7, 1.3)
        bx = hash2(i, cyc) * W
        xx = bx + math.sin(age * 9 + i * 2) * 22 * k * age
        y = H + 10 * k - age * H * hh * (0.7 + hash_(i * 3) * 0.5)
        r = (46 - 38 * age) * k * (0.6 + hash_(i * 5) * 0.8)
        hue = 52 - 50 * age
        c0 = hsl(hue, 100, 62 - 18 * age, 0.55 * (1 - age) * _hold(p))
        c1 = hsl(hue - 10, 100, 40, 0)
        x.glow(xx, y, r, [(0, c0), (1, c1)], "add")


def d_smoke(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    c = {"white": (240, 240, 245), "black": (25, 25, 28)}.get(p["tone"], (140, 140, 150))
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 3, 6)
        xx = W * (0.2 + hash2(i, cyc) * 0.6) + math.sin(age * 5 + i) * 50 * k + age * 60 * k
        y = H * 1.05 - age * H
        r = (50 + age * 140) * k
        al = math.sin(age * math.pi) * 0.32 * clamp(p["a"], 0, 1.3)
        x.glow(xx, y, r, [(0, (*c, al)), (1, (*c, 0))])


def d_bubbles(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    al = _hold(p)
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 3, 7)
        r = (6 + hash_(i * 3.3) * 26) * k
        xx = hash2(i, cyc) * W + math.sin(age * 10 + i) * 18 * k
        y = H + r - age * (H + r * 2)
        x.circle(xx, y, r, (200, 235, 255, 0.12 * al), (220, 245, 255, 0.7 * al), max(1, 1.6 * k))
        x.circle(xx - r * 0.35, y - r * 0.38, r * 0.2, (255, 255, 255, 0.75 * al))


def d_dust(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    for i in range(int(p["count"])):
        depth = 0.3 + hash_(i * 2.2) * 0.7
        xx = (hash_(i * 3.1) * W + t * 12 * k * depth + math.sin(t * 0.7 + i) * 20 * k) % W
        y = (hash_(i * 5.3) * H - t * 8 * k * depth + math.cos(t * 0.5 + i * 2) * 14 * k + H * 4) % H
        tw = 0.5 + 0.5 * math.sin(t * 1.5 + i * 3)
        r = (0.8 + depth * 2.8) * k
        x.glow(xx, y, r * 2, [(0, (255, 250, 235, 0.6 * tw * depth * _hold(p))), (1, (255, 250, 235, 0))], "add")


def d_leaves(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    cols = [28, 38, 18, 48, 8]
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 5, 9)
        xx = hash2(i, cyc) * W * 1.2 - W * 0.1 + math.sin(age * 8 + i) * 60 * k + age * 120 * k
        y = -30 * k + age * (H + 60 * k)
        s = (9 + hash_(i * 4.1) * 14) * k
        rot = math.sin(age * 6 + i) * 1.2 + age * 3
        sy = 0.55 + 0.45 * math.cos(age * 7 + i)
        # contorno de la hoja (dos curvas)
        pts = []
        for u in np.linspace(0, 1, 9):
            pts.append((3 * (1 - u) ** 2 * u * s * 0.9 + 3 * (1 - u) * u * u * s * 0.7, -s * (1 - u) ** 3 + 3 * (1 - u) ** 2 * u * -s * 0.4 + 3 * (1 - u) * u * u * s * 0.7 + u ** 3 * s))
        pts += [(-px, py) for px, py in reversed(pts)]
        c, sn = math.cos(rot), math.sin(rot)
        poly = [(xx + px * c - py * sy * sn, y + px * sn + py * sy * c) for px, py in pts]
        x.poly(poly, hsl(cols[i % 5], 78, 44, clamp(p["a"], 0, 1)))


def d_lightorbs(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    for i in range(int(p["count"])):
        xx = (hash_(i * 3.3) * W + math.sin(t * (0.3 + hash_(i) * 0.5) + i) * 80 * k + W) % W
        y = (hash_(i * 7.1) * H + math.cos(t * (0.25 + hash_(i * 2) * 0.4) + i * 2) * 60 * k + H) % H
        tw = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * (1 + hash_(i * 5) * 2) + i * 4))
        r = p["size"] * (0.4 + hash_(i * 9.9) * 0.9) * k
        hu = p["hue"] + hash_(i) * 40
        x.glow(xx, y, r, [(0, hsl(hu, 90, 70, 0.85 * tw * _hold(p))), (0.45, hsl(hu, 90, 60, 0.3 * tw)), (1, hsl(p["hue"], 90, 50, 0))], "add")


def d_fog(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    for i in range(8):
        sp = 14 + hash_(i * 3.1) * 18
        r = max(W, H) * (0.3 + hash_(i * 5.3) * 0.25)
        xx = ((hash_(i * 7.9) * W * 1.6 + t * sp * k) % (W * 1.6)) - W * 0.3
        y = H * (0.45 + hash_(i * 2.2) * 0.5) + math.sin(t * 0.3 + i) * 18 * k
        al = 0.2 * (p["density"] / 55) * clamp(p["a"], 0, 1.3)
        x.glow(xx, y, r, [(0, (225, 232, 240, al)), (1, (225, 232, 240, 0))])


def d_lightning(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    T = t * p["rate"]
    cyc = math.floor(T)
    ph = T - cyc
    if hash_(cyc * 1.9) < 0.15:
        return
    dur = 0.35
    if ph > dur:
        return
    e = 1 - ph / dur
    flick = 1 if ph < 0.12 else 0.5 + 0.5 * math.sin(ph * 90)

    def bolt(bx, by, ln, depth, w):
        pts = [(bx, by)]
        cx, cy = bx, by
        steps = max(6, round(ln / (H * 0.05)))
        subs = []
        for i in range(steps):
            cx += (hash2(cyc + depth * 7, i + ln) - 0.5) * W * 0.09
            cy += ln / steps
            pts.append((cx, cy))
            if depth < 2 and hash2(cyc + depth * 3, i * 1.7) > 0.86:
                subs.append((cx, cy, ln * 0.45, depth + 1, w * 0.6))
        for lw, col in ((w * 6, (120, 160, 255, 0.25 * e * flick)), (w * 2.5, (190, 215, 255, 0.5 * e * flick)), (w, (255, 255, 255, 0.95 * e * flick))):
            x.line(pts, lw * k, col, "add")
        for s in subs:
            bolt(*s)

    bolt(W * (0.2 + hash_(cyc * 4.1) * 0.6), -10, H * 0.95, 0, 2.2)
    x.rect((200, 220, 255, 0.45 * e * e * flick * clamp(p["a"], 0, 1.2)), "add")


def d_raindrops(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    src = x.src
    from .core import samp
    al = clamp(p["a"], 0, 1)
    for i in range(int(p["count"])):
        age, cyc, _ = life(t, i, 4, 9)
        cx = hash2(i, cyc) * W
        slide = max(0, age - 0.5) * 2
        y0 = hash2(i + 20, cyc) * H * 0.8
        cy = y0 + slide * slide * H * 0.35
        r = (7 + hash_(i * 4.3) * 13) * k * min(1, age * 6)
        x0, y0b = int(max(0, cx - r)), int(max(0, cy - r))
        x1, y1 = int(min(W, cx + r + 1)), int(min(H, cy + r + 1))
        if x1 > x0 and y1 > y0 and r > 1:
            yy, xx = np.mgrid[y0b:y1, x0:x1].astype(F)
            inside = ((xx - cx) ** 2 + (yy - cy) ** 2) <= r * r
            # imagen invertida y ampliada 1.5 alrededor del centro de la gota
            sx = cx - (xx - cx) * 1.5
            sy = cy - (yy - cy) * 1.5
            u = np.clip(sx, 0, W - 1) / W
            v = 1 - np.clip(sy, 0, H - 1) / H
            lens = samp(src, u, v)
            a = (inside * al).astype(F)
            x._put(x0, y0b, x1, y1, lens[..., 0], lens[..., 1], lens[..., 2], a, "over")
        x.circle(cx, cy, r, None, (255, 255, 255, 0.35 * al), max(1, k))
        x.circle(cx - r * 0.35, cy - r * 0.4, r * 0.18, (255, 255, 255, 0.6 * al))
        if slide > 0:
            x.line([(cx, y0), (cx, cy)], r * 0.5, (255, 255, 255, 0.12 * al))


def d_splashes(x, p):
    W, H, k, t = x.W, x.H, x.k, x.t
    r, g, b = hex_rgb(p["color"])
    al = clamp(p["a"], 0, 1)
    for s in range(4):
        period = 1.6 + hash_(s * 2.3) * 1.2
        xv = t / period + hash_(s * 5.1)
        cyc = math.floor(xv)
        ph = xv - cyc
        ox = (0.15 + hash2(s, cyc) * 0.7) * W
        oy = (0.25 + hash2(s + 9, cyc) * 0.55) * H
        e = 1 - (1 - clamp(ph / 0.7, 0, 1)) ** 3
        fade = 1 - clamp((ph - 0.25) / 0.75, 0, 1)
        if fade <= 0:
            continue
        x.circle(ox, oy, e * 70 * k, None, (r, g, b, 0.6 * fade * al), max(1, 3 * k * (1 - e)))
        for i in range(int(p["count"])):
            ang = hash2(s * 31 + i, cyc) * math.pi * 2
            sp = (0.3 + hash2(s * 17 + i, cyc + 3) * 0.9) * 160 * k
            tt = ph * 1.2
            x1 = ox + math.cos(ang) * sp * tt
            y1 = oy + math.sin(ang) * sp * tt + 420 * k * tt * tt
            x.circle(x1, y1, (1 + hash_(i * 3.3) * 3) * k * (1 - ph * 0.5), (r, g, b, 0.9 * fade * al))


COUNT = lambda a, b, d: _p("count", "Cantidad", a, b, d, "")
fx("rain", "Lluvia", ["lluvia", "agua", "tormenta", "clima"], [COUNT(20, 500, 200), _p("angle", "Inclinación", -30, 30, 12, "°"),
   _sel("tint", "Oscurecer", [("yes", "Sí"), ("no", "No")], "yes")], d_rain)
fx("snow", "Nieve", ["nieve", "copos", "invierno", "clima"], [COUNT(10, 300, 120), _p("size", "Tamaño", 1, 10, 4, " px")], d_snow)
fx("confetti", "Confeti", ["confeti", "fiesta", "celebración", "cumpleaños"], [COUNT(20, 300, 120)], d_confetti)
fx("sparks", "Chispas", ["chispas", "fuego", "soldadura", "brasas"], [COUNT(10, 200, 60), _p("power", "Fuerza", 20, 100, 60, "%")], d_sparks)
fx("fire", "Fuego", ["fuego", "llamas", "incendio", "calor"], [COUNT(20, 200, 90), _p("height", "Altura", 15, 80, 45, "%")], d_fire)
fx("smoke", "Humo", ["humo", "vapor", "niebla", "ceniza"], [COUNT(5, 60, 22), _sel("tone", "Color", [("gray", "Gris"), ("white", "Blanco"), ("black", "Negro")], "gray")], d_smoke)
fx("bubbles", "Burbujas", ["burbujas", "agua", "espuma", "submarino"], [COUNT(5, 100, 36)], d_bubbles)
fx("dust", "Polvo", ["polvo", "partículas", "motas", "atmósfera"], [COUNT(10, 300, 90)], d_dust)
fx("leaves", "Hojas", ["hojas", "otoño", "viento", "naturaleza"], [COUNT(5, 100, 28)], d_leaves)
fx("lightorbs", "Partículas luminosas", ["luciérnagas", "bokeh", "luces", "orbes", "magia"],
   [COUNT(5, 80, 26), _p("hue", "Tono", 0, 360, 45, "°"), _p("size", "Tamaño", 4, 60, 22, " px")], d_lightorbs)
fx("fog", "Niebla", ["niebla", "bruma", "misterio", "atmósfera"], [_p("density", "Densidad", 10, 100, 55, "%")], d_fog)
fx("lightning", "Rayos", ["rayos", "relámpago", "tormenta", "trueno"], [_p("rate", "Frecuencia", 0.2, 3, 0.8, " /s", 0.1)], d_lightning)
fx("raindrops", "Gotas en el cristal", ["gotas", "cristal", "ventana", "lluvia", "agua"], [COUNT(5, 80, 30)], d_raindrops)
fx("splashes", "Salpicaduras", ["salpicaduras", "gotas", "impacto", "pintura", "agua"],
   [_p("count", "Gotas por salpicadura", 8, 40, 18, ""), _sel("color", "Color", [("#8fd3ff", "Agua"), ("#ff3b5c", "Rojo"), ("#ffd23b", "Amarillo"), ("#ffffff", "Blanco")], "#8fd3ff")], d_splashes)
