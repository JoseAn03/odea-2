# -*- coding: utf-8 -*-
"""Generador de arte pixel para ODEA 2 — Costa Neón.
Tiles de 32x32 y sprites de personaje 16x20 dibujados por código (PIL).
Paleta Costa Neón: rosa #FF2E93, cian #00E5FF, naranja #FF8A3D, fondo #12081F.
Salida: tileset.png, personaje.png (hoja de frames), npc_*.png, preview.png
"""
import os
import random
from PIL import Image, ImageDraw

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(20261116)

ROSA = (255, 46, 147)
CIAN = (0, 229, 255)
NARANJA = (255, 138, 61)
FONDO = (18, 8, 31)


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
    for x in range(2, 14):
        d.point((x, 15), (201, 162, 39))
        d.point((x, 16), (201, 162, 39))
    for x in range(18, 30):
        d.point((x, 15), (201, 162, 39))
        d.point((x, 16), (201, 162, 39))
    return img


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


def t_techo(base, borde, detalle, seed=6):
    img = tile_base(base, [(min(base[0] + 8, 255), min(base[1] + 8, 255), min(base[2] + 8, 255))], 40, seed)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 31, 31], outline=borde, width=2)
    d.rectangle([5, 5, 14, 12], fill=detalle)          # caja de aire acondicionado
    d.rectangle([5, 5, 14, 12], outline=borde)
    d.ellipse([20, 18, 27, 25], outline=borde)          # ventilación
    d.point((23, 21), borde)
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
    ("acera", t_acera()),
    ("cebra", t_cebra()),
    ("grama", t_grama()),
    ("techo_a", t_techo((36, 26, 51), (50, 35, 74), (59, 42, 85))),
    ("techo_b", t_techo((46, 26, 46), (74, 35, 64), (59, 42, 85), 8)),
    ("plaza", t_plaza()),
]

# ---------------- personajes (16x20) ----------------
# . transparente · C gorra · H pelo · S piel · T camisa · P pantalón · Z zapatos
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

PAL_JUGADOR = {"C": (34, 85, 255), "H": (42, 26, 46), "S": (242, 177, 131),
               "T": (0, 184, 204), "P": (35, 35, 58), "Z": ROSA}
PAL_NPC1 = {"C": (255, 138, 61), "H": (20, 16, 24), "S": (198, 134, 88),
            "T": (255, 46, 147), "P": (24, 24, 40), "Z": (240, 240, 245)}
PAL_NPC2 = {"C": (24, 24, 40), "H": (90, 60, 40), "S": (255, 205, 160),
            "T": (240, 240, 245), "P": (0, 120, 140), "Z": (0, 229, 255)}


def sprite(rows, pal):
    img = Image.new("RGBA", (16, 20), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in pal:
                px[x, y] = pal[ch] + (255,)
    return img


def hoja(pal):
    frames = [sprite(FRENTE_A, pal), sprite(FRENTE_B, pal),
              sprite(ESPALDA_A, pal), sprite(ESPALDA_B, pal),
              sprite(LADO_A, pal), sprite(LADO_B, pal)]
    sheet = Image.new("RGBA", (16 * 6, 20), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 16, 0))
    return sheet


def main():
    # tileset: 8 tiles en una fila
    ts = Image.new("RGB", (32 * len(TILES), 32), FONDO)
    for i, (_, t) in enumerate(TILES):
        ts.paste(t, (i * 32, 0))
    ts.save(os.path.join(OUT, "tileset.png"))
    hoja(PAL_JUGADOR).save(os.path.join(OUT, "personaje.png"))
    hoja(PAL_NPC1).save(os.path.join(OUT, "npc_1.png"))
    hoja(PAL_NPC2).save(os.path.join(OUT, "npc_2.png"))

    # preview: esquina de ciudad 12x9 tiles
    M = [
        "ggggtttttttt",
        "ggaaccllaaaa",
        "ggaaccllaaaa",
        "aa..ccll..aa",
        "aa..ccll..tt",
        "aapppppllggg",
        "aapppppllggg",
        "ttllllccttaa",
        "ttllllccttaa",
    ]
    idx = {"a": 0, "l": 1, ".": 2, "c": 3, "g": 4, "t": 5, "T": 6, "p": 7}
    escena = Image.new("RGB", (12 * 32, 9 * 32), FONDO)
    tiles = dict(TILES)
    orden = [n for n, _ in TILES]
    for y, fila in enumerate(M):
        for x, ch in enumerate(fila):
            escena.paste(tiles[orden[idx[ch]]], (x * 32, y * 32))
    # personajes sobre la escena (frame frente A del jugador, lado A npc)
    pj = sprite(FRENTE_A, PAL_JUGADOR)
    n1 = sprite(LADO_A, PAL_NPC1)
    n2 = sprite(FRENTE_B, PAL_NPC2)
    escena.paste(pj, (5 * 32 + 8, 5 * 32 + 4), pj)
    escena.paste(n1, (2 * 32 + 8, 1 * 32 + 6), n1)
    escena.paste(n2, (8 * 32 + 8, 7 * 32 + 4), n2)
    escena_big = escena.resize((escena.width * 4, escena.height * 4), Image.NEAREST)
    escena_big.save(os.path.join(OUT, "preview.png"))
    ts_big = ts.resize((ts.width * 4, ts.height * 4), Image.NEAREST)
    ts_big.save(os.path.join(OUT, "tileset_preview.png"))
    print("OK:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
