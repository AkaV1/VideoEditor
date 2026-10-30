"""Catálogo de efectos, filtros y transiciones (mismo contenido que la versión web).
Cada elemento: {kind, id, cat, label, params, tags, build(pr, c) -> pasadas, [geo(st, p, out, W, H, pr)], [hold]}.
Las pasadas son {"k": kernel, "u": uniformes, "scale"?, "feedback"?, "save"?}."""
from __future__ import annotations

import math

from .params import P, Pr, color, sel, wd

ITEMS: list = []
BY_ID: dict = {}


def register(it: dict) -> dict:
    key = f"{it['kind']}:{it['id']}"
    if key in BY_ID:
        return BY_ID[key]
    item = {"tags": [], "params": [P["amount"]], **it}
    ITEMS.append(item)
    BY_ID[key] = item
    return item


def get_item(kind: str, id: str):
    return BY_ID.get(f"{kind}:{id}")


def items(kind: str) -> list:
    return [i for i in ITEMS if i["kind"] == kind]


def U(p, **extra):
    return {"uAmt": p.amount, "uSpd": p.speed, **extra}


def ps(k, u=None, **more):
    return {"k": k, "u": u or {}, **more}


def AMT(df=60):
    return wd(P["amount"], df)


def E(p):
    return 1 - (1 - p) ** 3


def ex(p):
    return 1.0 if p >= 1 else 1 - 2 ** (-10 * p)


def _num(x):
    return float(x)


# ====================================================================== EFECTOS
FX_CATS = [("retro", "Retro"), ("luz", "Luz"), ("distorsion", "Distorsión"), ("glitch", "Glitch y color"),
           ("camara", "Cámara"), ("espejo", "Espejos"), ("clima", "Atmósfera"), ("estilo", "Estilo")]


def fx(id, cat, label, params, build, tags=()):
    return register({"kind": "fx", "id": id, "cat": cat, "label": label, "params": params, "build": build, "tags": list(tags)})


def retroU(p, **o):
    base = dict(uScan=0, uJit=0, uBleed=0, uNoise=0, uTrack=0, uCurve=0, uVig=0, uTone=1, uFlick=0)
    base.update(o)
    return U(p, **base)


SP = P["speed"]
# ---- Retro
fx("vhs", "retro", "VHS", [AMT(70), SP], lambda p, c: [ps("retro", retroU(p, uScan=0.7, uJit=1, uBleed=1.6, uNoise=0.7, uTrack=1, uVig=0.4, uTone=0.8, uFlick=0.5))], ["cinta", "video"])
fx("oldfilm", "retro", "Película antigua", [AMT(80), SP], lambda p, c: [ps("film", U(p, uGrain=1, uScratch=1, uDust=1, uFlick=1, uSepia=0.85, uVigf=0.8, uWeave=1))], ["película", "sepia"])
fx("filmgrain", "retro", "Grano de película", [AMT(60), wd(SP, 100)], lambda p, c: [ps("film", U(p, uGrain=1.6, uScratch=0, uDust=0, uFlick=0, uSepia=0, uVigf=0, uWeave=0))], ["grano"])
fx("scratches", "retro", "Rayones de película", [AMT(70), SP], lambda p, c: [ps("film", U(p, uGrain=0.2, uScratch=1.6, uDust=1.4, uFlick=0.4, uSepia=0, uVigf=0, uWeave=0.3))], ["polvo"])
fx("scanlines", "retro", "Líneas de escaneo", [AMT(70), SP], lambda p, c: [ps("retro", retroU(p, uScan=1.3, uVig=0.2))], ["crt", "scanlines"])
fx("analognoise", "retro", "Ruido analógico", [AMT(65), SP], lambda p, c: [ps("retro", retroU(p, uNoise=1.6, uJit=0.3, uScan=0.2))], ["ruido", "estática"])
fx("oldcamera", "retro", "Cámara antigua", [AMT(75), SP], lambda p, c: [ps("film", U(p, uGrain=0.9, uScratch=0.4, uDust=0.6, uFlick=1.4, uSepia=0.55, uVigf=1.2, uWeave=1.6))], ["cámara", "vintage"])
fx("damagedtape", "retro", "Cinta dañada", [AMT(85), SP], lambda p, c: [ps("retro", retroU(p, uScan=0.5, uJit=2.4, uBleed=2.6, uNoise=1.2, uTrack=3, uVig=0.5, uTone=0.6, uFlick=1))], ["vhs", "glitch"])


def gradeU(p, **o):
    base = dict(uAmt=p.amount, uSat=1, uCon=1, uBri=0, uTemp=0, uTint=0, uFade=0, uGam=1, uSoft=0, uSh=(0, 0, 0), uHi=(0, 0, 0))
    base.update(o)
    return base


fx("style80", "retro", "Estética años 80", [AMT(70), SP], lambda p, c: [
    ps("grade", gradeU(p, uSat=1.5, uCon=1.1, uBri=0.0, uSh=(0.08, 0, 0.12), uHi=(0.1, 0.02, 0.06), uTemp=-0.2)),
    ps("retro", retroU(p, uScan=0.6, uBleed=1.6, uNoise=0.3, uVig=0.3))], ["neón", "synthwave"])
