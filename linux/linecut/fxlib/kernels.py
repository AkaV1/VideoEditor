"""Kernels de imagen (equivalentes a los shaders de la versión web). Cada uno recibe un Ctx y devuelve (H, W, 4) premultiplicado."""
from __future__ import annotations

import math

import numpy as np

from .core import (F, grid, affine_sample, fbm, fract, gblur, hash1, hash2, lum, mix, pm, rot2, samp, shift, smoothstep,
                   unp, vnoise)

PI = math.pi
KERNELS: dict = {}


def kernel(fn):
    KERNELS[fn.__name__[2:]] = fn
    return fn


def step(e, x):
    return (x >= e).astype(F)


def _scale_about(img, cx_uv, cy_uv, s):
    """Muestrea img(p') con p' = p + (c - p)*s en píxeles (zoom alrededor de c); s escalar."""
    h, w = img.shape[:2]
    cx, cy = cx_uv * w, (1.0 - cy_uv) * h
    k = 1.0 - s
    if abs(k) < 1e-4:
        k = 1e-4
    return affine_sample(img, k, 0, cx * s, 0, k, cy * s)


def _rot_about(img, ang, cx_uv=0.5, cy_uv=0.5):
    """Muestrea rotando el origen `ang` rad alrededor de un punto (espacio de píxeles cuadrados), signo como rot2 de GLSL."""
    h, w = img.shape[:2]
    cx, cy = cx_uv * w, (1.0 - cy_uv) * h
    c, s = math.cos(ang), math.sin(ang)
    # (dx', dy') = [[c,-s],[s,c]] (dx, dy)
    return affine_sample(img, c, -s, cx - c * cx + s * cy, s, c, cy - s * cx - c * cy)


# ------------------------------------------------------------------ desenfoques
@kernel
def k_copy(c):
    return c.tex


@kernel
def k_blur(c):
    r = c.g("uAmt") * c.g("uA")
    if r < 0.0004:
        return c.tex
    return gblur(c.tex, max(0.3, r * c.H * 0.5))


@kernel
def k_dirblur(c):
    L = c.g("uAmt") * c.g("uA")
    a = math.radians(c.g("uB") + c.g("uC") * c.time * c.g("uSpd"))
    dxp = math.cos(a) * L * c.H
    dyp = math.sin(a) * L * c.H
    n = int(min(24, max(3, math.hypot(dxp, dyp) + 1)))
    acc = np.zeros_like(c.tex, dtype=np.float32)
    for i in range(n):
        f = i / (n - 1.0) - 0.5
        acc += shift(c.tex, -f * dxp, f * dyp)
    return acc / n


@kernel
def k_zoomblur(c):
    amt, A = c.g("uAmt"), c.g("uA")
    cx, cy = c.g("uC"), c.g("uD")
    thr_mode = c.g("uB") > 0.5
    thr = c.g("uThr")
    n = 16
    acc = np.zeros_like(c.tex, dtype=np.float32)
    for i in range(n):
        f = i / (n - 1.0)
        t = _scale_about(c.tex, cx, cy, amt * A * f)
        if thr_mode:
            l = lum(unp(t))
            t = t * smoothstep(thr, thr + 0.25, l)[..., None]
        acc += t
    acc /= n
    if thr_mode:
        o = c.tex
        col = np.asarray(c.g("uCol", (1, 1, 1)), F)
        rgb = o[..., :3] + acc[..., :3] * 1.6 * col * amt
        a = np.maximum(o[..., 3], np.minimum(1.0, acc[..., 3] * amt))
        return np.concatenate([rgb, a[..., None]], -1).astype(F)
    return acc


@kernel
def k_spinblur(c):
    a = c.g("uAmt") * c.g("uA")
    n = 12
    acc = np.zeros_like(c.tex, dtype=np.float32)
    for i in range(n):
        f = i / (n - 1.0) - 0.5
        acc += _rot_about(c.tex, a * f)
    return acc / n


# ------------------------------------------------------------------ color / canales
@kernel
def k_rgb(c):
    amt, A = c.g("uAmt"), c.g("uA")
    if c.g("uC") > 0.5:
        k = amt * A * 2.0
        r = _scale_about(c.tex, 0.5, 0.5, -k)
        b = _scale_about(c.tex, 0.5, 0.5, k)
    else:
        a = math.radians(c.g("uB") + 30.0 * math.sin(c.time * c.g("uSpd") * 2.0) * (1.0 if c.g("uD") >= 0.5 else 0.0))
        dxp = math.cos(a) * amt * A * c.H
        dyp = math.sin(a) * amt * A * c.H
        r = shift(c.tex, -dxp, dyp)
        b = shift(c.tex, dxp, -dyp)
    g = c.tex
    al = np.maximum(np.maximum(r[..., 3], g[..., 3]), b[..., 3])
    return np.stack([r[..., 0], g[..., 1], b[..., 2], al], -1).astype(F)


@kernel
def k_invert(c):
    s = c.tex
    col = unp(s)
    return pm(mix(col, 1.0 - col, c.g("uAmt")), s[..., 3])


