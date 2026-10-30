"""Animaciones de clip: entrada, salida y bucle. Modifican la transformación `st` (rot en GRADOS)."""
from __future__ import annotations

import math

from .params import P, norm, wd

ANIMS: list = []
BY_ID: dict = {}
PI = math.pi


def _reg(it):
    a = {"tags": [], "params": [P["amount"], P["speed"]], **it}
    ANIMS.append(a)
    BY_ID[a["id"]] = a
    return a


def get_anim(id):
    return BY_ID.get(id)


def E(p):
    return 1 - (1 - p) ** 3


def c01(x):
    return max(0.0, min(1.0, x))


def back_out(p):
    c1 = 1.70158
    return 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2


def elastic(p):
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    return 2 ** (-10 * p) * math.sin((p * 10 - 0.75) * (2 * PI / 3)) + 1


def bounce_out(x):
    n1, d1 = 7.5625, 2.75
    if x < 1 / d1:
        return n1 * x * x
    if x < 2 / d1:
        x -= 1.5 / d1
        return n1 * x * x + 0.75
    if x < 2.5 / d1:
        x -= 2.25 / d1
        return n1 * x * x + 0.9375
    x -= 2.625 / d1
    return n1 * x * x + 0.984375


def _d(r):
    return math.degrees(r)


def _mx(x):
    return max(0.0001, x)


def io(id, label, fn, tags=(), params=None):
    _reg({"id": id, "label": label, "slots": ["in", "out"], "fn": fn, "tags": list(tags),
          "params": params or [wd(P["amount"], 100)]})


def loop(id, label, fn, tags=(), params=None):
    _reg({"id": id, "label": label, "slots": ["loop"], "fn": fn, "tags": list(tags),
          "params": params or [wd(P["amount"], 50), P["speed"]]})


# c = dict(W, H, pr)
def _appear(st, p, c, out):
    st["alpha"] *= c01(p * 1.4)
    st["sc"] *= 0.85 + 0.15 * E(p)


def _fade(st, p, c, out):
    st["alpha"] *= p


def _slide(st, p, c, out):
    a = math.radians(c["pr"].get("angle", 180) if hasattr(c["pr"], "get") else 180)
    d = (1 - E(p)) * c["W"] * c["pr"].amount
    st["dx"] += math.cos(a) * d * -1
    st["dy"] += math.sin(a) * d * -1
    st["alpha"] *= min(1, p * 3)


def _zin(st, p, c, out):
    st["sc"] *= 1 + (1 - E(p)) * 1.2 * c["pr"].amount
    st["alpha"] *= min(1, p * 2.5)


def _zout(st, p, c, out):
    st["sc"] *= 1 - (1 - E(p)) * 0.8 * c["pr"].amount
    st["alpha"] *= min(1, p * 2.5)


def _grow(st, p, c, out):
    st["sc"] *= _mx(E(p))
    st["alpha"] *= min(1, p * 3)


def _shrink(st, p, c, out):
    st["sc"] *= 1 + (1 - E(p)) * 0.6 * c["pr"].amount
    st["alpha"] *= min(1, p * 2.5)


def _bounce(st, p, c, out):
    st["dy"] -= (1 - bounce_out(p)) * c["H"] * 0.6 * c["pr"].amount
    st["alpha"] *= min(1, p * 5)


def _spin(st, p, c, out):
    st["rot"] += _d((1 - E(p)) * PI * 2 * c["pr"].amount)
    st["sc"] *= _mx(E(p))
    st["alpha"] *= min(1, p * 3)


def _fly(st, p, c, out):
    q = 1 - E(p)
    st["dx"] -= q * c["W"] * 0.7
    st["dy"] += q * c["H"] * 0.6 - math.sin(q * PI) * c["H"] * 0.2
    st["rot"] -= _d(q * 0.6)
    st["sc"] *= 0.5 + 0.5 * E(p)
    st["alpha"] *= min(1, p * 3)


def _zspin(st, p, c, out):
    st["sc"] *= _mx(back_out(p))
    st["rot"] += _d((1 - E(p)) * PI * c["pr"].amount)
    st["alpha"] *= min(1, p * 3)


def _bscale(st, p, c, out):
    st["sc"] *= _mx(elastic(p))
    st["alpha"] *= min(1, p * 6)


def _sblur(st, p, c, out):
    st["dx"] -= (1 - E(p)) * c["W"] * 0.6
    st["alpha"] *= min(1, p * 3)
    st.setdefault("gfx", []).append({"k": "dirblur", "u": {"uAmt": (1 - E(p)) * c["pr"].amount, "uA": 0.22, "uB": 0, "uC": 0}})