fx("style90", "retro", "Estética años 90", [AMT(70), SP], lambda p, c: [
    ps("grade", gradeU(p, uSat=1.15, uCon=1.05, uFade=0.15, uTemp=0.25)),
    ps("retro", retroU(p, uJit=0.6, uBleed=0.8, uNoise=0.5, uScan=0.2, uVig=0.5, uTone=0.9, uFlick=0.3))], ["camcorder"])
fx("retrofreeze", "retro", "Fotograma congelado retro", [AMT(70), wd(SP, 100)], lambda p, c: [ps("retro", retroU(p, uScan=0.8, uJit=1.2, uBleed=1.4, uNoise=0.6, uTone=0.7))], ["congelar"])["hold"] = {"rate": 0}


# ---- Luz
def bloom(p, thr=0.55, gain=1.2, rad=2.2, col=(1, 1, 1), pre=()):
    return [*pre,
            ps("bright", {"uThr": thr}, scale=0.5),
            ps("blurh", {"uA": rad}, scale=0.5), ps("blurv", {"uA": rad}, scale=0.5),
            ps("blurh", {"uA": rad * 2}, scale=0.25), ps("blurv", {"uA": rad * 2}, scale=0.25),
            ps("addglow", {"uGain": gain * p.amount, "uCol": col})]


fx("glow", "luz", "Glow", [AMT(60), wd(P["size"], 50)], lambda p, c: bloom(p, thr=0.5, rad=1.2 + p.size * 0.04), ["brillo"])
fx("intensebright", "luz", "Brillo intenso", [AMT(70)], lambda p, c: bloom(p, thr=0.45, gain=1.1, rad=2.6, pre=[ps("grade", gradeU(p, uBri=0.06, uCon=1.1, uSat=1.1))]), ["exposición"])
fx("halo", "luz", "Halo luminoso", [AMT(60), wd(P["size"], 70)], lambda p, c: bloom(p, thr=0.4, rad=2 + p.size * 0.08, gain=1.4), ["bloom"])
fx("neon", "luz", "Neón", [AMT(80), color("#00f2fe")], lambda p, c: bloom(p, thr=0.45, gain=1.2, rad=1.6, col=(1, 1, 1), pre=[ps("edges", {"uAmt": 1, "uA": 1.1, "uB": 4, "uC": 1, "uCol": p.rgb}, save=True)]), ["contorno"])
fx("sparkles", "luz", "Destellos", [AMT(70), SP, wd(P["size"], 60)], lambda p, c: [ps("flare", U(p, uA=0.9, uC=0.75, uD=0.8))], ["flare"])
fx("lightleak", "luz", "Fugas de luz", [AMT(70), SP], lambda p, c: [ps("leak", U(p, uA=3.2, uB=1.1))], ["leak"])
fx("edgeglow", "luz", "Resplandor de contornos", [AMT(80), color("#ffd24a")], lambda p, c: bloom(p, thr=0.85, gain=1.2, rad=1.4, pre=[ps("edges", {"uAmt": p.amount, "uA": 1.1, "uB": 4, "uC": 2, "uCol": p.rgb}, save=True)]), ["contorno"])
fx("lightrays", "luz", "Rayos de luz", [AMT(70), color("#fff1c0")], lambda p, c: [ps("zoomblur", {"uAmt": p.amount, "uA": 0.9, "uB": 1, "uC": 0.5, "uD": 0.9, "uThr": 0.55, "uCol": p.rgb})], ["god rays"])
fx("volumetric", "luz", "Luz volumétrica", [AMT(65), color("#ffe2a8"), SP], lambda p, c: [
    ps("zoomblur", {"uAmt": p.amount, "uA": 1.1, "uB": 1, "uC": 0.25, "uD": 1.0, "uThr": 0.45, "uCol": p.rgb}),
    ps("fog", {"uAmt": p.amount * 0.5, "uSpd": p.speed, "uA": 2.2, "uB": 0.6, "uCol": p.rgb})], ["rayos", "niebla"])
fx("lightflicker", "luz", "Parpadeo de luz", [AMT(60), wd(SP, 100)], lambda p, c: [ps("flicker", U(p, uA=14, uB=1))], ["flicker"])
fx("flashpulse", "luz", "Destello de flash", [AMT(80), wd(SP, 100), P["color"]], lambda p, c: [ps("flash", {"uAmt": p.amount, "uSpd": p.speed, "uA": 1.4, "uCol": p.rgb})], ["flash"])

# ---- Distorsión
fx("waves", "distorsion", "Ondas", [AMT(60), SP, wd(P["freq"], 40), sel("axis", "Eje", [("h", "Horizontal"), ("v", "Vertical"), ("hv", "Ambos")], "h")],
   lambda p, c: [ps("wave", U(p, uA=4 + p.freq * 0.5, uB=0.05, uC=1 if p.axis == "v" else 2 if p.axis == "hv" else 0))], ["onda"])