@kernel
def k_posterize(c):
    s = c.tex
    col = unp(s)
    L = mix(32.0, c.g("uA"), min(1.0, max(0.0, c.g("uAmt"))))
    return pm(np.floor(col * L + 0.5) / L, s[..., 3])


@kernel
def k_grade(c):
    s = c.tex
    soft = c.g("uSoft")
    if soft > 0.0:
        b = gblur(s, max(0.4, 0.012 * (1.0 + soft * 3.0) * c.H * 0.5))
        s = mix(s, np.maximum(s, b), soft * 0.6)
    o = unp(s)
    col = o + c.g("uBri")
    col = (col - 0.5) * c.g("uCon", 1.0) + 0.5
    l = lum(col)[..., None]
    col = l + (col - l) * c.g("uSat", 1.0)
    tint, temp = c.g("uTint"), c.g("uTemp")
    col = col + np.array([temp * 0.10, tint * -0.05, -temp * 0.10], F) + np.array([0.0, tint * 0.08, 0.0], F)
    col = np.power(np.maximum(col, 0.0), 1.0 / max(c.g("uGam", 1.0), 0.1))
    l = lum(col)
    sh = np.asarray(c.g("uSh", (0, 0, 0)), F)
    hi = np.asarray(c.g("uHi", (0, 0, 0)), F)
    col = col + sh * (1.0 - smoothstep(0.0, 0.55, l))[..., None] + hi * smoothstep(0.45, 1.0, l)[..., None]
    fade = c.g("uFade")
    col = col * (1.0 - fade * 0.6) + fade * 0.12
    col = mix(o, col, c.g("uAmt", 1.0))
    return pm(np.clip(col, 0, 1), s[..., 3])


# ------------------------------------------------------------------ digital / glitch
@kernel
def k_glitch(c):
    U, V = c.grid
    tq = math.floor(c.time * c.g("uSpd") * 10.0)
    amt = c.g("uAmt")
    A, B = c.g("uA"), c.g("uB")
    bands = mix(8.0, 40.0, float(hash1(tq + 3.0)))
    by = np.floor(V * bands)
    act = step(1.0 - amt * 0.9, hash2(by, np.full_like(by, tq)))
    px = U + (hash2(by, np.full_like(by, tq + 9.0)) - 0.5) * 0.35 * amt * act * A
    bx, byy = np.floor(U * 12.0), np.floor(V * 8.0)
    ba = step(1.0 - amt * 0.25, hash2(bx + tq, byy + tq))
    sh = (hash2(bx + tq * 1.7, byy + tq * 1.7) - 0.5) * 0.08 * ba * amt + 0.012 * amt * B
    r = samp(c.tex, px + sh, V)
    g = samp(c.tex, px, V)
    b = samp(c.tex, px - sh, V)
    al = np.maximum(np.maximum(r[..., 3], g[..., 3]), b[..., 3])
    out = np.stack([r[..., 0], g[..., 1], b[..., 2], al], -1)
    noise = np.stack([hash2(bx, byy), hash2(bx + 1.0, byy + 1.0), hash2(bx + 2.0, byy + 2.0)], -1)
    out[..., :3] += (ba * amt * 0.15)[..., None] * noise * out[..., 3:4]
    return out.astype(F)


@kernel
def k_tear(c):
    U, V = c.grid
    tq = math.floor(c.time * c.g("uSpd") * 8.0)
    k = c.g("uA")
    y = np.floor(V * k) / k
    amt = c.g("uAmt")
    act = step(0.82 - amt * 0.3, hash2(y * 13.0, np.full_like(y, tq)))
    off = (hash2(y, np.full_like(y, tq + 4.0)) - 0.5) * 0.5 * amt * act
    out = samp(c.tex, U + off, V)
    edge = act * smoothstep(0.01, 0.0, np.abs(fract(V * k) - 0.02)) * amt
    out[..., :3] += (edge * 0.5)[..., None] * out[..., 3:4]
    return out


# ------------------------------------------------------------------ distorsiones
@kernel
def k_wave(c):
    U, V = c.grid
    t = c.time * c.g("uSpd") * 3.0
    A, C = c.g("uA"), c.g("uC")
    amp = c.g("uAmt") * c.g("uB")
    pu, pv = U.copy(), V.copy()
    if C < 0.5 or C > 1.5:
        pu = pu + np.sin(V * A + t) * amp / c.aspect
    if C > 0.5:
        pv = pv + np.sin(U * A * c.aspect * 0.6 + t * 1.1) * amp
    return samp(c.tex, pu, pv, mirror=True)


@kernel
def k_ripple(c):
    U, V = c.grid
    dx = (U - c.g("uC")) * c.aspect
    dy = V - c.g("uD")
    r = np.sqrt(dx * dx + dy * dy)
    w = np.sin(r * c.g("uA") - c.time * c.g("uSpd") * 4.0) * c.g("uAmt") * c.g("uB") * np.exp(-r * 1.5)
    dirx, diry = dx / (r + 1e-4), dy / (r + 1e-4)
    return samp(c.tex, U + dirx * w / c.aspect, V + diry * w, mirror=True)


