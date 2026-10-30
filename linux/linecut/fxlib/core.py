"""Utilidades de bajo nivel para los «kernels»: muestreo bilinear, desenfoques rápidos y ruido determinista.

Convención (igual que los shaders de la versión web): imágenes float32 (H, W, 4) con alfa PREMULTIPLICADO en 0..1,
fila 0 = arriba. Las coordenadas uv van de 0 a 1 con v = 1 ARRIBA (como GLSL).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

F = np.float32


class Ctx:
    """Contexto de una pasada: imagen de entrada, original, historial, tamaño y uniformes."""

    __slots__ = ("tex", "orig", "prev", "W", "H", "aspect", "time", "u", "U", "V", "_grid")

    def __init__(self, tex, orig, prev, time, u):
        self.tex, self.orig, self.prev = tex, orig, prev
        self.H, self.W = tex.shape[:2]
        self.aspect = self.W / float(self.H)
        self.time = float(time)
        self.u = u
        self._grid = None

    def g(self, k, d=0.0):
        v = self.u.get(k, d)
        return float(v) if np.isscalar(v) else v

    @property
    def grid(self):
        if self._grid is None:
            self._grid = grid(self.W, self.H)
        return self._grid


_grids: dict = {}


def grid(W: int, H: int):
    """(U, V) float32 (H, W): centros de píxel en uv, v hacia arriba."""
    k = (W, H)
    g = _grids.get(k)
    if g is None:
        u = ((np.arange(W, dtype=F) + 0.5) / W)[None, :].repeat(H, 0)
        v = (1.0 - (np.arange(H, dtype=F) + 0.5) / H)[:, None].repeat(W, 1)
        if len(_grids) > 6:
            _grids.clear()
        g = _grids[k] = (u, v)
    return g


def mirror_uv(u, v):
    def m(x):
        t = np.mod(x, 2.0)
        return np.where(t < 1.0, t, 2.0 - t)
    return m(u), m(v)


def samp(img, u, v, mirror=False):
    """Muestreo bilinear (borde = repetir último píxel, o espejo)."""
    h, w = img.shape[:2]
    if mirror:
        u, v = mirror_uv(u, v)
    x = np.asarray(u * w - 0.5, dtype=F)
    y = np.asarray((1.0 - v) * h - 0.5, dtype=F)
    x0 = np.floor(x)
    y0 = np.floor(y)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    xi0 = np.clip(x0, 0, w - 1).astype(np.intp)
    yi0 = np.clip(y0, 0, h - 1).astype(np.intp)
    xi1 = np.minimum(xi0 + 1, w - 1)
    yi1 = np.minimum(yi0 + 1, h - 1)
    flat = img.reshape(-1, img.shape[-1])
    r0, r1 = yi0 * w, yi1 * w
    a = flat[r0 + xi0]
    b = flat[r0 + xi1]
    c = flat[r1 + xi0]
    d = flat[r1 + xi1]
    top = a + (b - a) * fx
    bot = c + (d - c) * fx
    return top + (bot - top) * fy


def unp(s):
    a = s[..., 3:4]
    return np.where(a > 0.001, s[..., :3] / np.maximum(a, 1e-4), 0.0).astype(F)


def pm(c, a):
    if np.ndim(a) == 2:
        a = a[..., None]
    return np.concatenate([c * a, np.broadcast_to(a, c.shape[:2] + (1,))], axis=-1).astype(F)


def lum(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def smoothstep(e0, e1, x):
    d = np.asarray(e1 - e0, dtype=F)
    d = np.where(np.abs(d) < 1e-9, F(1e-6), d)
    t = np.clip((x - e0) / d, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def fract(x):
    return x - np.floor(x)


def mix(a, b, t):
    return a + (b - a) * t


def hash2(px, py):
    """Hash 2D determinista en 0..1 (equivalente al del shader)."""
    px = np.asarray(px, F)
    py = np.asarray(py, F)
    px = px * F(123.34)
    px -= np.floor(px)
    py = py * F(456.21)
    py -= np.floor(py)
    d = px * (px + F(45.32)) + py * (py + F(45.32))
    px = px + d
    py = py + d
    r = px * py
    r -= np.floor(r)
    return r


def hash1(n):
    return fract(np.sin(np.asarray(n, np.float64) * 127.1) * 43758.5453).astype(F)


def vnoise(px, py):
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = px - ix, py - iy
    fx = fx * fx * (3.0 - 2.0 * fx)
    fy = fy * fy * (3.0 - 2.0 * fy)
    a, b = hash2(ix, iy), hash2(ix + 1.0, iy)
    c, d = hash2(ix, iy + 1.0), hash2(ix + 1.0, iy + 1.0)
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def fbm(px, py):
    s = 0.0
    a = 0.5
    for _ in range(5):
        s = s + a * vnoise(px, py)
        px, py = px * 2.02, py * 2.02
        a *= 0.5
    return s


def rot2(a, x, y):
    """Aplica mat2(c,-s,s,c) * (x,y) como en GLSL."""
    c, s = np.cos(a), np.sin(a)
    return c * x + s * y, -s * x + c * y


# ------------------------------------------------------------ desenfoques
def _box(a, r, axis):
    """Desenfoque de caja de radio entero r a lo largo de `axis` (borde repetido), vía suma acumulada."""
    if r <= 0:
        return a
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(F)


def gblur(img, sx, sy=None):
    """Aproximación gaussiana (3 pasadas de caja) con sigma en píxeles."""
    sy = sx if sy is None else sy
    out = img
    for sig, axis in ((sx, 1), (sy, 0)):
        if sig < 0.35:
            continue
        # tres cajas de ancho w ≈ sqrt(12 s²/3 + 1)
        w = max(1, int(round(np.sqrt(12.0 * sig * sig / 3.0 + 1.0))))
        r = (w - 1) // 2 if w % 2 else w // 2
        for _ in range(3):
            out = _box(out, max(0, r), axis)
    return out


def shift(img, dx, dy):
    """Desplaza la imagen (dx, dy píxeles, entero) repitiendo el borde: out[y,x] = img[y-dy, x-dx]."""
    dx, dy = int(round(dx)), int(round(dy))
    if dx == 0 and dy == 0:
        return img
    h, w = img.shape[:2]
    p = max(abs(dx), abs(dy))
    padded = np.pad(img, ((p, p), (p, p), (0, 0)), mode="edge")
    return padded[p - dy:p - dy + h, p - dx:p - dx + w]


def affine_sample(img, a, b, c, d, e, f):
    """Muestrea con la transformación inversa de píxeles de salida a entrada (x'=ax+by+c, y'=dx+ey+f) usando Pillow."""
    h, w = img.shape[:2]
    q = np.clip(img * 255.0 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(q, "RGBA")
    out = im.transform((w, h), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BILINEAR)
    return np.asarray(out, dtype=F) / 255.0