fx("heatwave", "distorsion", "Onda de calor", [AMT(60), SP], lambda p, c: [ps("heat", U(p, uA=5, uB=0.05, uC=1))], ["calor"])
fx("fisheye", "distorsion", "Ojo de pez", [AMT(70)], lambda p, c: [ps("lens", U(p, uA=1.4, uB=0))])
fx("bulge", "distorsion", "Abombamiento", [AMT(70)], lambda p, c: [ps("lens", U(p, uA=1.5, uB=1))], ["bulto"])
fx("pinch", "distorsion", "Pellizco", [AMT(70)], lambda p, c: [ps("lens", U(p, uA=1.5, uB=2))])
fx("stretchx", "distorsion", "Estiramiento horizontal", [AMT(70)], lambda p, c: [ps("lens", U(p, uA=1.6, uB=3))], ["estirar"])
fx("stretchy", "distorsion", "Estiramiento vertical", [AMT(70)], lambda p, c: [ps("lens", U(p, uA=1.6, uB=4))], ["estirar"])
fx("lensdist", "distorsion", "Distorsión de lente", [AMT(60)], lambda p, c: [ps("lens", U(p, uA=0.9, uB=0)), ps("rgb", U(p, uA=0.012, uC=1))], ["lente"])
fx("swirlfx", "distorsion", "Remolino", [AMT(60), SP], lambda p, c: [ps("swirl", U(p, uA=0.7, uB=5, uC=0.5, uD=0.5))], ["espiral"])
fx("ripplefx", "distorsion", "Ondulación", [AMT(70), SP], lambda p, c: [ps("ripple", U(p, uA=30, uB=0.05, uC=0.5, uD=0.5))], ["agua"])
fx("oscillation", "distorsion", "Oscilación de imagen", [AMT(60), SP], lambda p, c: [ps("camera", U(p, uA=1, uB=4))])

# ---- Glitch y color
fx("glitchfx", "glitch", "Glitch", [AMT(60), SP], lambda p, c: [ps("glitch", U(p, uA=1, uB=1))], ["digital"])
fx("rgbsplitfx", "glitch", "Separación RGB", [AMT(60), wd(P["angle"], 0), SP], lambda p, c: [ps("rgb", U(p, uA=0.02, uB=p.angle, uC=0, uD=1))], ["rgb"])
fx("chromatic", "glitch", "Aberración cromática", [AMT(60)], lambda p, c: [ps("rgb", U(p, uA=0.03, uC=1))], ["cromática"])
fx("signalnoise", "glitch", "Interferencia de señal", [AMT(70), SP], lambda p, c: [ps("glitch", U(p, uA=0.6, uB=0.5)), ps("retro", retroU(p, uJit=1.4, uNoise=0.8, uTrack=1.2, uBleed=0.6))], ["señal"])
fx("tearfx", "glitch", "Desgarro digital", [AMT(70), SP, wd(P["freq"], 30)], lambda p, c: [ps("tear", U(p, uA=6 + p.freq * 0.5))])
fx("invertfx", "glitch", "Negativo", [AMT(100)], lambda p, c: [ps("invert", U(p))], ["inversión", "invertir colores"])
fx("posterizefx", "glitch", "Posterización", [AMT(70), wd(P["count"], 30)], lambda p, c: [ps("posterize", U(p, uA=2 + p.count * 0.12))])
fx("pixelfx", "glitch", "Pixelación", [AMT(60)], lambda p, c: [ps("pixel", U(p, uA=18, uB=0))], ["pixelar"])
fx("mosaicfx", "glitch", "Mosaico", [AMT(60)], lambda p, c: [ps("pixel", U(p, uA=22, uB=1))], ["mosaico"])
fx("contours", "glitch", "Contornos", [AMT(100), wd(P["size"], 40)], lambda p, c: [ps("edges", {"uAmt": 1, "uA": 0.8 + p.size * 0.03, "uB": 4, "uC": 0, "uCol": (1, 1, 1)})], ["bordes", "sketch"])
fx("cameranoise", "glitch", "Ruido de cámara", [AMT(55), SP], lambda p, c: [ps("film", U(p, uGrain=2, uScratch=0, uDust=0, uFlick=0.2, uSepia=0, uVigf=0, uWeave=0))], ["grano", "iso"])


# ---- Cámara y movimiento
def cam(id, label, mode, a, tags):
    fx(id, "camara", label, [AMT(60), SP], lambda p, c: [ps("camera", U(p, uA=a, uB=mode))], tags)


cam("shake", "Temblor de imagen", 0, 1.2, ["sacudida"])
cam("handheld", "Cámara temblorosa", 1, 1.2, ["cámara en mano"])
cam("vibration", "Vibración", 2, 1.4, [])
cam("zoompulse", "Pulso de zoom", 3, 1.2, ["latido"])
cam("dynzoom", "Zoom dinámico", 5, 1.2, ["respiración"])
fx("motionblur", "camara", "Motion blur", [AMT(60), wd(P["angle"], 0)], lambda p, c: [ps("dirblur", {"uAmt": p.amount, "uSpd": p.speed, "uA": 0.1, "uB": p.angle, "uC": 0})], ["movimiento"])
fx("dirblurfx", "camara", "Desenfoque direccional", [AMT(60), wd(P["angle"], 45)], lambda p, c: [ps("dirblur", {"uAmt": p.amount, "uSpd": p.speed, "uA": 0.12, "uB": p.angle, "uC": 0})])
fx("radialblur", "camara", "Desenfoque radial", [AMT(60)], lambda p, c: [ps("zoomblur", {"uAmt": p.amount, "uA": 0.35, "uB": 0, "uC": 0.5, "uD": 0.5, "uThr": 0})])
fx("gaussblur", "camara", "Desenfoque gaussiano", [AMT(50)], lambda p, c: [ps("blur", {"uAmt": p.amount, "uA": 0.08})], ["blur"])
fx("speedlinesfx", "camara", "Speed lines", [AMT(80), SP, wd(P["count"], 40), P["color"]], lambda p, c: [ps("speedlines", {"uAmt": p.amount, "uSpd": p.speed, "uA": 24 + p.count, "uB": 0.5, "uCol": p.rgb})], ["manga", "líneas de velocidad"])
fx("motionecho", "camara", "Eco de movimiento", [AMT(70), wd(P["angle"], 0)], lambda p, c: [ps("trails", {"uAmt": p.amount, "uA": 0.9, "uB": 1.0, "uC": 0}, feedback="echo")], ["estela", "eco"])
fx("trailsfx", "camara", "Estelas", [AMT(75), SP], lambda p, c: [ps("trails", {"uAmt": p.amount, "uA": 0.94, "uB": 1.012, "uC": 1.2}, feedback="trail")], ["estela"])
fx("framerepeat", "camara", "Repetición de fotogramas", [AMT(100), wd(P["freq"], 6, label="Fotogramas por segundo", min=1, max=30)], lambda p, c: [], ["stutter", "entrecortado"])["hold"] = {"rateParam": "freq"}
fx("freezemotion", "camara", "Congelación del movimiento", [AMT(100)], lambda p, c: [], ["congelar", "freeze"])["hold"] = {"rate": 0}

