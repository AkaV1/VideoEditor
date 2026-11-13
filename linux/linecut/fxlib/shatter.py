"""Transiciones «Cristal roto» y «Polvo»: la imagen se parte en triángulos que salen despedidos (o se deshacen en polvo).

Renderizado «hacia delante»: cada píxel de origen pertenece a un triángulo de una malla irregular (calculada una vez por
tamaño) y se coloca donde su triángulo esté en ese instante (desplazamiento, giro, volteo, escala y desvanecimiento)."""
from __future__ import annotations

import math

import numpy as np

F = np.float32

PRESETS = {
    # cols, rows, jitter
    0: dict(cols=15, rows=9, jit=0.42),    # cristal
    1: dict(cols=84, rows=47, jit=0.30),   # polvo
}
_geo: dict = {}


def _h(a, s):
    x = np.sin(a.astype(np.float64) * 127.1 + s * 311.7) * 43758.5453
    return (x - np.floor(x)).astype(F)


def geometry(W: int, H: int, mode: int):
    key = (W, H, mode)
    g = _geo.get(key)
    if g is not None:
        return g
    cfg = PRESETS[mode]
    cols, rows, jit = cfg["cols"], cfg["rows"], cfg["jit"]
    cw, ch = W / cols, H / rows
    # vértices con ruido (los del borde se quedan fijos)
    vi, vj = np.meshgrid(np.arange(cols + 1), np.arange(rows + 1))
    seed = vi * 57.0 + vj * 113.0 + 3.0
    vx = vi * cw + (_h(seed, 1) - 0.5) * 2 * jit * cw * ((vi > 0) & (vi < cols))
    vy = vj * ch + (_h(seed, 2) - 0.5) * 2 * jit * ch * ((vj > 0) & (vj < rows))
    ci, cj = np.meshgrid(np.arange(cols), np.arange(rows))
    flip = _h(ci * 31.0 + cj * 17.0, 4) > 0.5
    ci, cj, flip = ci.ravel(), cj.ravel(), flip.ravel()
    p00 = np.stack([vx[cj, ci], vy[cj, ci]], 1)
    p10 = np.stack([vx[cj, ci + 1], vy[cj, ci + 1]], 1)
    p01 = np.stack([vx[cj + 1, ci], vy[cj + 1, ci]], 1)
    p11 = np.stack([vx[cj + 1, ci + 1], vy[cj + 1, ci + 1]], 1)
    fl = flip[:, None]
    # dos triángulos por celda; la diagonal alterna
    a1 = np.where(fl, p00, p00); b1 = np.where(fl, p10, p10); c1 = np.where(fl, p11, p01)
    a2 = np.where(fl, p00, p10); b2 = np.where(fl, p11, p11); c2 = np.where(fl, p01, p01)
    A = np.empty((len(ci) * 2, 2), F); B = np.empty_like(A); C = np.empty_like(A)
    A[0::2], B[0::2], C[0::2] = a1, b1, c1
    A[1::2], B[1::2], C[1::2] = a2, b2, c2
    T = A.shape[0]
    cent = (A + B + C) / 3.0

    # asignación de cada píxel a un triángulo (se prueban las 9 celdas vecinas)
    ys, xs = np.mgrid[0:H, 0:W]
    px = (xs + 0.5).astype(F)
    py = (ys + 0.5).astype(F)
    ncx = np.clip((px / cw).astype(np.int32), 0, cols - 1)
    ncy = np.clip((py / ch).astype(np.int32), 0, rows - 1)
    tri = np.full((H, W), -1, np.int32)
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            cx_ = ncx + di
            cy_ = ncy + dj
            ok = (cx_ >= 0) & (cx_ < cols) & (cy_ >= 0) & (cy_ < rows) & (tri < 0)
            if not ok.any():
                continue
            base = np.where(ok, cy_ * cols + cx_, 0) * 2
            for k in (0, 1):
                t = base + k
                a, b, c = A[t], B[t], C[t]
                d = (b[..., 1] - c[..., 1]) * (a[..., 0] - c[..., 0]) + (c[..., 0] - b[..., 0]) * (a[..., 1] - c[..., 1])
                d = np.where(np.abs(d) < 1e-6, 1e-6, d)
                l1 = ((b[..., 1] - c[..., 1]) * (px - c[..., 0]) + (c[..., 0] - b[..., 0]) * (py - c[..., 1])) / d
                l2 = ((c[..., 1] - a[..., 1]) * (px - c[..., 0]) + (a[..., 0] - c[..., 0]) * (py - c[..., 1])) / d
                inside = ok & (l1 >= -1e-4) & (l2 >= -1e-4) & (1 - l1 - l2 >= -1e-4) & (tri < 0)
                tri = np.where(inside, t, tri)
    # huecos residuales: al triángulo nominal
    tri = np.where(tri < 0, (ncy * cols + ncx) * 2, tri)

    tid = np.arange(T, dtype=F)
    r = [_h(tid * 1.0 + 7.0, s) for s in (11, 12, 13, 14, 15)]
    zr = _h(tid + 3.0, 21)  # profundidad
    order = np.argsort(zr[tri.ravel()], kind="stable")
    g = dict(T=T, cent=cent.astype(F), r=r, tri=tri.ravel()[order].astype(np.int32),
             px=px.ravel()[order], py=py.ravel()[order], order=order)
    if len(_geo) > 6:
        _geo.clear()
    _geo[key] = g
    return g


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def render(tex: np.ndarray, q: float, mode: int, power: float, W: int, H: int) -> np.ndarray:
    """tex (H,W,4) premultiplicado; q 0 = intacta, 1 = deshecha. Devuelve (H,W,4)."""
    if q <= 1e-4:
        return tex
    if q >= 0.9999:
        return np.zeros_like(tex)
    g = geometry(W, H, mode)
    cent, r = g["cent"], g["r"]
    tri = g["tri"]
    T = g["T"]
    cx, cy = cent[:, 0], cent[:, 1]
    u = cx / W
    v = cy / H
    if mode == 0:
        ix, iy = 0.5, 0.45  # punto de impacto
        dist = np.sqrt(((u - ix) * W / H) ** 2 + (v - iy) ** 2)
        d = np.clip(dist / 1.15, 0, 1) * 0.8 + r[0] * 0.2
        qt = np.clip((q - d * 0.45) / 0.55, 0.0, 1.0)
        ang = np.arctan2(v - iy, (u - ix) * W / H) + (r[1] - 0.5) * 1.3
        sp = (0.10 + 0.34 * r[2]) * W * power
        e = qt ** 0.8
        dx = np.cos(ang) * sp * e
        dy = np.sin(ang) * sp * e * 0.9 + qt * qt * H * 0.55 * power
        rot = (r[3] - 0.5) * 2 * math.pi * 1.4 * qt
        flipx = np.maximum(np.abs(np.cos(r[4] * math.pi * 2.2 * qt)), 0.12)
        sc = 1.0 - 0.40 * qt
        al = 1.0 - smooth(0.55, 1.0, qt)
    else:
        d = np.clip(u * 0.55 + (1 - v) * 0.1 + r[0] * 0.35, 0, 1)
        qt = np.clip((q - d * 0.55) / 0.45, 0.0, 1.0)
        wind = np.array([1.0, -0.42], F)
        wind /= np.linalg.norm(wind)
        sp = (0.05 + 0.34 * r[2] ** 1.5) * W * power
        e = qt ** 1.6
        turb = (r[1] - 0.5) * 2 * 0.16 * W * e
        dx = wind[0] * sp * e - wind[1] * turb * 0.5
        dy = wind[1] * sp * e * 0.7 + turb + (r[3] - 0.3) * 0.05 * H * e
        rot = (r[4] - 0.5) * 6.0 * qt
        flipx = np.ones(T, F)
        sc = 1.0 - 0.88 * qt ** 0.9
        al = 1.0 - smooth(0.25, 1.0, qt)
    moving = qt > 0.0
    mv = moving[tri]
    out = np.zeros_like(tex)
    # los triángulos aún intactos se copian tal cual
    flat_src = tex.reshape(-1, 4)
    still = ~mv
    ox = (g["px"][still] - 0.5).astype(np.int32)
    oy = (g["py"][still] - 0.5).astype(np.int32)
    out[oy, ox] = tex[oy, ox]
    ti = tri[mv]
    if ti.size:
        px, py = g["px"][mv], g["py"][mv]
        rx = (px - cx[ti]) * flipx[ti] * sc[ti]
        ry = (py - cy[ti]) * sc[ti]
        cr, sr = np.cos(rot)[ti], np.sin(rot)[ti]
        X = cx[ti] + dx[ti] + rx * cr - ry * sr
        Y = cy[ti] + dy[ti] + rx * sr + ry * cr
        col = tex[(py - 0.5).astype(np.int32), (px - 0.5).astype(np.int32)] * al[ti][:, None]
        keep = al[ti] > 0.004
        X, Y, col = X[keep], Y[keep], col[keep]
        Xi = np.floor(X - 0.5).astype(np.int32)
        Yi = np.floor(Y - 0.5).astype(np.int32)
        for ddx, ddy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            xx, yy = Xi + ddx, Yi + ddy
            ok = (xx >= 0) & (xx < W) & (yy >= 0) & (yy < H)
            out[yy[ok], xx[ok]] = col[ok]
    return out
