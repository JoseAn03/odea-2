# -*- coding: utf-8 -*-
"""Generador de arte pixel para ODEA 2 — Costa Neón (v2).
Estilo RPG vista cenital tipo Pokémon / GTA clásico: tiles de 32x32,
personajes de 16x20 con caminar de 2 cuadros, props (postes, árboles),
carro y moto. El avatar del jugador es ÚNICO: es el único con gorra.
Paleta Costa Neón: rosa #FF2E93, cian #00E5FF, naranja #FF8A3D, fondo #12081F.
Salida: tileset.png, props.png, personaje.png, npc_1.png, npc_2.png,
carro/moto sueltos, preview.png (estática con luces) y preview_anim.gif.
"""
import math
import os
import random
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(20261116)

ROSA = (255, 46, 147)
CIAN = (0, 229, 255)
NARANJA = (255, 138, 61)
FONDO = (18, 8, 31)


# ---------------- tiles 32x32 ----------------
def tile_base(color, speckles, n=90, seed=1):
    rnd = random.Random(seed)
    img = Image.new("RGB", (32, 32), color)
    px = img.load()
    for _ in range(n):
        px[rnd.randrange(32), rnd.randrange(32)] = speckles[rnd.randrange(len(speckles))]
    return img


def t_asfalto(seed=1):
    return tile_base((27, 27, 38), [(35, 35, 47), (20, 20, 28), (42, 42, 56)], 110, seed)


def t_asfalto_linea():
    img = t_asfalto(2)
    d = ImageDraw.Draw(img)
    for seg in (range(2, 14), range(18, 30)):
        for x in seg:
            d.point((x, 15), (201, 162, 39))
            d.point((x, 16), (201, 162, 39))
    return img


def t_asfalto_linea_v():
    img = t_asfalto_linea()
    return img.rotate(90)


def t_acera(seed=3):
    img = tile_base((58, 58, 74), [(66, 66, 84), (50, 50, 64)], 60, seed)
    d = ImageDraw.Draw(img)
    d.line([(0, 0), (31, 0)], fill=(44, 44, 58))
    d.line([(0, 0), (0, 31)], fill=(44, 44, 58))
    d.line([(15, 0), (15, 31)], fill=(50, 50, 66))
    d.line([(0, 15), (31, 15)], fill=(50, 50, 66))
    return img


def t_cebra():
    img = t_asfalto(4)
    d = ImageDraw.Draw(img)
    for x in (3, 10, 17, 24):
        d.rectangle([x, 2, x + 3, 29], fill=(210, 210, 215))
    return img


def t_grama(seed=5):
    img = tile_base((14, 46, 34), [(20, 83, 45), (27, 67, 50), (10, 36, 26)], 130, seed)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed + 9)
    for _ in range(3):
        d.point((rnd.randrange(32), rnd.randrange(32)), ROSA if rnd.random() < 0.5 else CIAN)
    return img


def t_techo(base, borde, detalle, seed=6, letrero=None):
    img = tile_base(base, [(min(base[0] + 8, 255), min(base[1] + 8, 255), min(base[2] + 8, 255))], 40, seed)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 31], outline=borde, width=2)
    d.rectangle([5, 5, 14, 12], fill=detalle)
    d.rectangle([5, 5, 14, 12], outline=borde)
    d.ellipse([20, 18, 27, 25], outline=borde)
    d.point((23, 21), borde)
    if letrero:
        d.rectangle([18, 3, 29, 6], fill=letrero)  # letrero de neón en el techo
    return img


def t_plaza(seed=7):
    img = tile_base((42, 20, 48), [(61, 29, 69), (34, 16, 40)], 70, seed)
    d = ImageDraw.Draw(img)
    d.line([(0, 0), (31, 0)], fill=(80, 36, 92))
    d.line([(0, 0), (0, 31)], fill=(80, 36, 92))
    d.line([(15, 0), (15, 31)], fill=(66, 30, 78))
    d.line([(0, 15), (31, 15)], fill=(66, 30, 78))
    d.point((7, 7), ROSA)
    d.point((23, 23), CIAN)
    return img


TILES = [
    ("asfalto", t_asfalto()),
    ("asfalto_linea", t_asfalto_linea()),
    ("asfalto_linea_v", t_asfalto_linea_v()),
    ("acera", t_acera()),
    ("cebra", t_cebra()),
    ("grama", t_grama()),
    ("techo_a", t_techo((36, 26, 51), (50, 35, 74), (59, 42, 85))),
    ("techo_b", t_techo((46, 26, 46), (74, 35, 64), (59, 42, 85), 8, letrero=ROSA)),
    ("techo_c", t_techo((26, 36, 46), (35, 60, 74), (42, 70, 85), 9, letrero=CIAN)),
    ("plaza", t_plaza()),
]
TMAP = dict(TILES)