# ---- Espejos y multiplicación
fx("mirrorfx", "espejo", "Espejo", [AMT(100), sel("side", "Lado", [(0, "Izquierda → derecha"), (1, "Derecha → izquierda"), (2, "Arriba → abajo"), (3, "Abajo → arriba")], "0")],
   lambda p, c: [ps("mirror", U(p, uA=_num(p.side)))])
fx("symmetry", "espejo", "Simetría", [AMT(100)], lambda p, c: [ps("mirror", U(p, uA=4))], ["cuatro"])
fx("kaleido", "espejo", "Caleidoscopio", [AMT(80), SP, wd(P["count"], 6, label="Segmentos", min=2, max=16)], lambda p, c: [ps("kaleido", U(p, uA=round(p.count), uB=0.9))])
fx("tunnelfx", "espejo", "Túnel infinito", [AMT(90), SP], lambda p, c: [ps("tunnel", U(p, uA=4, uB=1))], ["túnel"])
fx("multimirror", "espejo", "Espejo múltiple", [AMT(100), wd(P["count"], 3, label="Repeticiones", min=2, max=8)], lambda p, c: [ps("tile", U(p, uA=round(p.count), uB=1))])
fx("duplicate", "espejo", "Duplicación de imagen", [AMT(100), wd(P["count"], 2, label="Repeticiones", min=2, max=8)], lambda p, c: [ps("tile", U(p, uA=round(p.count), uB=0))], ["mosaico", "clon"])
fx("ghost", "espejo", "Imagen fantasma", [AMT(70), wd(P["angle"], 0), SP], lambda p, c: [ps("double", U(p, uA=1.3, uB=1, uC=p.angle))], ["eco"])
fx("doubleexp", "espejo", "Doble exposición", [AMT(70), SP], lambda p, c: [ps("double", U(p, uA=1, uB=0))], ["superponer"])

# ---- Atmósfera
fx("fogfx", "clima", "Niebla", [AMT(60), SP, wd(P["size"], 40), P["color"]], lambda p, c: [ps("fog", {"uAmt": p.amount, "uSpd": p.speed, "uA": 1.5 + p.size * 0.04, "uB": 1, "uCol": p.rgb})], ["bruma"])
fx("waterfx", "clima", "Agua", [AMT(70), SP], lambda p, c: [ps("caustics", U(p, uA=3, uB=1))], ["cáusticas"])
fx("vignettefx", "clima", "Viñeta oscura", [AMT(80)], lambda p, c: [ps("vignette", {"uAmt": p.amount, "uA": 0.25, "uB": 0.65, "uCol": (0, 0, 0)})], ["viñeta"])
fx("shadowsfx", "clima", "Sombras", [AMT(70), sel("side", "Zona", [(0, "Abajo"), (1, "Arriba"), (2, "Arriba y abajo")], "0")], lambda p, c: [ps("shade", U(p, uA=1.4, uB=_num(p.side)))])
fx("creepyblur", "clima", "Desenfoque inquietante", [AMT(70), SP], lambda p, c: [
    ps("blur", {"uAmt": 0.5 + 0.25 * math.sin(c.t * 2 * p.speed), "uA": 0.03}),
    ps("grade", gradeU(p, uSat=0.35, uCon=1.2, uBri=-0.05, uTemp=-0.5)),
    ps("vignette", {"uAmt": p.amount, "uA": 0.15, "uB": 0.6, "uCol": (0, 0, 0.03)})], ["inquietante", "terror"])
fx("appear", "estilo", "Efecto de aparición", [AMT(100), sel("mode", "Estilo", [(1, "Líquido"), (0, "Estática"), (2, "Desintegración"), (3, "Píxeles")], "1"), P["color"]], lambda p, c: [
    ps("dissolve", {"uProg": min(1, c.local / max(0.1, c.dur * 0.5)), "uB": _num(p.mode), "uAmt": p.amount, "uEdge": p.rgb, "uTime": 0})], ["aparecer", "revelar"])

# ====================================================================== FILTROS
FILTER_CATS = [("cine", "Cine"), ("retro", "Retro"), ("color", "Color"), ("piel", "Retrato")]


def flt(id, cat, label, tags=(), **o):
    register({"kind": "filter", "id": id, "cat": cat, "label": label, "tags": list(tags), "params": [wd(P["amount"], 100)],
              "build": lambda p, c: [ps("grade", gradeU(p, **o))]})