@kernel
def k_heat(c):
    U, V = c.grid
    t = c.time * c.g("uSpd")
    A = c.g("uA")
    nx = fbm(U * A, V * A * 0.7 - t * 1.5) - 0.5
    ny = fbm(U * A + 7.0, V * A * 0.7 - t * 1.2) - 0.5
    g = mix(1.0, smoothstep(1.0, 0.0, V) * 1.5, c.g("uC"))
    k = c.g("uAmt") * c.g("uB") * g
    return samp(c.tex, U + nx * k / c.aspect, V + ny * k, mirror=True)


@kernel
def k_swirl(c):
    U, V = c.grid
    cx, cy = c.g("uC"), c.g("uD")
    dx, dy = (U - cx) * c.aspect, V - cy
    r = np.sqrt(dx * dx + dy * dy)
    k = np.clip(1.0 - r / c.g("uA"), 0.0, 1.0)
    a = c.g("uAmt") * c.g("uB") * k * k
    rx, ry = rot2(a, dx, dy)
    return samp(c.tex, cx + rx / c.aspect, cy + ry, mirror=True)


@kernel
def k_lens(c):
    U, V = c.grid
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    r = np.sqrt(dx * dx + dy * dy)
    s = c.g("uAmt") * c.g("uA")
    B = c.g("uB")
    ox, oy = dx, dy
    if B < 0.5:
        k = s * 1.2
        f = (1.0 + k * r * r) * (1.0 / (1.0 + k * 0.35))
        ox, oy = dx * f, dy * f
    elif B < 1.5:
        q = np.clip(r / 0.5, 0, 1)
        f = 1.0 - s * (1.0 - q * q) * 0.9
        f = np.where(r <= 0.5, f, 1.0)
        ox, oy = dx * f, dy * f
    elif B < 2.5:
        q = np.clip(r / 0.5, 0, 1)
        f = 1.0 + s * (1.0 - q * q) * 1.2
        f = np.where(r <= 0.5, f, 1.0)
        ox, oy = dx * f, dy * f
    elif B < 3.5:
        g = np.exp(-(dx * dx + dy * dy) * 4.0)
        ox = dx * (1.0 - s * 0.6 * g)
    else:
        g = np.exp(-(dx * dx + dy * dy) * 4.0)
        oy = dy * (1.0 - s * 0.6 * g)
    return samp(c.tex, 0.5 + ox / c.aspect, 0.5 + oy, mirror=True)


@kernel
def k_mirror(c):
    U, V = c.grid
    m = c.g("uA")
    pu, pv = U.copy(), V.copy()
    if m < 0.5:
        pu = np.where(pu > 0.5, 1.0 - pu, pu)
    elif m < 1.5:
        pu = np.where(pu < 0.5, 1.0 - pu, pu)
    elif m < 2.5:
        pv = np.where(pv > 0.5, 1.0 - pv, pv)
    elif m < 3.5:
        pv = np.where(pv < 0.5, 1.0 - pv, pv)
    else:
        pu, pv = 0.5 - np.abs(pu - 0.5), 0.5 - np.abs(pv - 0.5)
    return mix(c.tex, samp(c.tex, pu, pv), min(1.0, c.g("uAmt") * 2.0))


@kernel
def k_kaleido(c):
    U, V = c.grid
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx) + c.time * c.g("uSpd") * 0.2
    seg = PI / c.g("uA")
    a = np.mod(a, 2.0 * seg)
    a = np.abs(a - seg)
    B = c.g("uB")
    pu = r * np.cos(a) * B / c.aspect + 0.5
    pv = r * np.sin(a) * B + 0.5
    return mix(c.tex, samp(c.tex, pu, pv, mirror=True), min(1.0, c.g("uAmt") * 1.5))


@kernel
def k_tunnel(c):
    U, V = c.grid
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    r = np.sqrt(dx * dx + dy * dy) + 1e-3
    a = np.arctan2(dy, dx) / (2.0 * PI)
    pu = fract(a * c.g("uA"))
    pv = fract(0.25 / r * c.g("uB") + c.time * c.g("uSpd") * 0.3)
    t = samp(c.tex, pu, pv) * smoothstep(0.0, 0.18, r)[..., None]
    return mix(c.tex, t, min(1.0, c.g("uAmt") * 1.5))


@kernel
def k_tile(c):
    U, V = c.grid
    A = c.g("uA")
    pu, pv = U * A, V * A
    fu, fv = fract(pu), fract(pv)
    if c.g("uB") > 0.5:
        iu, iv = np.floor(pu), np.floor(pv)
        fu = np.where(np.mod(iu, 2.0) >= 1.0, 1.0 - fu, fu)
        fv = np.where(np.mod(iv, 2.0) >= 1.0, 1.0 - fv, fv)
    return mix(c.tex, samp(c.tex, fu, fv), min(1.0, c.g("uAmt") * 2.0))


@kernel
def k_pixel(c):
    amt = c.g("uAmt")
    if amt < 0.02:
        return c.tex
    U, V = c.grid
    n = mix(400.0, c.g("uA"), min(1.0, max(0.0, amt)))
    gx, gy = n, n / c.aspect
    cu = (np.floor(U * gx) + 0.5) / gx
    cv = (np.floor(V * gy) + 0.5) / gy
    out = samp(c.tex, cu, cv)
    B = c.g("uB")
    if B > 0.0:
        fu, fv = fract(U * gx), fract(V * gy)
        gap = np.minimum(step(fu, 0.08) + step(fv, 0.08), 1.0)
        out = out.copy()
        out[..., :3] *= (1.0 - B * gap * 0.6)[..., None]
    return out