def _swing(st, p, c, out):
    st["rot"] += _d(math.sin(p * PI * 3) * (1 - p) * 0.5)
    st["alpha"] *= min(1, p * 4)


io("appear", "Aparecer / desaparecer", _appear, ["aparecer", "desaparecer"])
io("fadeA", "Desvanecer", _fade, ["fundido"])
io("slideA", "Deslizar", _slide, ["deslizamiento"], [wd(P["amount"], 100), wd(P["angle"], 180)])
io("zoomInA", "Acercar", _zin, ["zoom"])
io("zoomOutA", "Alejar", _zout, ["zoom"])
io("growA", "Ampliar", _grow)
io("shrinkA", "Reducir", _shrink)
io("bounceA", "Rebotar", _bounce)
io("spinA", "Girar", _spin)
io("flyA", "Volar", _fly)
io("zoomSpinA", "Zoom con giro", _zspin)
io("bounceScaleA", "Rebote con escala", _bscale)
io("slideBlurA", "Deslizamiento con desenfoque", _sblur, ["blur", "desenfoque"])
io("swingA", "Péndulo", _swing)


def _l(f):
    return f


loop("scrollH", "Desplazamiento horizontal", lambda st, t, c, o=False: st.__setitem__("dx", st["dx"] + math.sin(t * 1.5) * c["W"] * 0.08 * c["pr"].amount * 2))
loop("scrollV", "Desplazamiento vertical", lambda st, t, c, o=False: st.__setitem__("dy", st["dy"] + math.sin(t * 1.5) * c["H"] * 0.08 * c["pr"].amount * 2))
loop("rotateL", "Rotación", lambda st, t, c, o=False: st.__setitem__("rot", st["rot"] + _d(t * 1.2 * (c["pr"].amount * 2))))
loop("scaleL", "Cambio de escala", lambda st, t, c, o=False: st.__setitem__("sc", st["sc"] * (1 + math.sin(t * 2) * 0.2 * c["pr"].amount * 2)))
loop("bounceL", "Rebotes repetidos", lambda st, t, c, o=False: st.__setitem__("dy", st["dy"] - abs(math.sin(t * 3.2)) * c["H"] * 0.12 * c["pr"].amount * 2))


def _pulse(st, t, c, o=False):
    k = (0.5 + 0.5 * math.sin(t * 5)) ** 3
    st["sc"] *= 1 + k * 0.18 * c["pr"].amount * 2


def _osc(st, t, c, o=False):
    st["rot"] += _d(math.sin(t * 2.4) * 0.25 * c["pr"].amount * 2)


def _shakeL(st, t, c, o=False):
    a = c["pr"].amount * 2
    st["dx"] += math.sin(t * 61) * c["W"] * 0.012 * a
    st["dy"] += math.cos(t * 53) * c["H"] * 0.012 * a
    st["rot"] += _d(math.sin(t * 47) * 0.02 * a)


def _float(st, t, c, o=False):
    st["dy"] += math.sin(t * 1.6) * c["H"] * 0.03 * c["pr"].amount * 2
    st["rot"] += _d(math.sin(t * 1.1) * 0.03)


loop("pulseL", "Pulsaciones", _pulse)
loop("oscillateL", "Oscilaciones", _osc)
loop("shakeL", "Sacudidas", _shakeL)
loop("floatL", "Flotar", _float)

ANIM_IN_OUT = [a for a in ANIMS if "in" in a["slots"]]
ANIM_LOOP = [a for a in ANIMS if "loop" in a["slots"]]


def anim_step(st: dict, clip: dict, local: float, W: int, H: int):
    a = clip.get("anim")
    if not a:
        return

    def run(slot, p, out):
        it = get_anim(slot.get("id"))
        if not it:
            return
        pr = norm(it, slot.get("p"))
        it["fn"](st, p, {"W": W, "H": H, "pr": pr}, out)

    dur = clip.get("duration", 1.0)
    i, o, lp = a.get("in"), a.get("out"), a.get("loop")
    if i and i.get("duration", 0) > 0 and local < i["duration"]:
        run(i, c01(local / i["duration"]), False)
    remain = dur - local
    if o and o.get("duration", 0) > 0 and remain < o["duration"]:
        run(o, c01(remain / o["duration"]), True)
    if lp:
        it = get_anim(lp.get("id"))
        if it:
            pr = norm(it, lp.get("p"))
            it["fn"](st, local * pr.speed, {"W": W, "H": H, "pr": pr}, False)