flt("cinematic", "cine", "Cinematográfico", ["cine"], uCon=1.18, uSat=0.9, uSh=(0, 0.02, 0.05), uHi=(0.05, 0.02, 0), uBri=-0.02)
flt("film", "cine", "Película", uCon=1.08, uSat=0.95, uFade=0.18, uTemp=0.12, uSh=(0.02, 0.03, 0.04))
flt("cinewarm", "cine", "Cinematográfico cálido", uCon=1.15, uSat=1.0, uTemp=0.55, uSh=(0.03, 0.01, 0), uHi=(0.06, 0.03, 0))
flt("cinecool", "cine", "Cinematográfico frío", uCon=1.15, uSat=0.95, uTemp=-0.5, uSh=(0, 0.02, 0.06), uHi=(0, 0.02, 0.05))
flt("tealorange", "cine", "Teal and orange", ["teal", "naranja"], uCon=1.15, uSat=1.15, uSh=(-0.02, 0.06, 0.09), uHi=(0.12, 0.05, -0.04))
flt("cinecontrast", "cine", "Contraste cinematográfico", uCon=1.45, uSat=0.85, uBri=-0.05, uGam=1.05)
flt("desat", "color", "Desaturado", ["apagado"], uSat=0.35, uCon=1.05)
flt("retro", "retro", "Retro", uSat=0.85, uCon=0.95, uFade=0.2, uTemp=0.3, uSh=(0.04, 0.02, 0.0))
flt("sepiaf", "retro", "Sepia", uSat=0.2, uCon=1.0, uTemp=0.9, uTint=0.2, uSh=(0.05, 0.02, -0.02), uHi=(0.1, 0.06, -0.02))
flt("film35", "retro", "Película de 35 mm", uCon=1.1, uSat=1.05, uFade=0.12, uTemp=0.15, uSh=(0.02, 0.04, 0.02), uHi=(0.05, 0.02, 0.0))
flt("washed", "retro", "Colores deslavados", uSat=0.65, uCon=0.85, uFade=0.35, uBri=0.04)
flt("warmtones", "color", "Tonos cálidos", uTemp=0.7, uSat=1.1, uHi=(0.05, 0.02, 0))
flt("oldbw", "retro", "Blanco y negro antiguo", uSat=0, uCon=0.95, uFade=0.3, uTemp=0.25, uSh=(0.02, 0.01, 0))
flt("vividf", "color", "Vívido", uSat=1.5, uCon=1.12)
flt("saturated", "color", "Saturado", uSat=1.9, uCon=1.05)
flt("pastel", "color", "Pastel", uSat=0.7, uCon=0.8, uBri=0.1, uFade=0.15, uHi=(0.03, 0.02, 0.04))
flt("coolf", "color", "Frío", uTemp=-0.7, uSat=1.05)
flt("warmf", "color", "Cálido", uTemp=0.6, uSat=1.1)
flt("highcontrast", "color", "Alto contraste", uCon=1.6, uSat=1.1)
flt("matte", "cine", "Mate", uCon=0.9, uFade=0.45, uSat=0.9)
flt("bwf", "color", "Blanco y negro", uSat=0, uCon=1.2)
flt("natural", "color", "Natural", uSat=1.05, uCon=1.03, uBri=0.01)
flt("soft", "piel", "Suave", uCon=0.92, uSat=0.95, uSoft=0.6, uBri=0.03)
flt("portrait", "piel", "Retrato", uCon=1.05, uSat=1.0, uTemp=0.18, uSoft=0.5, uHi=(0.03, 0.015, 0.01))
flt("skin", "piel", "Tono de piel", uSat=1.05, uTemp=0.3, uTint=0.05, uSoft=0.2, uHi=(0.04, 0.02, 0.01))
flt("softglow", "piel", "Brillo suave", uCon=0.95, uBri=0.04, uSoft=1.0)
register({"kind": "filter", "id": "edgeblur", "cat": "piel", "label": "Desenfoque de bordes", "tags": ["fondo", "tilt shift", "enfoque"],
          "params": [wd(P["amount"], 80), wd(P["size"], 40)],
          "build": lambda p, c: [ps("blur", {"uAmt": 1, "uA": 0.04 * p.amount}), ps("edgemix", {"uAmt": 1, "uA": 0.1 + p.size * 0.006})]})

# ====================================================================== TRANSICIONES
TR_CATS = [("basicas", "Básicas"), ("zoom", "Zoom y cámara"), ("glitch", "Glitch y señal"), ("luz", "Luz y desenfoque"),
           ("desliz", "Deslizar y cortinas"), ("forma", "Formas y 3D"), ("organica", "Fluidas")]


def trans(id, cat, label, **o):
    return register({"kind": "transition", "id": id, "cat": cat, "label": label, "params": o.pop("params", [P["amount"]]), **o})


def _mul(st, k, v):
    st[k] *= v


# geo(st, p, out, W, H, pr): modifica alpha/sc/dx/dy/rot (rot en GRADOS) y sx/sy/dip. p = presencia (1 = visible)
def _g_alpha(f):
    def g(st, p, out, W, H, pr):
        st["alpha"] *= f(p)
    return g


def _deg(x):
    return math.degrees(x)