@kernel
def k_edges(c):
    px = c.g("uA")
    s = c.tex
    L = lum(unp(s))
    d = max(1, int(round(px)))
    Lp = np.pad(L, d, mode="edge")
    h, w = L.shape

    def at(ox, oy):  # oy > 0 = arriba (v+)
        return Lp[d - oy * d:d - oy * d + h, d + ox * d:d + ox * d + w]
    tl, t, tr = at(-1, 1), at(0, 1), at(1, 1)
    l, r = at(-1, 0), at(1, 0)
    bl, b, br = at(-1, -1), at(0, -1), at(1, -1)
    gx = -tl - 2 * l - bl + tr + 2 * r + br
    gy = -tl - 2 * t - tr + bl + 2 * b + br
    e = np.clip(np.sqrt(gx * gx + gy * gy) * c.g("uB"), 0.0, 1.0)
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    C = c.g("uC")
    a = s[..., 3:4]
    amt = c.g("uAmt")
    if C < 0.5:
        return np.concatenate([np.repeat(e[..., None], 3, -1), np.ones_like(a)], -1).astype(F)
    if C < 1.5:
        rgb = unp(s) * (1.0 - 0.75 * amt) * a + e[..., None] * col * 2.0 * a
        return np.concatenate([rgb, a], -1).astype(F)
    rgb = s[..., :3] + e[..., None] * col * amt * 1.5 * a
    return np.concatenate([rgb, a], -1).astype(F)


# ------------------------------------------------------------------ retro
@kernel
def k_retro(c):
    U, V = c.grid
    amt, spd = c.g("uAmt"), c.g("uSpd")
    t = c.time * spd
    uu, vv = U.copy(), V.copy()
    Hh, Ww = c.H, c.W
    curve = c.g("uCurve")
    outside = None
    if curve > 0.0:
        dx, dy = uu - 0.5, vv - 0.5
        k = 1.0 + curve * (dx * dx + dy * dy) * 2.0
        uu, vv = 0.5 + dx * k, 0.5 + dy * k
        outside = (uu < 0) | (uu > 1) | (vv < 0) | (vv > 1)
    line = np.floor(vv * Hh / 3.0)
    jit, trk = c.g("uJit"), c.g("uTrack")
    wob = (hash2(line, np.full_like(line, math.floor(t * 24.0))) - 0.5) * jit * 0.01 * amt + np.sin(vv * 40.0 + t * 6.0) * jit * 0.0015 * amt
    tb = t * 0.15 - math.floor(t * 0.15)
    in_bar = smoothstep(0.05, 0.0, np.abs(vv - (1.0 - tb)))
    wob = wob + in_bar * trk * 0.03 * amt * (hash2(np.full_like(line, math.floor(t * 30.0)), line) - 0.5) * 3.0
    uu = uu + wob
    bl = c.g("uBleed") * 0.004 * amt
    r = samp(c.tex, uu + bl, vv)
    g = samp(c.tex, uu, vv)
    b = samp(c.tex, uu - bl, vv)
    a = np.maximum(np.maximum(r[..., 3], g[..., 3]), b[..., 3])
    col = unp(np.stack([r[..., 0], g[..., 1], b[..., 2], a], -1))
    l = lum(col)[..., None]
    col = l + (col - l) * mix(1.0, c.g("uTone", 1.0), amt)
    sc = 0.5 + 0.5 * np.sin(vv * Hh * 3.14159)
    col = col * (1.0 - c.g("uScan") * amt * (1.0 - sc) * 0.6)[..., None]
    f30 = math.floor(t * 30.0)
    col = col + ((hash2(uu * Ww + f30, vv * Hh + f30) - 0.5) * c.g("uNoise") * amt * 0.35)[..., None]
    dr = step(0.9985 - trk * 0.004 * amt, hash2(line * 3.1, np.full_like(line, f30)))
    col = mix(col, 0.9, (dr * 0.5)[..., None])
    ex, ey = (U - 0.5) * 1.2, (V - 0.5)
    col = col * (1.0 - c.g("uVig") * amt * smoothstep(0.4, 1.2, np.sqrt(ex * ex + ey * ey)))[..., None]
    col = col * (1.0 + c.g("uFlick") * amt * (float(hash1(math.floor(t * 20.0))) - 0.5) * 0.2)
    out = pm(np.clip(col, 0, 1), a)
    if outside is not None:
        out[outside] = (0, 0, 0, 1)
    return out