# ---------------- personajes 16x20 ----------------
# . transparente · C gorra (SOLO el jugador) · H pelo · S piel · T camisa · P pantalón · Z zapatos
FRENTE_A = [
    "................",
    ".....CCCCCC.....",
    "....CCCCCCCC....",
    "....HHHHHHHH....",
    "....HSSSSSSH....",
    "....SSSSSSSS....",
    ".....SSSSSS.....",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "...STTTTTTTTS...",
    "...STTTTTTTTS...",
    "....TTTTTTTT....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "...ZZZ....ZZZ...",
    "...ZZZ....ZZZ...",
    "................",
    "................",
]
FRENTE_B = [
    "................",
    ".....CCCCCC.....",
    "....CCCCCCCC....",
    "....HHHHHHHH....",
    "....HSSSSSSH....",
    "....SSSSSSSS....",
    ".....SSSSSS.....",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "...STTTTTTTTS...",
    "...STTTTTTTTS...",
    "....TTTTTTTT....",
    "....PPPPPPPP....",
    ".....PPPPPP.....",
    ".....PPPPPP.....",
    ".....PPPPPP.....",
    ".....ZZZZZZ.....",
    ".....ZZZZZZ.....",
    "................",
    "................",
]
ESPALDA_A = [
    "................",
    ".....CCCCCC.....",
    "....CCCCCCCC....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    ".....HHHHHH.....",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "...STTTTTTTTS...",
    "...STTTTTTTTS...",
    "....TTTTTTTT....",
    "....PPPPPPPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "....PPP..PPP....",
    "...ZZZ....ZZZ...",
    "...ZZZ....ZZZ...",
    "................",
    "................",
]
ESPALDA_B = [r.replace("PPP..PPP", ".PPPPPP.").replace("ZZZ....ZZZ", ".ZZZZZZ.") if i >= 13 else r
             for i, r in enumerate(ESPALDA_A)]
LADO_A = [
    "................",
    "......CCCCCC....",
    ".....CCCCCCC....",
    ".....HHHHHHH....",
    ".....HSSSSS.....",
    ".....SSSSS......",
    "......SSSS......",
    ".....TTTTTT.....",
    ".....TTTTTT.....",
    ".....TTTTTS.....",
    ".....TTTTT......",
    ".....TTTTTT.....",
    ".....PPPPPP.....",
    ".....PPP.PP.....",
    ".....PP...PP....",
    ".....PP...PP....",
    "....ZZZ...ZZZ...",
    "....ZZZ...ZZZ...",
    "................",
    "................",
]
LADO_B = [
    "................",
    "......CCCCCC....",
    ".....CCCCCCC....",
    ".....HHHHHHH....",
    ".....HSSSSS.....",
    ".....SSSSS......",
    "......SSSS......",
    ".....TTTTTT.....",
    ".....TTTTTT.....",
    ".....TTTTTS.....",
    ".....TTTTT......",
    ".....TTTTTT.....",
    ".....PPPPPP.....",
    "......PPPP......",
    "......PPPP......",
    "......PPPP......",
    "......ZZZZ......",
    "......ZZZZ......",
    "................",
    "................",
]

# El jugador: gorra azul, camisa cian, tenis rosa neón. Nadie más usa gorra.
PAL_JUGADOR = {"C": (34, 85, 255), "H": (42, 26, 46), "S": (242, 177, 131),
               "T": (0, 184, 204), "P": (35, 35, 58), "Z": ROSA}
PAL_NPC1 = {"H": (20, 16, 24), "S": (198, 134, 88),
            "T": (255, 46, 147), "P": (24, 24, 40), "Z": (240, 240, 245)}
PAL_NPC2 = {"H": (90, 60, 40), "S": (255, 205, 160),
            "T": (240, 240, 245), "P": (0, 120, 140), "Z": (0, 229, 255)}


def sin_gorra(rows):
    """Los NPC no usan gorra: la gorra se convierte en pelo."""
    return [r.replace("C", "H") for r in rows]


def sprite(rows, pal, gorra=True):
    if not gorra:
        rows = sin_gorra(rows)
    img = Image.new("RGBA", (16, 20), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                px[x, y] = pal[ch] + (255,)
    return img


def hoja(pal, gorra=True):
    frames = [sprite(FRENTE_A, pal, gorra), sprite(FRENTE_B, pal, gorra),
              sprite(ESPALDA_A, pal, gorra), sprite(ESPALDA_B, pal, gorra),
              sprite(LADO_A, pal, gorra), sprite(LADO_B, pal, gorra)]
    sheet = Image.new("RGBA", (16 * 6, 20), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 16, 0))
    return sheet