trans("none", "basicas", "Corte directo", geo=lambda st, p, out, W, H, pr: None, params=[])
trans("fade", "basicas", "Fundido (entrada / salida)", geo=_g_alpha(lambda p: p), params=[])
trans("crossfade", "basicas", "Disolución cruzada", geo=_g_alpha(lambda p: p * p * (3 - 2 * p)), params=[])


def _dip(col):
    def g(st, p, out, W, H, pr):
        st["alpha"] *= min(1, p * 1.6)
        st["dip"] = (col[0], col[1], col[2], 1 - p)
    return g


trans("fadeblack", "basicas", "Fundido a negro", geo=_dip((0, 0, 0)), params=[])
trans("fadewhite", "basicas", "Fundido a blanco", geo=_dip((255, 255, 255)), params=[])


def _g_fadescale(st, p, out, W, H, pr):
    st["alpha"] *= E(p)
    st["sc"] *= 0.9 + 0.1 * E(p)


trans("fadescale", "basicas", "Desvanecimiento", geo=_g_fadescale, params=[])


def _g_blink(st, p, out, W, H, pr):
    k = math.floor((1 - p) * 8)
    st["alpha"] *= 1 if p > 0.98 else (0.15 + 0.85 * p if k % 2 == 0 else 1)


trans("blink", "basicas", "Parpadeo", geo=_g_blink, params=[])


def _g_zoomin(st, p, out, W, H, pr):
    st["sc"] *= 0.55 + 0.45 * E(p)
    st["alpha"] *= E(p)


def _g_zoomout(st, p, out, W, H, pr):
    st["sc"] *= 1.5 - 0.5 * E(p)
    st["alpha"] *= E(p)


trans("zoomIn", "zoom", "Zoom +", geo=_g_zoomin, params=[])
trans("zoomOut", "zoom", "Zoom −", geo=_g_zoomout, params=[])


def _g_zoomfast(st, p, out, W, H, pr):
    st["sc"] *= 1 + 1.6 * (1 - ex(p)) ** 1.6
    st["alpha"] *= min(1, ex(p) * 3)