@kernel
def k_film(c):
    U, V = c.grid
    amt = c.g("uAmt")
    t = c.time * c.g("uSpd")
    fr = math.floor(t * 18.0)
    wv = c.g("uWeave")
    uu = U + (float(hash1(fr)) - 0.5) * wv * 0.004 * amt
    vv = V + (float(hash1(fr + 7.0)) - 0.5) * wv * 0.004 * amt
    s = samp(c.tex, uu, vv)
    col = unp(s)
    l = lum(col)[..., None]
    col = mix(col, l * np.array([1.1, 0.92, 0.72], F), c.g("uSepia") * amt)
    col = col + ((hash2(uu * c.W + fr, vv * c.H + fr) - 0.5) * c.g("uGrain") * 0.3 * amt)[..., None]
    sc = np.zeros_like(U)
    for i in range(3):
        x = float(hash1(fr * 7.0 + i * 13.0))
        w = np.abs(uu - x)
        sc = sc + smoothstep(0.0015, 0.0, w) * float(float(hash1(fr * 11.0 + i)) >= 0.5) * smoothstep(0.0, 0.1, fract(vv * 3.0 + float(hash1(fr + i))))
    col = col + (sc * c.g("uScratch") * 0.6 * amt)[..., None]
    gx, gy = 40.0 * c.aspect, 40.0
    cu, cv = np.floor(uu * gx), np.floor(vv * gy)
    dd = step(0.992, hash2(cu + fr, cv + fr))
    rx, ry = fract(uu * gx) - 0.5, fract(vv * gy) - 0.5
    rad = np.sqrt(rx * rx + ry * ry)
    col = col * (1.0 - dd * smoothstep(0.25, 0.0, rad) * c.g("uDust") * amt * 0.9)[..., None]
    col = col * (1.0 + (float(hash1(fr + 99.0)) - 0.5) * c.g("uFlick") * 0.25 * amt)
    vx, vy = (U - 0.5) * c.aspect * 0.8, V - 0.5
    col = col * (1.0 - c.g("uVigf") * amt * smoothstep(0.3, 1.0, np.sqrt(vx * vx + vy * vy)))[..., None]
    return pm(np.clip(col, 0, 1), s[..., 3])


# ------------------------------------------------------------------ luz
@kernel
def k_leak(c):
    U, V = c.grid
    s = c.tex
    t = c.time * c.g("uSpd") * 0.4
    A, B, amt = c.g("uA"), c.g("uB"), c.g("uAmt")
    add = np.zeros(U.shape + (3,), F)
    cols = [np.array([1.0, 0.45, 0.1], F), np.array([1.0, 0.15, 0.35], F), np.array([1.0, 0.8, 0.3], F)]
    for i in range(3):
        cx = 0.5 + 0.55 * math.sin(t * (0.7 + i * 0.3) + i * 2.1)
        cy = 0.5 + 0.5 * math.cos(t * (0.5 + i * 0.2) + i * 1.3)
        dx, dy = (U - cx) * c.aspect, V - cy
        d2 = dx * dx + dy * dy
        add += (np.exp(-d2 * A * 3.0))[..., None] * cols[i]
    add *= amt * B
    o = unp(s)
    o = 1.0 - (1.0 - o) * (1.0 - np.clip(add, 0, 1))
    return pm(o, s[..., 3])


@kernel
def k_flare(c):
    U, V = c.grid
    s = c.tex
    t = c.time * c.g("uSpd")
    lx = c.g("uC") + 0.15 * math.sin(t * 0.5)
    ly = c.g("uD") + 0.1 * math.cos(t * 0.4)
    dvx, dvy = 0.5 - lx, 0.5 - ly
    ax, ay = (U - lx) * c.aspect, V - ly
    d = np.sqrt(ax * ax + ay * ay)
    add = (np.exp(-d * 6.0) * 1.2)[..., None] * np.array([1.0, 0.9, 0.7], F)
    add = add + (np.exp(-d * d * 80.0) * 2.0)[..., None] * np.array([0.9, 0.95, 1.0], F)
    add = add + (np.exp(-np.abs(ay) * 60.0) * np.exp(-np.abs(ax) * 2.5) * 0.6)[..., None] * np.array([0.6, 0.8, 1.0], F)
    for i in range(1, 5):
        gpx, gpy = lx + dvx * i * 0.45, ly + dvy * i * 0.45
        gd = np.sqrt(((U - gpx) * c.aspect) ** 2 + (V - gpy) ** 2)
        r = 0.03 + 0.02 * i
        colr = mix(np.array([1.0, 0.4, 0.2], F), np.array([0.3, 0.6, 1.0], F), i / 4.0)
        add = add + smoothstep(r, r * 0.6, gd)[..., None] * colr * 0.15
    add = add * (c.g("uAmt") * c.g("uA"))
    o = unp(s)
    o = 1.0 - (1.0 - o) * (1.0 - np.clip(add, 0, 1))
    return pm(o, s[..., 3])


@kernel
def k_sweep(c):
    U, V = c.grid
    s = c.tex
    t = fract(c.time * c.g("uSpd") * 0.35)
    ang = math.radians(c.g("uB"))
    dx, dy = math.cos(ang), math.sin(ang)
    k = (U - 0.5) * dx + (V - 0.5) * dy + 0.5
    band = np.exp(-np.power((k - (t * 1.6 - 0.3)) * c.g("uA"), 2.0))
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    o = unp(s) + (band * c.g("uAmt") * 0.9)[..., None] * col
    return pm(np.clip(o, 0, 1), s[..., 3])