# ---------------- props y vehículos ----------------
def poste():
    """Poste de luz 12x28 con bombillo cálido."""
    img = Image.new("RGBA", (12, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([5, 8, 6, 27], fill=(52, 52, 66, 255))
    d.rectangle([2, 6, 9, 8], fill=(52, 52, 66, 255))
    d.ellipse([2, 0, 9, 6], fill=(255, 214, 120, 255))
    d.ellipse([4, 1, 7, 4], fill=(255, 240, 190, 255))
    return img


def arbol():
    img = Image.new("RGBA", (28, 28), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([13, 20, 15, 27], fill=(74, 52, 36, 255))
    for (x, y, r, c) in [(14, 11, 10, (16, 66, 42)), (8, 14, 6, (20, 83, 45)),
                         (20, 14, 6, (20, 83, 45)), (14, 6, 6, (24, 94, 52))]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,))
    rnd = random.Random(11)
    for _ in range(14):
        d.point((rnd.randrange(4, 24), rnd.randrange(2, 20)), (40, 140, 80, 255))
    return img


def banca():
    img = Image.new("RGBA", (24, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 2, 23, 4], fill=(110, 74, 44, 255))
    d.rectangle([0, 6, 23, 7], fill=(96, 64, 38, 255))
    d.rectangle([2, 8, 4, 9], fill=(40, 40, 52, 255))
    d.rectangle([19, 8, 21, 9], fill=(40, 40, 52, 255))
    return img


def carro(color, color2=None):
    """Carro cenital horizontal 44x22 (apunta a la derecha)."""
    img = Image.new("RGBA", (44, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([6, 2, 9, 5], fill=(16, 16, 22, 255))    # llantas
    d.rectangle([6, 16, 9, 19], fill=(16, 16, 22, 255))
    d.rectangle([34, 2, 37, 5], fill=(16, 16, 22, 255))
    d.rectangle([34, 16, 37, 19], fill=(16, 16, 22, 255))
    d.rounded_rectangle([2, 3, 41, 18], 5, fill=color + (255,))
    d.rectangle([13, 5, 29, 16], fill=(color2 or color) + (255,))   # techo
    d.rectangle([10, 5, 13, 16], fill=(30, 40, 60, 255))            # parabrisas
    d.rectangle([29, 5, 32, 16], fill=(30, 40, 60, 255))
    d.point((41, 6), (255, 240, 180, 255))                          # luces
    d.point((41, 15), (255, 240, 180, 255))
    d.point((2, 6), (255, 60, 60, 255))
    d.point((2, 15), (255, 60, 60, 255))
    return img


def moto():
    """Moto cenital 26x10 (apunta a la derecha), sin piloto."""
    img = Image.new("RGBA", (26, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle([1, 3, 5, 6], fill=(14, 14, 20, 255))   # llanta trasera
    d.rectangle([20, 3, 24, 6], fill=(14, 14, 20, 255))  # llanta delantera
    d.rectangle([4, 4, 20, 5], fill=(200, 30, 60, 255))  # cuerpo
    d.rectangle([8, 3, 13, 6], fill=(30, 30, 44, 255))   # asiento
    d.point((24, 2), (220, 220, 230, 255))               # manubrio/luz
    d.point((24, 7), (220, 220, 230, 255))
    return img


PROPS = [("poste", poste()), ("arbol", arbol()), ("banca", banca()),
         ("carro_cian", carro((0, 150, 180), (0, 110, 140))),
         ("carro_rosa", carro((200, 40, 110), (150, 30, 85))),
         ("moto", moto())]


# ---------------- escena ----------------
# 16x11 tiles. a asfalto · l línea H · v línea V · . acera · c cebra
# g grama · A/B/C techos · p plaza
M = [
    "ggggAAAAccaaaaaa",
    "ggaa....ccvvvvvv",
    "ggaa....ccvvvvvv",
    "....pp..ccvvBBBB",
    "....pp..ccvvBBBB",
    "aallllllaallllla",
    "aallllllaallllla",
    "....cc..pp..ggCC",
    "vv..cc..pp..ggCC",
    "vv..cc..aaaaaagg",
    "vv..cc..aaaaaagg",
]
IDX = {"a": "asfalto", "l": "asfalto_linea", "v": "asfalto_linea_v", ".": "acera",
       "c": "cebra", "g": "grama", "A": "techo_a", "B": "techo_b", "C": "techo_c", "p": "plaza"}
POSTES = [(3, 1), (12, 0), (6, 4), (1, 6), (14, 6), (4, 9)]  # (tile x, tile y)


def escena_base():
    img = Image.new("RGB", (16 * 32, 11 * 32), FONDO)
    for y, fila in enumerate(M):
        for x, ch in enumerate(fila):
            img.paste(TMAP[IDX[ch]], (x * 32, y * 32))
    d = ImageDraw.Draw(img)
    # árboles y bancas en la grama/plaza
    img.paste(arbol(), (0 * 32 + 2, 0 * 32 + 2), arbol())
    img.paste(arbol(), (1 * 32 + 4, 3 * 32 + 2), arbol())
    img.paste(banca(), (4 * 32 + 4, 3 * 32 + 20), banca())
    img.paste(moto(), (13 * 32 + 2, 9 * 32 + 10), moto())  # moto parqueada
    return img


def con_luces(img, fase=0.0):
    """Oscurece la escena (noche) y enciende los postes con halo cálido."""
    noche = Image.new("RGB", img.size, (8, 8, 24))
    base = Image.blend(img, noche, 0.38).convert("RGBA")
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = 30 + int(3 * math.sin(fase))
    for (tx, ty) in POSTES:
        cx, cy = tx * 32 + 16, ty * 32 + 12
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 196, 90, 66))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    base = Image.alpha_composite(base, glow)
    for (tx, ty) in POSTES:
        p = poste()
        base.paste(p, (tx * 32 + 10, ty * 32 + 2), p)
    return base


def frame_escena(i):
    """Cuadro i de la animación: el jugador camina por la plaza,
    un carro cruza la calle horizontal y las luces respiran."""
    img = con_luces(escena_base(), fase=i * 0.9)
    # carro cian cruzando la calle (fila 5-6), se repite
    cx = -50 + (i * 26) % 580
    c = carro((0, 150, 180), (0, 110, 140))
    img.paste(c, (cx, 5 * 32 + 22), c)
    # jugador caminando hacia abajo por la plaza (columna 4-5)
    pasos = [FRENTE_A, FRENTE_B]
    py = 3 * 32 + (i * 5) % 60
    pj = sprite(pasos[i % 2], PAL_JUGADOR, gorra=True)
    img.paste(pj, (4 * 32 + 24, py), pj)
    # NPC caminando hacia arriba por la acera de la derecha
    pasos_n = [ESPALDA_A, ESPALDA_B]
    ny = 9 * 32 - (i * 5) % 60
    npc = sprite(pasos_n[i % 2], PAL_NPC1, gorra=False)
    img.paste(npc, (11 * 32 + 8, ny), npc)
    # NPC de lado cruzando la cebra
    nx = 7 * 32 + (i * 6) % 50
    npc2 = sprite([LADO_A, LADO_B][i % 2], PAL_NPC2, gorra=False)
    img.paste(npc2, (nx, 2 * 32 + 6), npc2)
    return img.convert("RGB")


def main():
    ts = Image.new("RGB", (32 * len(TILES), 32), FONDO)
    for i, (_, t) in enumerate(TILES):
        ts.paste(t, (i * 32, 0))
    ts.save(os.path.join(OUT, "tileset.png"))
    hoja(PAL_JUGADOR, gorra=True).save(os.path.join(OUT, "personaje.png"))
    hoja(PAL_NPC1, gorra=False).save(os.path.join(OUT, "npc_1.png"))
    hoja(PAL_NPC2, gorra=False).save(os.path.join(OUT, "npc_2.png"))
    pp = Image.new("RGBA", (44 * 3, 28), (0, 0, 0, 0))
    pp.paste(poste(), (0, 0), poste())
    pp.paste(arbol(), (44, 0), arbol())
    pp.paste(carro((0, 150, 180), (0, 110, 140)), (88, 3), carro((0, 150, 180), (0, 110, 140)))
    pp.save(os.path.join(OUT, "props.png"))
    carro((0, 150, 180), (0, 110, 140)).save(os.path.join(OUT, "carro_cian.png"))
    carro((200, 40, 110), (150, 30, 85)).save(os.path.join(OUT, "carro_rosa.png"))
    moto().save(os.path.join(OUT, "moto.png"))

    estatica = frame_escena(3)
    estatica.resize((estatica.width * 3, estatica.height * 3), Image.NEAREST).save(
        os.path.join(OUT, "preview.png"))
    frames = [frame_escena(i).resize((512, 352), Image.NEAREST) for i in range(12)]
    frames[0].save(os.path.join(OUT, "preview_anim.gif"), save_all=True,
                   append_images=frames[1:], duration=190, loop=0)
    print("OK v2:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