trans("zoomFast", "zoom", "Zoom rápido", geo=_g_zoomfast, build=lambda pr, c: [ps("zoomblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.5, "uB": 0, "uC": 0.5, "uD": 0.5})])


def _g_zoomblur(st, p, out, W, H, pr):
    st["sc"] *= 1.25 - 0.25 * E(p)
    st["alpha"] *= min(1, E(p) * 2)


trans("zoomBlur", "zoom", "Zoom con desenfoque", geo=_g_zoomblur, build=lambda pr, c: [ps("zoomblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.9, "uB": 0, "uC": 0.5, "uD": 0.5})])


def _g_pushpull(st, p, out, W, H, pr):
    q = 1 - p
    st["sc"] *= 1 + 0.25 * math.sin(q * math.pi) - 0.3 * q
    st["alpha"] *= min(1, p * 2.5)


trans("pushPull", "zoom", "Acercamiento y alejamiento", geo=_g_pushpull)


def _g_camroll(st, p, out, W, H, pr):
    st["rot"] += _deg((1 - E(p)) * math.pi * 0.5)
    st["sc"] *= 0.7 + 0.3 * E(p)
    st["alpha"] *= min(1, p * 2.5)


trans("cameraRoll", "zoom", "Giro de cámara", geo=_g_camroll, build=lambda pr, c: [ps("spinblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.5})])
trans("rot3d", "forma", "Rotación 3D", geo=_g_alpha(lambda p: min(1, p * 3)), build=lambda pr, c: [ps("persp", {"uB": 0, "uAng": (1 - E(c.p)) * 75, "uPiv": 0, "uDist": 2.4})])


def _g_pan(st, p, out, W, H, pr):
    st["dx"] += (-1 if out else 1) * (1 - E(p)) * W * 0.5
    st["alpha"] *= min(1, p * 2.5)


trans("pan", "zoom", "Movimiento panorámico", geo=_g_pan, build=lambda pr, c: [ps("dirblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.25, "uB": 0, "uC": 0})])


def _g_hand(st, p, out, W, H, pr):
    a = 1 - p
    st["dx"] += math.sin(p * 61) * a * W * 0.04
    st["dy"] += math.cos(p * 47) * a * H * 0.04
    st["rot"] += _deg(math.sin(p * 53) * a * 0.06)
    st["sc"] *= 1 + a * 0.08
    st["alpha"] *= min(1, p * 3)


trans("handheldT", "zoom", "Cámara en mano", geo=_g_hand, build=lambda pr, c: [ps("dirblur", {"uAmt": (1 - c.p) * pr.amount * 0.6, "uA": 0.06, "uB": 25, "uC": 0})])
trans("glitchT", "glitch", "Glitch digital", geo=_g_alpha(lambda p: min(1, p * 5)), build=lambda pr, c: [ps("glitch", {"uAmt": (1 - c.p) * pr.amount * 1.4, "uSpd": 1, "uA": 1, "uB": 1})])
trans("rgbT", "glitch", "RGB Split", geo=_g_alpha(lambda p: min(1, p * 4)), build=lambda pr, c: [ps("rgb", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.08, "uB": 0, "uC": 0, "uD": 1, "uSpd": 1})])
trans("chromaT", "glitch", "Aberración cromática", geo=_g_alpha(lambda p: min(1, p * 3)), build=lambda pr, c: [ps("rgb", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.12, "uC": 1})])
trans("shiftT", "glitch", "Desplazamiento de imagen", geo=_g_alpha(lambda p: min(1, p * 4)), build=lambda pr, c: [ps("tear", {"uAmt": (1 - c.p) * pr.amount * 1.3, "uSpd": 1, "uA": 7})])
trans("waveT", "glitch", "Distorsión ondulada", geo=_g_alpha(lambda p: min(1, p * 2.5)), build=lambda pr, c: [ps("wave", {"uAmt": (1 - c.p) * pr.amount, "uSpd": 1.5, "uA": 14, "uB": 0.12, "uC": 0})])
trans("tearT", "glitch", "Desgarro digital", geo=_g_alpha(lambda p: min(1, p * 4)), build=lambda pr, c: [ps("tear", {"uAmt": (1 - c.p) * pr.amount * 1.5, "uSpd": 1.3, "uA": 14})])
trans("signalT", "glitch", "Interferencia de señal", geo=_g_alpha(lambda p: min(1, p * 4)), build=lambda pr, c: [ps("retro", {"uAmt": (1 - c.p) * pr.amount, "uSpd": 2, "uScan": 0.6, "uJit": 3, "uBleed": 2, "uNoise": 1.4, "uTrack": 2, "uCurve": 0, "uVig": 0, "uTone": 0.6, "uFlick": 1})])
trans("tvT", "glitch", "Ruido de televisión", build=lambda pr, c: [
    ps("dissolve", {"uProg": c.p, "uB": 0, "uAmt": 0, "uEdge": (1, 1, 1)}),
    ps("retro", {"uAmt": (1 - c.p) * pr.amount, "uSpd": 2, "uScan": 1, "uJit": 1, "uBleed": 1, "uNoise": 1.6, "uTrack": 0, "uCurve": 0, "uVig": 0, "uTone": 0.6, "uFlick": 0})])
trans("flashW", "luz", "Flash blanco", params=[P["amount"]], geo=_g_alpha(lambda p: 0.4 + 0.6 * E(p)), build=lambda pr, c: [ps("flash", {"uAmt": min(1, (1 - c.p) * 1.6 * pr.amount * 1.4), "uA": 0, "uCol": (1, 1, 1)})])
trans("flashC", "luz", "Flash de color", params=[P["amount"], color("#ff3b6b")], geo=_g_alpha(lambda p: 0.4 + 0.6 * E(p)), build=lambda pr, c: [ps("flash", {"uAmt": min(1, (1 - c.p) * 1.6 * pr.amount * 1.4), "uA": 0, "uCol": pr.rgb})])
trans("flareT", "luz", "Destello de lente", geo=_g_alpha(lambda p: 0.5 + 0.5 * E(p)), build=lambda pr, c: [ps("flare", {"uAmt": math.sin(math.pi * min(1, (1 - c.p) * 1.3)) * pr.amount, "uSpd": 1, "uA": 1.2, "uC": 0.75, "uD": 0.8})])
trans("leakT", "luz", "Fuga de luz", geo=_g_alpha(lambda p: 0.4 + 0.6 * E(p)), build=lambda pr, c: [ps("leak", {"uAmt": math.sin(math.pi * min(1, (1 - c.p) * 1.2)) * pr.amount * 1.3, "uSpd": 1.6, "uA": 2.4, "uB": 1.4})])
trans("radialT", "luz", "Desenfoque radial", geo=_g_alpha(lambda p: min(1, p * 2)), build=lambda pr, c: [ps("zoomblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.6, "uB": 0, "uC": 0.5, "uD": 0.5})])


def _g_motion(st, p, out, W, H, pr):
    st["dx"] += (-1 if out else 1) * (1 - E(p)) * W * 0.15
    st["alpha"] *= min(1, p * 2.5)


trans("motionT", "luz", "Desenfoque de movimiento", geo=_g_motion, build=lambda pr, c: [ps("dirblur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.3, "uB": 0, "uC": 0})])
trans("gaussT", "luz", "Desenfoque gaussiano", geo=_g_alpha(lambda p: min(1, p * 2)), build=lambda pr, c: [ps("blur", {"uAmt": (1 - c.p) * pr.amount, "uA": 0.16})])
trans("lightsweep", "luz", "Barrido luminoso", params=[P["amount"], color("#fff2c8")], geo=_g_alpha(lambda p: min(1, p * 3)), build=lambda pr, c: [
    ps("sweep", {"uAmt": (1 - c.p) * pr.amount * 1.4, "uSpd": 0, "uA": 6, "uB": 20, "uCol": pr.rgb, "uTime": 0}),
    ps("mask", {"uProg": c.p, "uB": 0, "uC": 20, "uSoft": 0.25, "uAmt": 0, "uEdge": (0, 0, 0)})])


def _slide(axis, sign):
    def g(st, p, out, W, H, pr):
        d = (-1 if out else 1) * (1 - E(p)) * (W if axis == "dx" else H)
        st[axis] += sign * d
    return g


trans("slideLeft", "desliz", "Deslizar ←", geo=_slide("dx", 1), params=[])
trans("slideRight", "desliz", "Deslizar →", geo=_slide("dx", -1), params=[])
trans("slideUp", "desliz", "Deslizar ↑", geo=_slide("dy", 1), params=[])
trans("slideDown", "desliz", "Deslizar ↓", geo=_slide("dy", -1), params=[])


def maskT(id, cat, label, mode, angle=0, inv=0, slats=8):
    trans(id, cat, label, params=[wd(P["amount"], 50)], build=lambda pr, c: [
        ps("mask", {"uProg": E(c.p), "uB": mode, "uC": angle, "uD": inv, "uA": slats, "uSoft": 0.03, "uAmt": 0, "uEdge": (1, 1, 1)})])


maskT("wipeRight", "desliz", "Cortina →", 0, 0)
maskT("wipeDown", "desliz", "Cortina ↓", 0, 270)
maskT("wipeH", "desliz", "Barrido horizontal", 0, 180)
maskT("wipeV", "desliz", "Barrido vertical", 0, 90)
maskT("diagT", "desliz", "Máscara diagonal", 0, 45)
maskT("splitT", "desliz", "División de pantalla", 5)
maskT("splitH", "desliz", "División horizontal", 6)
maskT("blindsT", "desliz", "Cortinilla", 7, slats=8)
maskT("irisOpen", "forma", "Apertura circular", 1, inv=0)
maskT("irisClose", "forma", "Cierre circular", 1, inv=1)
maskT("clockT", "forma", "Reloj", 8)
maskT("blocksT", "forma", "Bloques", 9)
maskT("diamondT", "forma", "Rombo", 2, inv=0)
maskT("starT", "forma", "Estrella (formas)", 3, inv=0)
maskT("heartT", "forma", "Corazón (formas)", 4, inv=0)
trans("cube", "forma", "Cubo 3D", geo=_g_alpha(lambda p: min(1, p * 3)), build=lambda pr, c: [ps("persp", {"uB": 3, "uAng": (-1 if c.out else 1) * (1 - E(c.p)) * 90, "uPiv": 1 if c.out else -1, "uDist": 3})])
trans("pageturn", "forma", "Giro de página", build=lambda pr, c: [ps("curl", {"uProg": E(c.p)})])
trans("flipH", "forma", "Volteo horizontal", geo=_g_alpha(lambda p: 1 if p > 0.02 else 0), build=lambda pr, c: [ps("persp", {"uB": 0, "uAng": (-1 if c.out else 1) * (1 - c.p) * 88, "uPiv": 0, "uDist": 2.6})])
trans("flipV", "forma", "Volteo vertical", geo=_g_alpha(lambda p: 1 if p > 0.02 else 0), build=lambda pr, c: [ps("persp", {"uB": 1, "uAng": (-1 if c.out else 1) * (1 - c.p) * 88, "uPiv": 0, "uDist": 2.6})])


def _g_spin(st, p, out, W, H, pr):
    st["rot"] += _deg((-1 if out else 1) * (1 - E(p)) * math.pi)
    st["sc"] *= E(p)
    st["alpha"] *= E(p)


trans("spin", "forma", "Giro", geo=_g_spin, params=[])


def _g_screenrot(st, p, out, W, H, pr):
    st["rot"] += _deg((-1 if out else 1) * (1 - E(p)) * math.pi * 2)
    st["sc"] *= 0.6 + 0.4 * E(p)
    st["alpha"] *= min(1, p * 2.5)


trans("screenRot", "forma", "Rotación de pantalla", geo=_g_screenrot, params=[])


def _g_spiral(st, p, out, W, H, pr):
    st["sc"] *= 0.5 + 0.5 * E(p)
    st["alpha"] *= min(1, p * 2.5)


trans("spiral", "organica", "Espiral", geo=_g_spiral, build=lambda pr, c: [ps("swirl", {"uAmt": (1 - c.p) * pr.amount * 1.6, "uSpd": 1, "uA": 0.9, "uB": 12, "uC": 0.5, "uD": 0.5})])


def _g_stretch(st, p, out, W, H, pr):
    e = ex(p)
    st["sx"] = 0.05 + 0.95 * e * (1 + 0.12 * math.sin(p * 9) * (1 - p))
    st["sy"] = 1.9 - 0.9 * e
    st["alpha"] *= min(1, p * 3)


trans("stretchT", "organica", "Estiramiento", geo=_g_stretch, params=[])
trans("rippleT", "organica", "Ondulación", geo=_g_alpha(lambda p: min(1, p * 2.5)), build=lambda pr, c: [ps("ripple", {"uAmt": (1 - c.p) * pr.amount * 1.4, "uSpd": 1, "uA": 36, "uB": 0.12, "uC": 0.5, "uD": 0.5})])
trans("liquid", "organica", "Transición líquida", build=lambda pr, c: [
    ps("dissolve", {"uProg": c.p, "uB": 1, "uAmt": 0.8, "uEdge": (0.4, 0.8, 1), "uTime": c.t}),
    ps("wave", {"uAmt": (1 - c.p) * pr.amount, "uSpd": 1, "uA": 10, "uB": 0.05, "uC": 2, "uTime": c.t})])
trans("particlesT", "organica", "Partículas", params=[P["amount"], color("#ffd36b")], build=lambda pr, c: [ps("dissolve", {"uProg": c.p, "uB": 2, "uAmt": 1, "uEdge": pr.rgb, "uTime": c.t})])
trans("dissolveT", "organica", "Disolución de ruido", build=lambda pr, c: [ps("dissolve", {"uProg": c.p, "uB": 3, "uAmt": 0.4, "uEdge": (1, 1, 1), "uTime": c.t})])


def build_passes(item: dict, pr, c) -> list:
    b = item.get("build")
    return list(b(pr, c)) if b else []