@kernel
def k_flash(c):
    s = c.tex
    f = c.g("uAmt")
    A = c.g("uA")
    if A > 0.01:
        ph = (c.time * c.g("uSpd") * A) % 1.0
        f *= (1.0 - ph) ** 3
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    o = mix(unp(s), col, min(1.0, max(0.0, f)))
    return pm(o, s[..., 3])


@kernel
def k_flicker(c):
    s = c.tex
    k = 1.0 + (float(hash1(math.floor(c.time * c.g("uSpd") * c.g("uA")))) - 0.5) * c.g("uAmt") * c.g("uB") * 2.0
    out = s.copy()
    out[..., :3] *= k
    return out


@kernel
def k_vignette(c):
    U, V = c.grid
    s = c.tex
    d = np.sqrt(((U - 0.5) * c.aspect * 0.75) ** 2 + (V - 0.5) ** 2)
    v = smoothstep(c.g("uA"), c.g("uA") + c.g("uB"), d) * c.g("uAmt")
    col = np.asarray(c.g("uCol", (0, 0, 0)), F)
    return pm(mix(unp(s), col, np.clip(v, 0, 1)[..., None]), s[..., 3])


@kernel
def k_shade(c):
    U, V = c.grid
    s = c.tex
    B, A = c.g("uB"), c.g("uA")
    if B < 0.5:
        g = smoothstep(0.0, 1.0, 1.0 - V * A)
    elif B < 1.5:
        g = smoothstep(0.0, 1.0, V * A)
    else:
        g = np.maximum(smoothstep(0.0, 1.0, 1.0 - V * A), smoothstep(0.0, 1.0, V * A))
    return pm(unp(s) * (1.0 - np.clip(g, 0, 1) * c.g("uAmt") * 0.9)[..., None], s[..., 3])


@kernel
def k_bright(c):
    s = c.tex
    l = lum(unp(s))
    thr = c.g("uThr")
    return s * smoothstep(thr, thr + 0.3, l)[..., None]


@kernel
def k_blurh(c):
    return gblur(c.tex, max(0.0, c.g("uA") * 1.3), 0.0)


@kernel
def k_blurv(c):
    return gblur(c.tex, 0.0, max(0.0, c.g("uA") * 1.3))


@kernel
def k_addglow(c):
    o = c.orig
    g = c.tex
    if g.shape[:2] != o.shape[:2]:
        u, v = grid(o.shape[1], o.shape[0])
        g = samp(g, u, v)
    gain = c.g("uGain")
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    rgb = o[..., :3] + g[..., :3] * gain * col
    a = np.maximum(o[..., 3], np.minimum(1.0, g[..., 3] * gain))
    return np.concatenate([rgb, a[..., None]], -1).astype(F)


@kernel
def k_speedlines(c):
    U, V = c.grid
    s = c.tex
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx)
    tq = math.floor(c.time * c.g("uSpd") * 14.0)
    ang = a / (2.0 * PI) * c.g("uA")
    idx = np.floor(ang)
    f = fract(ang)
    w = hash2(idx, np.full_like(idx, tq))
    th = 0.06 + 0.2 * hash2(idx, np.full_like(idx, tq + 3.0))
    m = smoothstep(th, th * 0.5, np.abs(f - 0.5)) * step(0.45, w)
    rad = smoothstep(0.18 + 0.2 * c.g("uB"), 0.75, r)
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    return pm(mix(unp(s), col, (m * rad * c.g("uAmt"))[..., None]), s[..., 3])


@kernel
def k_fog(c):
    U, V = c.grid
    s = c.tex
    t = c.time * c.g("uSpd") * 0.1
    A = c.g("uA")
    n = fbm(U * A * c.aspect + t, V * A + t * 0.5)
    n = fbm(U * A * c.aspect + t + n, V * A + n)
    f = smoothstep(0.2, 0.9, n) * c.g("uAmt") * c.g("uB")
    col = np.asarray(c.g("uCol", (1, 1, 1)), F)
    return pm(mix(unp(s), col, np.clip(f, 0, 1)[..., None]), s[..., 3])


@kernel
def k_caustics(c):
    U, V = c.grid
    t = c.time * c.g("uSpd") * 0.5
    A, amt = c.g("uA"), c.g("uAmt")
    qx, qy = U * c.aspect * A, V * A
    cc = np.zeros_like(U)
    for i in range(3):
        fi = i + 1.0
        qx, qy = qx + np.sin(qy * 1.7 * fi + t) * 0.35, qy + np.cos(qx * 1.5 * fi + t * 1.1) * 0.35
        cc = cc + np.abs(np.sin(qx + qy)) / fi
    cc = np.power(np.clip(cc / 1.6, 0, 1), 3.0)
    k = 0.004 * amt * c.g("uB")
    s = samp(c.tex, U + np.sin(qy * 2.0) * k, V + np.cos(qx * 2.0) * k)
    o = unp(s) * mix(1.0, np.array([0.85, 0.95, 1.05], F), amt) + (cc * amt * 0.5)[..., None] * np.array([0.4, 0.8, 1.0], F)
    return pm(np.clip(o, 0, 1), s[..., 3])


# ------------------------------------------------------------------ cámara y copias
@kernel
def k_camera(c):
    U, V = c.grid
    t = c.time * c.g("uSpd")
    B = c.g("uB")
    a = c.g("uAmt") * c.g("uA")
    ox = oy = 0.0
    rot = 0.0
    zoom = 1.0
    def vn(x, s):
        return float(vnoise(np.float64(x), np.float64(s)))
    if B < 0.5:
        ox, oy = (vn(t * 14.0, 1.0) - 0.5) * 0.06 * a, (vn(t * 14.0, 9.0) - 0.5) * 0.06 * a
        rot = (vn(t * 12.0, 5.0) - 0.5) * 0.05 * a
        zoom = 1.0 + 0.03 * a
    elif B < 1.5:
        ox, oy = (vn(t * 1.8, 1.0) - 0.5) * 0.05 * a, (vn(t * 1.8, 9.0) - 0.5) * 0.05 * a
        rot = (vn(t * 1.4, 5.0) - 0.5) * 0.03 * a
        zoom = 1.0 + 0.04 * a
    elif B < 2.5:
        ox, oy = math.sin(t * 90.0) * 0.004 * a, math.cos(t * 83.0) * 0.004 * a
        zoom = 1.0 + 0.01 * a
    elif B < 3.5:
        zoom = 1.0 + 0.12 * a * (0.5 + 0.5 * math.sin(t * 6.0)) ** 2
    elif B < 4.5:
        rot = math.sin(t * 3.0) * 0.08 * a
        zoom = 1.0 + 0.06 * a
    else:
        zoom = 1.0 + 0.25 * a * (0.5 - 0.5 * math.cos(t * 1.2))
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    rx, ry = rot2(rot, dx, dy)
    return samp(c.tex, rx / zoom / c.aspect + 0.5 + ox, ry / zoom + 0.5 + oy, mirror=True)


@kernel
def k_double(c):
    U, V = c.grid
    s = c.tex
    t = c.time * c.g("uSpd")
    amt = c.g("uAmt")
    if c.g("uB") < 0.5:
        px, py = (U - 0.5) * 1.35, (V - 0.5) * 1.35
        px, py = rot2(math.sin(t * 0.4) * 0.2, px, py)
        qu = 1.0 - (px + 0.5 + math.sin(t * 0.3) * 0.05)
        qv = py + 0.5
        o = unp(s)
        b = unp(samp(c.tex, qu, qv, mirror=True))
        r = 1.0 - (1.0 - o) * (1.0 - b * 0.8)
        return pm(mix(o, r, amt), s[..., 3])
    ang = math.radians(c.g("uC"))
    dxp = math.cos(ang) * 0.04 * c.g("uA") * c.H
    dyp = math.sin(ang) * 0.04 * c.g("uA") * c.H
    acc = s.copy()
    ws = 1.0
    for i in range(1, 4):
        w = 0.5 * amt / i
        k = i * (1.0 + 0.3 * math.sin(t * 2.0))
        acc = acc + shift(c.tex, -dxp * k, dyp * k) * w
        ws += w
    return acc / ws


@kernel
def k_trails(c):
    cur = c.tex
    if c.prev is None:
        return cur
    U, V = c.grid
    px, py = U - 0.5, V - 0.5
    px, py = rot2(c.g("uC") * 0.01, px, py)
    B = c.g("uB")
    pv = samp(c.prev, px / B + 0.5, py / B + 0.5) * c.g("uA")
    o = np.concatenate([np.maximum(cur[..., :3], pv[..., :3]), np.maximum(cur[..., 3:], pv[..., 3:])], -1)
    return mix(cur, o, min(1.0, c.g("uAmt") * 1.5))


# ------------------------------------------------------------------ transiciones
@kernel
def k_dissolve(c):
    U, V = c.grid
    p = c.g("uProg")
    B = c.g("uB")
    t = c.time
    if B < 0.5:
        f = math.floor(t * 20.0)
        n = hash2(U * c.W * 0.5 + f, V * c.H * 0.5 + f)
    elif B < 1.5:
        n = fbm(U * c.aspect * 3.0, V * 3.0 + t * 0.3)
        n = fbm(U * c.aspect * 4.0 + n * 1.5, V * 4.0 + n * 1.5)
    elif B < 2.5:
        n = fbm(U * c.aspect * 6.0, V * 6.0)
    else:
        n = hash2(np.floor(U * 24.0 * c.aspect), np.floor(V * 24.0))
    x = p * 1.1 - n
    a = smoothstep(0.0, 0.08, x)
    edge = a * (1.0 - smoothstep(0.08, 0.22, x))
    qu, qv = U, V
    if 1.5 < B < 2.5:
        qu = U + (n - 0.5) * 0.1 * (1.0 - p)
        qv = V - (1.0 - a) * 0.25 * (n + 0.3) * (1.0 - p)
    s = samp(c.tex, qu, qv)
    amt = c.g("uAmt")
    col = np.asarray(c.g("uEdge", (1, 1, 1)), F)
    rgb = s[..., :3] * a[..., None] + col * (edge * amt)[..., None] * s[..., 3:4]
    return np.concatenate([rgb, (s[..., 3] * a)[..., None]], -1).astype(F)


@kernel
def k_mask(c):
    U, V = c.grid
    p = c.g("uProg")
    dx, dy = (U - 0.5) * c.aspect, V - 0.5
    m = c.g("uB")
    rmax = math.hypot(c.aspect, 1.0) * 0.5
    inv = c.g("uD") > 0.5
    if m < 0.5:
        ang = math.radians(c.g("uC"))
        ddx, ddy = math.cos(ang), math.sin(ang)
        f = ((U - 0.5) * ddx + (V - 0.5) * ddy) / (abs(ddx) + abs(ddy)) + 0.5
    elif m < 1.5:
        f = np.sqrt(dx * dx + dy * dy) / rmax
        f = 1.0 - f if inv else f
    elif m < 2.5:
        f = (np.abs(dx) + np.abs(dy)) / (0.5 * c.aspect + 0.5)
        f = 1.0 - f if inv else f
    elif m < 3.5:
        a = np.arctan2(dy, dx)
        R = 0.30 + 0.70 * np.power(0.5 + 0.5 * np.cos(5.0 * a), 3.0)
        f = np.sqrt(dx * dx + dy * dy) / (R * rmax * 1.7)
        f = 1.0 - f if inv else f
    elif m < 4.5:
        a = np.arctan2(dx, -dy)
        sn = np.sin(a)
        R = 2.0 - 2.0 * sn + sn * np.sqrt(np.abs(np.cos(a))) / (sn + 1.4)
        R = np.maximum(R, 0.6)
        f = np.sqrt(dx * dx + dy * dy) * 3.2 / (R * rmax * 1.2)
        f = 1.0 - f if inv else f
    elif m < 5.5:
        f = np.abs(U - 0.5) * 2.0
    elif m < 6.5:
        f = np.abs(V - 0.5) * 2.0
    elif m < 7.5:
        f = fract(V * c.g("uA"))
    elif m < 8.5:
        f = np.arctan2(dx, -dy) / (2.0 * PI) + 0.5
    elif m < 9.5:
        f = hash2(np.floor(U * 8.0 * c.aspect), np.floor(V * 8.0))
    else:
        f = fract((U + V) * c.g("uA"))
    soft = max(0.004, c.g("uSoft"))
    x = p * (1.0 + soft) - f
    a = smoothstep(0.0, soft, x)
    if 2.5 < m < 4.5:
        a = np.maximum(a, smoothstep(0.85, 1.0, p))
    edge = a * (1.0 - smoothstep(soft, soft * 3.0, x))
    s = c.tex
    col = np.asarray(c.g("uEdge", (1, 1, 1)), F)
    rgb = s[..., :3] * a[..., None] + col * (edge * s[..., 3] * c.g("uAmt"))[..., None]
    return np.concatenate([rgb, (s[..., 3] * a)[..., None]], -1).astype(F)


@kernel
def k_persp(c):
    U, V = c.grid
    th = math.radians(c.g("uAng"))
    cs, sn = math.cos(th), math.sin(th)
    scx, scy = (U - 0.5) * c.aspect, V - 0.5
    piv = c.g("uPiv") * c.aspect * 0.5
    dist = c.g("uDist")
    B = c.g("uB")
    if B < 0.5 or B > 2.5:
        sx = scx - piv
        den = cs - sx * sn / dist
        valid = den >= 0.05
        den = np.where(valid, den, 1.0)
        u = sx / den
        v = scy * (1.0 + u * sn / dist)
        u2, v2 = u + piv, v
    else:
        sy = scy - piv
        den = cs - sy * sn / dist
        valid = den >= 0.05
        den = np.where(valid, den, 1.0)
        v = sy / den
        u = scx * (1.0 + v * sn / dist)
        u2, v2 = u, v + piv
    su, sv = u2 / c.aspect + 0.5, v2 + 0.5
    inside = valid & (su >= 0) & (su <= 1) & (sv >= 0) & (sv <= 1)
    t = samp(c.tex, su, sv)
    shade = 1.0 - abs(math.sin(th)) * 0.55
    out = np.concatenate([t[..., :3] * shade, t[..., 3:]], -1)
    out[~inside] = 0.0
    return out.astype(F)


@kernel
def k_edgemix(c):
    U, V = c.grid
    d = np.sqrt(((U - 0.5) * c.aspect * 0.7) ** 2 + (V - 0.5) ** 2)
    A = c.g("uA")
    return mix(c.orig, c.tex, (smoothstep(A, A + 0.35, d) * c.g("uAmt"))[..., None])


@kernel
def k_curl(c):
    U, V = c.grid
    p = c.g("uProg")
    xf = p * 1.15 - 0.12
    R = 0.11
    out = np.zeros_like(c.tex)
    left = U <= xf
    d = U - xf
    a = d / R
    srcx = xf - d * 0.9
    b = samp(c.tex, srcx, V)
    sh = 0.55 + 0.45 * np.cos(a)
    curled = np.concatenate([b[..., :3] * (sh * 0.9)[..., None] + 0.07 * b[..., 3:4] * (1.0 - sh)[..., None], b[..., 3:]], -1)
    out = np.where((~left & (d < PI * R))[..., None], curled, out)
    return np.where(left[..., None], c.tex, out).astype(F)
