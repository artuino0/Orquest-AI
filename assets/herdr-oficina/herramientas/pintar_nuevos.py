"""Pinta las piezas nuevas en el estilo del pack Pixel Office (el de
`../sprites`): mismo tamaño nativo, misma paleta de 16 colores y la misma vista
a 45 grados desde arriba.

Dos clases de pieza:

  - Pintadas desde cero, como matrices donde cada letra es un color de la
    paleta: maquinitas, servidores, aire acondicionado, pisos, paredes, billar,
    futbolito,
    bandera de México, librero
    gris, sillas de frente,
    sofás de lado y tres personajes (de pie y sentados).
  - Derivadas de un sprite del pack, editado por programa: personajes de
    espaldas, sofás y libreros por detrás. Sus colores se leen del original,
    así que cada variante empata sola con el suyo.

También saca las hojas animadas de los personajes (quieto, caminar, teclear),
moviendo un píxel las partes del propio sprite.

No toca ningún archivo del pack: solo escribe nombres nuevos.

Uso: python pintar_nuevos.py            (desde cualquier carpeta)
"""
from pathlib import Path
from PIL import Image

SPRITES = Path(__file__).resolve().parent.parent / "sprites"

# Paleta del pack (Sweetie 16) y la letra con que se pinta cada color.
HEX = {
    "k": "1a1c2c", "p": "5d275d", "r": "b13e53", "o": "ef7d57", "y": "ffcd75", "l": "a7f070",
    "g": "38b764", "t": "257179", "n": "29366f", "b": "3b5dc9", "c": "41a6f6", "a": "73eff7",
    "w": "f4f4f4", "s": "94b0c2", "d": "566c86", "e": "333c57",
}
P = {k: tuple(int(v[i:i + 2], 16) for i in (0, 2, 4)) + (255,) for k, v in HEX.items()}
LETTER = {v: k for k, v in P.items()}
written = []


def load(name):
    return Image.open(SPRITES / f"{name}.png").convert("RGBA")


def save(name, img):
    img.save(SPRITES / f"{name}.png")
    written.append(f"{name}.png {img.width}x{img.height}")
    return img


def mat(rows, colors=None):
    """Matriz de letras a imagen. `colors` da el color de las letras que no son
    de la paleta (A, B, L: tonos que cambian de una variante a otra)."""
    for i, row in enumerate(rows):
        assert len(row) == len(rows[0]), (i, len(row), row)
    img = Image.new("RGBA", (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            color = (colors or {}).get(ch) or P.get(ch)
            if color:
                img.putpixel((x, y), color)
    return img


def strip(frames):
    """Cuadros en fila, para una animación."""
    sheet = Image.new("RGBA", (frames[0].width * len(frames), frames[0].height), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.alpha_composite(f, (i * f.width, 0))
    return sheet


# ------------------------------------------------------------------ maquinitas
# Vista a 45 grados, como la máquina expendedora del pack: arriba la tapa (L,
# el tono claro, y H su filo), luego el frente (A) con marquesina y pantalla.
# El tablero de controles sobresale: se le ve la cara de arriba (B, con la
# palanca y los botones) y debajo su canto (C); la base queda remetida.
CABINET = [
    ".kkkkkkkkkkkkkk.", "kLLLLLLLLLLLLLLk", "kLLLLLLLLLLLLLLk", "kLLLLLLLLLLLLLLk", "kHHHHHHHHHHHHHHk",
    "kAAAAAAAAAAAAAAk", "kAyyoyyoyyoyyoAk", "kAAAAAAAAAAAAAAk", "kAkkkkkkkkkkkkAk",
    "kAk..........kAk", "kAk..........kAk", "kAk..........kAk", "kAk..........kAk",
    "kAk..........kAk", "kAk..........kAk", "kAk..........kAk", "kAkkkkkkkkkkkkAk", "kkkkkkkkkkkkkkkk",
    "kBBBBBBBBBBBBBBk", "kBrBBBoBBByBgBBk", "kBkBBBBBBBBBBBBk", "kCCCCCCCCCCCCCCk", "kkkkkkkkkkkkkkkk",
    ".kAAAAAAAAAAAAk.", ".kAAkkkkkkkkAAk.", ".kAAkeeeeeekAAk.", ".kAAkeoeeoekAAk.", ".kAAkeeeeeekAAk.",
    ".kAAkkkkkkkkAAk.", ".kAAAAAAAAAAAAk.", ".kDDDDDDDDDDDDk.", ".kkkkkkkkkkkkkk.", ".kk..........kk.",
]
SCREEN_AT = (3, 9)
# La pantalla, cuadro por cuadro: unas naves bajan y la de abajo dispara.
SCREEN = [
    ["eeeeeeeeee", "elelelelee", "eeeeeeeeee", "eeeeyeeeee", "eeeeeeeeee", "eeeeeeeeee", "eeeeweeeee"],
    ["eeeeeeeeee", "eelelelele", "eeeeeeeeee", "eeeeeeeeee", "eeeeeyeeee", "eeeeeeeeee", "eeeeeweeee"],
    ["eeeeeeeeee", "elelelelee", "eeeeoeeeee", "eeeeeeeeee", "eeeeeeeeee", "eeeeeeeeee", "eeeeeeweee"],
]
PANEL = {"B": P["s"], "C": P["d"]}  # tablero de metal gris en las dos
for name, tones in (
    ("maquinita-azul", {"A": P["n"], "L": P["b"], "H": P["c"], "D": P["e"]}),
    ("maquinita-roja", {"A": P["r"], "L": P["o"], "H": P["y"], "D": P["p"]}),
):
    frames = []
    for screen in SCREEN:
        frame = mat(CABINET, {**tones, **PANEL})
        frame.alpha_composite(mat(screen), SCREEN_AT)
        frames.append(frame)
    save(name, frames[0])
    save(f"{name}-anim", strip(frames))

# -------------------------------------------------------------------- servidores
# Rack de piso, a 45 grados: tapa gris arriba (L y su filo H), cuerpo oscuro (A)
# y siete charolas negras, cada una con su ranura y dos lucecitas a la derecha.
RACK_TOP = [
    ".kkkkkkkkkkkkkk.", "kLLLLLLLLLLLLLLk", "kLLLLLLLLLLLLLLk", "kLLLLLLLLLLLLLLk", "kHHHHHHHHHHHHHHk",
    "kAAAAAAAAAAAAAAk", "kAAAAAAAAAAAAAAk",
]
RACK_FOOT = ["kAAAAAAAAAAAAAAk", "kAAAAAAAAAAAAAAk", "kkkkkkkkkkkkkkkk", ".kk..........kk."]
RACK_TONES = {"A": P["e"], "L": P["d"], "H": P["s"]}
UNITS = 7


def rack(frame):
    rows = list(RACK_TOP)
    for i in range(UNITS):
        lights = ""
        for j in range(2):
            on = (i * 2 + j + frame) % 3 != 0  # cada luz se apaga en uno de los tres cuadros
            lights += ("y" if i % 3 == 1 and j == 1 else "l") if on else "e"
        rows += ["kAk" + "kkkkkk" + lights[0] + "k" + lights[1] + "k" + "kAk", "kAk" + "ddddddkkkk" + "kAk", "kAAAAAAAAAAAAAAk"]
    return mat(rows + RACK_FOOT, RACK_TONES)


racks = [rack(f) for f in range(3)]
save("servidor", racks[0])
save("servidor-anim", strip(racks))


def pair(img):
    """Dos racks juntos, compartiendo el contorno de en medio."""
    out = Image.new("RGBA", (img.width * 2 - 1, img.height), (0, 0, 0, 0))
    out.alpha_composite(img, (0, 0))
    out.alpha_composite(img, (img.width - 1, 0))
    return out


save("servidor-doble", pair(racks[0]))
# En el doble, el segundo rack va un cuadro desfasado para que no parpadeen igual.
doubles = []
for f in range(3):
    d = Image.new("RGBA", (racks[0].width * 2 - 1, racks[0].height), (0, 0, 0, 0))
    d.alpha_composite(racks[f], (0, 0))
    d.alpha_composite(racks[(f + 1) % 3], (racks[0].width - 1, 0))
    doubles.append(d)
save("servidor-doble-anim", strip(doubles))

# ------------------------------------------------------------ aire acondicionado
# De piso (torre): tapa blanca y su filo gris, como la máquina expendedora;
# salida de aire arriba, pantallita con luz y rejilla de entrada abajo.
# 1 y 2 son las dos persianas de la salida; 3 es la luz. Cambian con el cuadro.
AIR = [
    "dddddddddddddd", "dwwwwwwwwwwwwd", "dwwwwwwwwwwwwd", "dwwwwwwwwwwwwd", "esssssssssssse",
    "ewwwwwwwwwwwwe", "ewkkkkkkkkkkwe", "ewk11111111kwe", "ewkkkkkkkkkkwe", "ewk22222222kwe",
    "ewkkkkkkkkkkwe", "ewwwwwwwwwwwwe", "ewwwwwwww3wcwe", "ewwwwwwwwwwwwe", "ewwwwwwwwwwwwe",
    "ewsssssssssswe", "ewwwwwwwwwwwwe", "ewsssssssssswe", "ewwwwwwwwwwwwe", "ewsssssssssswe",
    "ewwwwwwwwwwwwe", "ewsssssssssswe", "ewwwwwwwwwwwwe", "ewwwwwwwwwwwwe", "esssssssssssse",
    "edddddddddddde", "eeeeeeeeeeeeee", "ee..........ee",
]
# De pared (mini split), para colgar: tapa, frente con luz y la persiana abajo.
AIR_WALL = [
    ".dddddddddddddddddd.", "dwwwwwwwwwwwwwwwwwwd", "dwwwwwwwwwwwwwwwwwwd", "esssssssssssssssssse",
    "ewwwwwwwwwwwwwww3wwe", "ewwwwwwwwwwwwwwwwwwe", "ew1111111111111111we", "ekkkkkkkkkkkkkkkkkke",
    ".eeeeeeeeeeeeeeeeee.",
]
# Prendido: la luz parpadea y las persianas se alternan, como si oscilaran.
AIR_FRAMES = [
    {"1": P["d"], "2": P["d"], "3": P["l"]},
    {"1": P["s"], "2": P["d"], "3": P["g"]},
    {"1": P["d"], "2": P["s"], "3": P["l"]},
]
for name, rows in (("aire", AIR), ("aire-pared", AIR_WALL)):
    frames = [mat(rows, tones) for tones in AIR_FRAMES]
    save(name, frames[0])
    save(f"{name}-anim", strip(frames))

# ------------------------------------------------------------------------ pisos
# Losetas de 72 x 24 que se repiten sin costura hacia los cuatro lados. (El
# `floor.png` del pack mide 73 de ancho: 72 más la columna de una junta. Con 73,
# que es primo, no cabe una cuadrícula pareja; por eso estas van a 72.)
FW, FH = 72, 24


def floor(name, color):
    img = Image.new("RGBA", (FW, FH))
    for y in range(FH):
        for x in range(FW):
            img.putpixel((x, y), P[color(x, y)])
    save(name, img)


def planks(fill, light, line):
    """Duela como la del pack: tablas de 8 de alto, filo claro arriba, junta
    oscura abajo, y los cortes de cada fila corridos un tercio."""
    def color(x, y):
        row, inside = divmod(y, 8)
        cut = (row * 24) % FW
        if inside == 7 or x == cut:
            return line
        if inside == 0 or x == (cut + 1) % FW:
            return light
        return fill
    return color


def carpet(base, dark, light, seed):
    """Alfombra: color liso con unas cuantas motas sueltas, sin líneas. Las
    motas se sortean con semilla fija para que el archivo salga siempre igual."""
    import random
    rng = random.Random(seed)
    specks = {}
    for _ in range(FW * FH // 26):
        specks[(rng.randrange(FW), rng.randrange(FH))] = dark if rng.random() < 0.65 else light

    def color(x, y):
        return specks.get((x, y), base)
    return color


def grid(size, fill, line, mark=None):
    """Loseta cuadrada con su junta; `mark` pinta algo dentro de cada loseta."""
    def color(x, y):
        cx, cy = x % size, y % size
        if cx == 0 or cy == 0:
            return line
        return (mark and mark(x // size, y // size, cx, cy)) or fill
    return color


def herringbone(fill, light, line):
    """Parquet en espiga: bloques de 8 con la veta en diagonal, alternada."""
    def color(x, y):
        flip = (x // 8 + y // 8) % 2
        d = (x + y) % 8 if flip else (x - y) % 8
        return line if d == 0 else light if d == 1 else fill
    return color


def vents(tx, ty, cx, cy):
    """Piso técnico: remaches en las esquinas y, en una loseta sí y otra no,
    las perforaciones por donde sube el aire."""
    if (cx, cy) in ((2, 2), (10, 2), (2, 10), (10, 10)):
        return "d"
    if (tx + ty) % 2 == 0 and cx in (5, 7) and cy in (5, 7):
        return "k"
    return None


floor("piso-madera", planks("o", "y", "r"))
floor("piso-espiga", herringbone("o", "y", "r"))
floor("piso-alfombra-azul", carpet("b", "n", "c", 1))
floor("piso-alfombra-roja", carpet("r", "p", "o", 2))
floor("piso-loseta", grid(12, "w", "s"))
floor("piso-concreto", carpet("s", "d", "w", 3))
floor("piso-tecnico", grid(12, "e", "k", vents))


# ----------------------------------------------------------------------- paredes
# Tramos de 26 x 20, como el `wall.png` del pack, que se repiten a los lados sin
# costura. Lo que tiene ritmo (ladrillos, tablas, vidrios, paneles) va en
# módulos de 13 para que cierre justo en los 26.
WW, WH = 26, 20


def wall(name, color):
    img = Image.new("RGBA", (WW, WH))
    for y in range(WH):
        for x in range(WW):
            img.putpixel((x, y), P[color(x, y)])
    save(name, img)


def plain(base, line):
    """Lisa, con las dos líneas que trae la pared del pack."""
    return lambda x, y: line if y in (9, 19) else base


def brick(x, y):
    row, inside = divmod(y, 4)
    joint = 0 if row % 2 == 0 else 6  # hiladas trabadas
    if inside == 3 or x % 13 == joint:
        return "r"
    return "y" if inside == 0 else "o"


def wainscot(x, y):
    """Pared clara arriba y lambrín de madera abajo, con su moldura."""
    if y < 9:
        return "w"
    if y == 9:
        return "s"
    if y == 10:
        return "y"
    if y == 19 or x % 13 == 0:
        return "r"
    return "o"


def glass(x, y):
    """Cancel de oficina: riel arriba, vidrios con reflejo y zoclo de aluminio."""
    if y < 2:
        return "e" if y == 0 else "d"
    if y >= 17:
        return "sde"[y - 17]
    if x % 13 == 0:
        return "d"
    return "a" if (x % 13 + y) in (9, 10, 15) else "c"


def glass_door(x, y):
    """La puerta del cancel: dos hojas de vidrio hasta el piso, con jaladeras."""
    if y < 2:
        return "e" if y == 0 else "d"
    if y == 19 or x in (0, 12, 13, 25):
        return "e"
    if x in (10, 15) and 9 <= y <= 12:
        return "w"
    return "a" if (x % 13 + y) in (9, 10, 15) else "c"


def technical(x, y):
    """Paneles metálicos oscuros con remaches, rejillas y una luz de estado."""
    cx = x % 13
    if cx == 0 or y in (9, 19):
        return "k"
    if (cx, y) in ((2, 1), (11, 1), (2, 11), (11, 11)):
        return "d"
    if y in (13, 15, 17) and 3 <= cx <= 10:
        return "k"
    if (x, y) == (20, 4):
        return "l"
    return "e"


def wood(x, y):
    """Tablas de madera de arriba abajo."""
    if y == 19 or x % 13 in (0, 7):
        return "r"
    return "y" if y == 0 else "o"


wall("pared-crema", plain("y", "o"))
wall("pared-celeste", plain("a", "c"))
wall("pared-gris", plain("s", "d"))
wall("pared-ladrillo", brick)
wall("pared-lambrin", wainscot)
wall("pared-madera", wood)
wall("pared-vidrio", glass)
wall("pared-vidrio-puerta", glass_door)
wall("pared-tecnica", technical)

# ----------------------------------------------------------------- paredes bajas
# Las divisiones de adentro van bajas, para que se vea lo que hay detrás. Mismo
# ancho y misma repetición que la alta. Arriba llevan su tapa, que a 45 grados
# se ve desde arriba: cuatro filas iguales en todos los materiales (borde, dos
# de cara clara y filo), para que dos paredes distintas empaten al encontrarse.
# Debajo, cinco filas de frente con el dibujo de su pared alta: a quien está
# parado justo detrás (pisa una tapa más arriba) le tapa solo las piernas. Los
# personajes del pack son casi pura cabeza (13 de 23 filas), así que con más
# frente ya solo asomaba la cabeza.
CAP, LOW_FACE = 4, 5
LOW_H = CAP + LOW_FACE


def low_wall(name, cap, line, face):
    """`cap` y `line` son la cara de arriba y su borde; `face(x, y)` pinta el
    frente, con `y` contando desde debajo de la tapa. Deja también el remate de
    extremo: dos columnas con el canto del muro, para donde la división termina."""
    def color(x, y):
        if y < CAP:
            return line if y in (0, CAP - 1) else cap
        return face(x, y - CAP)

    img = Image.new("RGBA", (WW, LOW_H))
    for y in range(LOW_H):
        for x in range(WW):
            img.putpixel((x, y), P[color(x, y)])
    save(f"pared-{name}-baja", img)
    end = Image.new("RGBA", (2, LOW_H))
    for y in range(LOW_H):
        end.putpixel((0, y), P[color(1, y)])
        end.putpixel((1, y), P[line])
    save(f"pared-{name}-baja-fin", end)


def low_plain(base, line):
    return lambda x, y: line if y == LOW_FACE - 1 else base


def low_tech(x, y):
    cx = x % 13
    if cx == 0 or y == LOW_FACE - 1:
        return "k"
    if (cx, y) in ((2, 1), (11, 1)):
        return "d"
    if y == 2 and 4 <= cx <= 9:
        return "k"
    return "e"


low_wall("crema", "w", "o", low_plain("y", "o"))
low_wall("celeste", "w", "c", low_plain("a", "c"))
low_wall("gris", "w", "d", low_plain("s", "d"))
low_wall("ladrillo", "y", "r", lambda x, y: "r" if y == LOW_FACE - 1 else brick(x, y))  # una hilada
low_wall("madera", "y", "r", lambda x, y: "r" if y == LOW_FACE - 1 or x % 13 in (0, 7) else "o")
low_wall("lambrin", "y", "r", lambda x, y: "r" if y == LOW_FACE - 1 or x % 13 == 0 else "o")  # solo el lambrín
low_wall("tecnica", "d", "k", low_tech)

# --------------------------------------------------------------- billar y futbolito
def canvas(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def box(img, x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            img.putpixel((x, y), P[color])


def dots(img, color, *points):
    for x, y in points:
        img.putpixel((x, y), P[color])


# Billar, a 45 grados: lo que más se ve es el paño. Borde y sombra en los tonos
# de la madera, como las mesas del pack (sin contorno oscuro).
billar = canvas(48, 30)
box(billar, 1, 0, 46, 0, "r")
box(billar, 0, 1, 47, 19, "r")
box(billar, 1, 1, 46, 18, "o")  # banda
box(billar, 3, 3, 44, 16, "g")  # paño
box(billar, 3, 3, 44, 3, "t")  # sombra de la banda sobre el paño
box(billar, 3, 3, 3, 16, "t")
for px_, py_ in ((2, 2), (44, 2), (2, 16), (44, 16), (23, 2), (23, 16)):  # buchacas
    box(billar, px_, py_, px_ + 1, py_ + 1, "k")
dots(billar, "y", (34, 8), (36, 10), (38, 8))  # el triángulo de bolas
dots(billar, "r", (36, 8), (34, 10), (38, 12))
dots(billar, "b", (38, 10), (36, 12))
dots(billar, "p", (34, 12), (36, 6))
dots(billar, "w", (12, 10))  # la blanca
for i in range(9):  # taco, recargado en diagonal
    dots(billar, "y" if i < 7 else "p", (8 + i * 2, 14 - i))
    dots(billar, "o" if i < 7 else "p", (9 + i * 2, 14 - i))
box(billar, 0, 20, 47, 24, "p")  # frente
box(billar, 1, 20, 46, 23, "r")
box(billar, 1, 20, 46, 20, "p")  # sombra bajo la banda
for x0 in (2, 42):  # patas
    box(billar, x0, 25, x0 + 3, 28, "p")
    box(billar, x0 + 1, 25, x0 + 2, 27, "r")
save("billar", billar)


# Futbolito, a 45 grados: la cancha arriba, cuatro barras con sus muñecos y los
# mangos saliendo a los lados.
def futbolito(slide):
    img = canvas(30, 36)
    box(img, 5, 0, 24, 25, "p")
    box(img, 6, 1, 23, 24, "r")  # borde de madera
    box(img, 7, 2, 22, 23, "g")  # cancha
    box(img, 7, 2, 22, 2, "t")
    box(img, 7, 12, 22, 12, "w")  # media cancha
    box(img, 13, 1, 16, 1, "s")  # porterías
    box(img, 13, 24, 16, 24, "s")
    for i, y in enumerate((5, 9, 16, 20)):
        dx = slide if i % 2 == 0 else -slide  # las barras de cada equipo se corren al revés
        box(img, 2 + dx, y, 27 + dx, y, "s")  # barra
        for hx in (1 + dx, 27 + dx):  # mangos
            box(img, hx, y - 1, hx + 1, y + 1, "k")
        team = "o" if i % 2 == 0 else "c"
        for mx in (9, 14, 19):  # muñecos
            box(img, mx + dx, y - 1, mx + dx + 1, y + 1, team)
            dots(img, "k", (mx + dx, y), (mx + dx + 1, y))
    box(img, 5, 26, 24, 31, "p")  # frente
    box(img, 6, 26, 23, 30, "r")
    box(img, 13, 28, 16, 28, "k")  # por donde sale la pelota
    for x0 in (6, 21):  # patas
        box(img, x0, 32, x0 + 2, 35, "p")
    return img


save("futbolito", futbolito(0))
save("futbolito-anim", strip([futbolito(0), futbolito(1)]))

# ---------------------------------------------------------- bandera y librero
save("banderamexico", mat([
    "eeeeeeeeeeee", "egggwwwwrrre", "egggwwwwrrre", "egggwoowrrre", "egggwotwrrre",
    "egggwggwrrre", "egggwwwwrrre", "egggwwwwrrre", "eeeeeeeeeeee",
]))


def shelf(rows):
    return ["edek" + r + "kede" for r in rows]


BOARD = ["eded" + "s" * 16 + "dede", "ed" + "e" * 20 + "de"]
librero2 = save("librero2", mat(
    ["e" * 24] + ["e" + "s" * 22 + "e"] * 4 + ["e" + "w" * 22 + "e"] + ["e" + "d" * 22 + "e"] * 2
    + ["ed" + "e" * 20 + "de", "edek" + "k" * 16 + "kede"]
    + shelf(["rrkbbkyykkkkggkk", "oodccdwwkkglglkk", "rrdbbdyykkkoookk", "rrdbbdyykkkoookk"])  # carpetas y planta
    + BOARD + ["edek" + "k" * 16 + "kede"]
    + shelf(["kyyyykkoooookggk", "kywwykkowwwokglk", "kyyyykkoooookggk", "kyyyykkoooookggk"])  # cajas
    + BOARD
    + shelf(["ggkcckrrkyykkbbk", "llbaaroodwwkkcck", "ggbccryydsskkbbk", "ggbccryydsskkbbk"])  # libros
    + ["eded" + "s" * 16 + "dede", "e" + "d" * 22 + "e", "e" * 24]
))


def shelf_back(name, front, seam):
    """La tapa se ve igual (vista a 45 grados). Abajo va la espalda del mueble:
    una tabla lisa del color del marco, con sombra bajo la tapa y al pie."""
    img = front.copy()
    q = img.load()
    w, h = img.size
    frame = q[1, 7]
    for y in range(8, h - 1):
        for x in range(1, w - 1):
            q[x, y] = P[seam] if y in (8, h - 2) else frame
    save(name, img)


shelf_back("librero-alv-atras", load("librero-alv"), "p")
shelf_back("librero2-atras", librero2, "e")

# ------------------------------------------------------------ sillas de frente
# La del pack está de perfil. De frente, a 45 grados, se le ve el canto de
# arriba del respaldo y la superficie del asiento (L, el tono claro), luego las
# caras de frente (A) y su sombra (B).
CHAIR = [
    "eeeeeeeeeee", "eLLLLLLLLLe", "eAAAAAAAAAe", "eAAAAAAAAAe", "eAAAAAAAAAe", "eAAAAAAAAAe", "eAAAAAAAAAe",
    "eBBBBBBBBBe", "eeeeeeeeeee", "eLLLLLLLLLe", "eLLLLLLLLLe", "eLLLLLLLLLe", "eLLLLLLLLLe", "eeeeeeeeeee",
    "eAAAAAAAAAe", "eBBBBBBBBBe", "eeeeeeeeeee", "ede.....ede", "ede.....ede", "ede.....ede", "ede.....ede",
    "eee.....eee",
]
LIGHTER = {"o": "y", "y": "w", "l": "w", "g": "l", "c": "a", "b": "c", "w": "w", "s": "w", "r": "o"}
for i in range(1, 7):
    side = load(f"silla{i}")
    main, shade = side.getpixel((1, 1)), side.getpixel((1, 9))
    light = P[LIGHTER.get(LETTER.get(main, "w"), "w")]
    if light == main:
        # La blanca: su claro y su base son el mismo blanco. El frente va en
        # gris para que la tapa se distinga.
        main, shade = shade, P["d"] if LETTER.get(shade) == "s" else shade
    save(f"silla{i}-frente", mat(CHAIR, {"A": main, "B": shade, "L": light}))

# --------------------------------------------------- sofás de lado y por detrás
# El sofá del pack no lleva contorno oscuro: usa tres tonos propios, M el
# principal, L el claro (lo que se ve desde arriba) y D el de borde y sombra;
# F es la sombra en el piso.
#
# De lado (mirando a la derecha), a 45 grados, lo más alto se dibuja más arriba.
# El sofá tiene tres alturas y deben leerse las tres:
#   respaldo, lo más alto: su cara de arriba sube por encima de todo, a la
#     izquierda, y donde termina se le ve el canto bajando hasta el brazo;
#   brazos, a media altura: el del fondo asoma arriba con su cara de arriba y su
#     frente; el de adelante cruza todo el ancho, con cara de arriba y frente;
#   asiento, lo más bajo: los dos cojines, entre los brazos.
# Cuántas filas sube el respaldo por encima del brazo del fondo. Con 3 el
# usuario lo vio alto; pidió bajarlo 2 px: queda en 1.
BACKREST_UP = 1


def couch_side(up=BACKREST_UP):
    """El sofá de lado con el respaldo `up` filas arriba del brazo. Arriba se
    rellena con filas vacías para que la pieza mida siempre 16 x 32."""
    return (["................"] * (3 - up) + ["MMMMMMM........."] + ["MLLLMMD........."] * (up - 1)
            + COUCH_SIDE_BODY)


# El respaldo es la franja de la izquierda: su cara de arriba (L) y, a su
# derecha, la cara interior (M) que baja hacia el asiento.
COUCH_SIDE_BODY = [
    "MLLLMMDMMMMMMMMM",  # empieza el brazo del fondo
    "MLLLMMDLLLLLLLLM",
    "MLLLMMDLLLLLLLLM",
    "MLLLMMDLLLLLLLLM",
    "MLLLMMDMMMMMMMMD",  # frente del brazo del fondo
    "MLLLMMDMMMMMMMMD",
    "MLLLMMDDDDDDDDDD",
    "MLLLMMDLLLLLLLLD",  # primer cojín: filo claro y cuerpo
    "MLLLMMDMMMMMMMMD",
    "MLLLMMDMMMMMMMMD",
    "MLLLMMDMMMMMMMMD",
    "DDDDMMDMMMMMMMMD",  # aquí acaba la cara de arriba del respaldo...
    "DMMMMMDDDDDDDDDD",  # ...y baja su canto
    "DMMMMMDLLLLLLLLD",  # segundo cojín
    "DMDMMMDMMMMMMMMD",
    "DMMMMMDMMMMMMMMD",
    "DMMMMMDMMMMMMMMD",
    "DMMMMMDMMMMMMMMD",
    "MMMMMMMMMMMMMMMM",  # brazo de adelante: cara de arriba
    "MLLLLLLLLLLLLLLM",
    "MLLLLLLLLLLLLLLM",
    "MLLLLLLLLLLLLLLM",
    "DMMMMMMMMMMMMMMD",  # y su frente
    "DMMMMMMMMMMMDMMD",
    "DMMMMMMMMMMMMMMD",
    "DMMMMMMMMMMMMMMD",
    "DMMMMMMMMMMMMMMD",
    ".DDDDDDDDDDDDDD.",
    "..FFFFFFFFFFFF..",
]
for i in range(1, 5):
    front = load(f"coach{i}")
    h = front.height
    # Los tonos se leen del brazo izquierdo, que está igual en los cuatro (el
    # gris mide una fila menos y no trae la fila de borde de arriba).
    tones = {"M": front.getpixel((1, h - 4)), "L": front.getpixel((1, h - 9)), "D": front.getpixel((0, h - 4)),
             "F": front.getpixel((12, h - 1))}
    save(f"coach{i}-lado", mat(couch_side(), tones))
    # Por detrás: los brazos y la base del de frente, y el respaldo liso con su
    # filo claro arriba y la costura al centro.
    back = front.copy()
    q = back.load()
    top = h - 15  # fila del filo claro del respaldo
    for y in range(top + 1, h - 3):
        for x in range(4, 29):
            q[x, y] = tones["M"]
        q[3, y] = q[29, y] = q[16, y] = tones["D"]
    for x in range(4, 29):
        q[x, top] = tones["L"]
    q[16, top] = tones["M"]
    save(f"coach{i}-atras", back)


# ------------------------------------------------------- personajes de espaldas
def back_view(name, hair, head_end, logos=(), logo_x=(0, 0), neck=(), face=None, lower=None):
    """El sprite del pack, visto por detrás.

    Cabeza (filas antes de `head_end`): todo lo que no sea pelo pasa a pelo;
    dentro de `face` también lo que tenía el tono de sombra del pelo (cejas).
    Torso: el dibujo de la playera (`logos`) pasa al color liso de la playera.
    `neck`: tramos que tapa el pelo largo.
    `lower`: (desde, hasta, color) para lo que queda bajo una gorra.
    """
    src = load(name)
    px = src.load()
    w, h = src.size
    out = src.copy()
    q = out.load()
    family = {P[c] for c in hair}
    main = P[hair[0]]

    def on_edge(x, y):
        return any(not (0 <= nx < w and 0 <= ny < h) or not px[nx, ny][3]
                   for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    for y in range(head_end):
        for x in range(w):
            c = px[x, y]
            if not c[3]:
                continue
            in_face = face and face[0] <= x <= face[2] and face[1] <= y <= face[3]
            if c in family and not in_face:
                continue
            if c == P["k"] and on_edge(x, y):
                continue
            q[x, y] = main
    for rows, colors, to in logos:
        for y in rows:
            for x in range(logo_x[0], logo_x[1] + 1):
                if px[x, y][3] and px[x, y] in {P[c] for c in colors}:
                    q[x, y] = P[to]
    for y, x0, x1 in neck:
        for x in range(x0, x1 + 1):
            if px[x, y][3] and px[x, y] != P["k"]:
                q[x, y] = main
    if lower:  # bajo una gorra: de ahí a la nuca es pelo, de otro color
        y0, y1, color = lower
        for y in range(y0, y1):
            for x in range(w):
                c = px[x, y]
                if c[3] and not (c == P["k"] and on_edge(x, y)):
                    q[x, y] = P[color]
    save(f"{name}-atras", out)


back_view("char1", ("e", "d"), 13, logos=[(range(13, 18), "w", "s")], logo_x=(5, 9))
back_view("char2", ("r", "p"), 14, logos=[(range(14, 19), "og", "w")], logo_x=(6, 9), face=(4, 7, 13, 13))
back_view("char3", ("s", "d"), 11, logos=[(range(11, 16), "r", "w")], logo_x=(5, 8))
back_view("char4", ("r", "p"), 12, neck=[(12, 8, 11)], face=(4, 6, 15, 11))
back_view("char5", ("e", "d"), 12, neck=[(12, 8, 11)], face=(4, 6, 15, 11))

# ---------------------------------------------------------- personajes nuevos
# De pie y sentados. Sentado es el mismo dibujo hasta la cintura y, como en el
# pack, los muslos al frente y una pierna que baja con su zapato (un renglón
# más alto que de pie).
NEW = {
    "char6": {  # afro morado, piel morena, playera azul
        "stand": [
            "....kkkkkkkkk....", "..kkpppppppppkk..", ".kpprpppppppprpk.", "kpppppppppppppppk", "kpprppppppppppppk",
            "kpppppppppppprppk", "kpppppppppppppppk", "kppppprkrrrkrppk.", "kpporpokoookoppk.", ".kpooooooooooopk.",
            "..krooorrooorpk..", "...kkrooooookk...", "....kkkrrrrkk....", "...kkbbcccck.....", "...kbccwwwwok....",
            "...kccbccccok....", "...kborccccbk....", "....kroccbcbk....", "....kkkkkkkk.....", "....kek..kek.....",
            "....kok..kok.....", "...kwwk..kwwk....", "...kkkk..kkkk....",
        ],
        "legs": [".....keeeeeek....", "......kkkkkek....", "..........kokk...", "..........kwww...", "...........kkk..."],
    },
    "char7": {  # calvo con barba, playera verde
        "stand": [
            ".................", ".....kkkkkkkk....", "...kkyyyyyyyykk..", "..kyywyyyyyyyyyk.", "..kyyyyyyyyyyyyk.",
            "..kyyyyyyyyyyyyk.", "..kyyykkyyykkyyk.", ".kyoyykyyyykyyok.", ".kyyyykyyyykyyyk.", "..keeyyyyyyyyeek.",
            "..keeeeorroeeeek.", "...keeeeeeeeeek..", "....kkeeeeeekk...", "...kkttggggk.....", "...ktggggggyk....",
            "...kggtggggyk....", "...ktyoggggtk....", "....koyggtgtk....", "....kkkkkkkk.....", "....kdk..kdk.....",
            "....kdk..kdk.....", "...keek..keek....", "...kkkk..kkkk....",
        ],
        "legs": [".....kddddddk....", "......kkkkkdk....", "..........kdkk...", "..........keee...", "...........kkk..."],
    },
    "char8": {  # gorra azul con visera, sudadera naranja
        "stand": [
            "....kkkkkkkkk....", "..kkbbbbbbbbbkk..", ".kbbbcbbbbbbbbbk.", ".kbbbbbbbbbbbbbk.", ".kbbbbbbbbbbbbbk.",
            "kcccccccccccccck.", "kkkkkkkkkkkkkkkk.", ".keyyykyyykyyyek.", ".keyoykyyykyoyek.", ".kyyyyyyyyyyyyyk.",
            "..koyyyooyyyyok..", "...kkoyyyyyokk...", "....kkkooookk....", "...kkrrooook.....", "...kroowoowoyk...",
            "...kooroooooyk...", "...kryoooooork...", "....koyoooorok...", "....kkkkkkkkk....", "....knk...knk....",
            "....knk...knk....", "...kwwk...kwwk...", "...kkkk...kkkk...",
        ],
        "legs": [".....knnnnnnnk...", "......kkkkkknk...", "...........knkk..", "...........kwww..", "............kkk.."],
    },
}
for name, c in NEW.items():
    save(name, mat(c["stand"]))
    save(f"{name}-sentado", mat(c["stand"][:19] + c["legs"]))

# Y de espaldas, igual que los del pack. Al calvo se le va la barba: por detrás
# es pura cabeza. Al de gorra le queda la gorra arriba y el pelo asomando abajo.
back_view("char6", ("p",), 13, logos=[(range(13, 18), "w", "c")], logo_x=(5, 11))
back_view("char7", ("y",), 13)
back_view("char8", ("b",), 7, logos=[(range(13, 18), "w", "o")], logo_x=(5, 11), lower=(7, 13, "e"))

# ------------------------------------------------------- computadoras de frente
# Las del pack están de lado. Estas son para puestos de frente y de espaldas:
#   computadora-frente: se le ve la pantalla, con el teclado delante (para quien
#                       se sienta de espaldas a nosotros)
#   computadora-atras:  la espalda del monitor y su pie; el teclado queda detrás
#                       y no se ve (para quien se sienta mirándonos)
# Las dos con su cara de arriba (fila clara). Pantalla clara, como la del pack.
def computer_front(lines):
    """`lines`: largo de cada renglón de texto en pantalla (va cambiando al animar)."""
    rows = ["..ddddddddddd..", ".dwwwwwwwwwwwd.", ".dsssssssssssd.", ".dswwwwwwwwwsd."]
    for n in lines:
        rows.append(".dsw" + "c" * n + "w" * (8 - n) + "sd.")
        rows.append(".dswwwwwwwwwsd.")
    rows += [
        ".dsssssssssssd.",
        ".eeeeeeeeeeeee.",
        ".....dsssd.....",
        "...dsssssssd...",
        "...eeeeeeeee...",
        "...............",
        ".ddddddddddddd.",
        ".dwswswswswswd.",
        ".dswswswswswsd.",
        ".eeeeeeeeeeeee.",
    ]
    return mat(rows)


COMPUTER_BACK = [
    "..ddddddddddd..",
    ".dwwwwwwwwwwwd.",
    ".dsssssssssssd.",
    ".dsssssssssssd.",
    ".dsssdddddsssd.",
    ".dsssssssssssd.",
    ".dsssdddddsssd.",
    ".dsssssssssssd.",
    ".dsssssssssssd.",
    ".dsssssssssssd.",
    ".eeeeeeeeeeeee.",
    ".....dsssd.....",
    "...dsssssssd...",
    "...eeeeeeeee...",
]
save("computadora-frente", computer_front((3, 6, 4)))
save("computadora-frente-anim", strip([computer_front(l) for l in ((3, 6, 4), (5, 2, 7), (6, 4, 1))]))
save("computadora-atras", mat(COMPUTER_BACK))

# --------------------------------------------------------------------- golfito
# Tapete de práctica para la oficina del jefe, visto de frente: corre hacia el
# fondo, así que en pantalla va hacia arriba. Al fondo, la rampa levantada con
# el hoyo y su banderín; por ser más alta enseña su frente, que baja al pasto.
# El putter descansa en el piso, a la derecha.
# `ball`: fila de la pelota; None cuando ya cayó al hoyo.
def golf(ball):
    img = Image.new("RGBA", (16, 36), (0, 0, 0, 0))

    def rect(x0, y0, x1, y1, color):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                img.putpixel((x, y), P[color])

    rect(0, 14, 11, 34, "t")    # tapete: contorno y canto de adelante
    rect(1, 15, 10, 32, "g")    # pasto
    for y in range(18, 31, 6):  # franjas del corte
        rect(1, y, 10, y + 2, "l")
    rect(0, 5, 11, 15, "t")     # rampa: contorno
    rect(1, 6, 10, 11, "l")     # su cara de arriba
    rect(1, 12, 10, 14, "g")    # su frente
    rect(5, 8, 6, 9, "k")       # hoyo
    rect(6, 0, 6, 8, "w")       # asta
    rect(7, 0, 11, 4, "k")      # banderín, con contorno para que no se pierda
    rect(7, 1, 10, 3, "y")      # sobre cualquier piso
    if ball is None:
        img.putpixel((5, 9), P["w"])  # la pelota asoma dentro del hoyo
    else:
        rect(5, ball, 6, ball + 1, "w")
        rect(5, ball + 2, 6, ball + 2, "t")
    rect(14, 10, 14, 15, "k")   # putter: empuñadura
    rect(14, 16, 14, 31, "s")   # vara
    rect(13, 32, 15, 33, "d")   # cabeza
    return img


save("golfito", golf(28))
save("golfito-anim", strip([golf(28), golf(23), golf(17), golf(None)]))

# --------------------------------------------------------------------- laptops
#   laptop-frente: pantalla a la vista y, delante, la base con teclas y panel
#   laptop-atras:  la tapa por fuera, con su filo de arriba; la base queda detrás
#   laptop-lado:   mirando a la derecha: la base vista desde arriba y la tapa
#                  parada de canto, con el brillo de la pantalla hacia la base
def laptop_front(lines):
    rows = [".ddddddddd.", ".dwwwwwwwd."]
    for n in lines:
        rows.append(".dw" + "c" * n + "w" * (6 - n) + "d.")
        rows.append(".dwwwwwwwd.")
    rows += [".ddddddddd.", "dsssssssssd", "dswswswswsd", "dssswwwsssd", "eeeeeeeeeee"]
    return mat(rows)


LAPTOP_BACK = [
    ".ddddddddd.",
    ".dwwwwwwwd.",
    ".dsssssssd.",
    ".dssswsssd.",
    ".dsssssssd.",
    ".dsssssssd.",
    ".eeeeeeeee.",
]
LAPTOP_SIDE = [
    "......ddd",
    "......dwd",
    "......dcd",
    "......dcd",
    "dddddddsd",
    "dswswsdsd",
    "dwswswdsd",
    "dswswsdsd",
    "dssssseed",
    "eeeeeeeee",
]
save("laptop-frente", laptop_front((2, 5)))
save("laptop-frente-anim", strip([laptop_front(l) for l in ((2, 5), (4, 1), (5, 3))]))
save("laptop-atras", mat(LAPTOP_BACK))
save("laptop-lado", mat(LAPTOP_SIDE))

# ------------------------------------------------------------- impresora grande
# Multifuncional de piso. De arriba abajo: alimentador de hojas, tapa del
# escáner (su cara de arriba, en claro), panel con pantallita y luz, bandeja de
# salida y tres cajones de papel.
# `sheet`: 0 sin hoja, 1 asoma, 2 a medio salir, 3 ya descansa en la bandeja.
# `on`: la luz y la pantallita encendidas (parpadean al imprimir).
def printer(sheet=3, on=False):
    led, screen = ("l", "kaaak") if on else ("g", "kcack")
    tray = {
        0: ["esekkkkkkkkkkkkese", "esekkkkkkkkkkkkese", "eseeeeeeeeeeeeeese"],
        1: ["esekkwwwwwwwwkkese", "esekkkkkkkkkkkkese", "eseeeeeeeeeeeeeese"],
        2: ["esekkwwwwwwwwkkese", "esekkwwwwwwwwkkese", "eseeeeeeeeeeeeeese"],
        3: ["esekkkkkkkkkkkkese", "esekkwwwwwwwwkkese", "eseeewwwwwwwweeese"],
    }[sheet]
    drawer = ["esssssssssssssssse", "esssssddddddssssse", "e" + "d" * 16 + "e"]
    return mat([
        "..dddddddddddd....",
        "..dwwwwwwwwwwd....",
        "..dwsssssssswd....",
        "..dwwwwwwwwwwd....",
        "..dssssssssssd....",
        "dddddddddddddddddd",
        "dwwwwwwwwwwwwwwwwd",
        "dwwwwwwwwwwwwwwwwd",
        "dwwwwwwwwwwwwwwwwd",
        "dssssssssssssssssd",
        "esssssssssssssssse",
        "es" + screen + "ssss" + led + "sdsdse",
        "esssssssssssssssse",
        "eseeeeeeeeeeeeeese",
    ] + tray + ["esssssssssssssssse", "e" + "d" * 16 + "e"] + drawer * 2 + drawer[:2] + ["e" * 18])


# De lado, mirando a la derecha: el ancho de la máquina corre hacia el fondo,
# así que la tapa se ve más larga. El frente queda a la derecha: ahí asoman el
# brillo de la pantallita, la hoja en la bandeja y los jaladores de los cajones.
PRINTER_SIDE = [
    ".ddddddddd....",
    ".dwwwwwwwd....",
    ".dwsssswwd....",
    ".dwsssswwd....",
    ".dwwwwwwwd....",
    ".dsssssssd....",
    "dddddddddddddd",
    "dwwwwwwwwwwwwd",
    "dwwwwwwwwwwwwd",
    "dwwwwwwwwwwwwd",
    "dwwwwwwwwwwwwd",
    "dwwwwwwwwwwwwd",
    "dssssssssssssd",
    "esssssssssssse",
    "esssssssssssce",
    "esssssssssssce",
    "esssssssssssse",
    "essssssssseeee",
    "esssssssssewww",
    "essssssssseeee",
    "esssssssssssse",
    "esddddsssssdde",
    "esssssssssssse",
    "esddddsssssdde",
    "esssssssssssse",
    "esddddsssssdde",
    "esssssssssssse",
    "esssssssssssse",
    "eeeeeeeeeeeeee",
]
save("impresora-grande", printer())
save("impresora-grande-anim", strip([printer(0, True), printer(1, False), printer(2, True), printer(3, False)]))
save("impresora-grande-lado", mat(PRINTER_SIDE))

# ---------------------------------------------------------- personajes de lado
# El pack no trae personajes de perfil. Mirando a la derecha: el pelo cubre la
# mitad izquierda de la cara y queda un solo ojo, del lado hacia donde mira. El
# cuerpo es el mismo. La izquierda sale con espejo.
# Por personaje: filas de la cara, color con que se cubre y tonos que ya son pelo.
SIDE = {
    1: ((7, 12), "e", "ed"), 2: ((7, 13), "r", "rp"), 3: ((4, 10), "s", "sd"), 4: ((6, 11), "r", "rp"),
    5: ((6, 11), "e", "ed"), 6: ((7, 12), "p", "p"), 7: ((6, 9), "y", "y"), 8: ((7, 12), "e", "e"),
}


def side_view(i):
    src = load(f"char{i}")
    px = src.load()
    w, h = src.size
    (y0, y1), fill, family = SIDE[i]
    family = {P[c] for c in family}
    out = src.copy()
    q = out.load()

    def on_edge(x, y):
        return any(not (0 <= nx < w and 0 <= ny < h) or not px[nx, ny][3]
                   for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    face = [(x, y) for y in range(y0, y1 + 1) for x in range(w)
            if px[x, y][3] and px[x, y] not in family and not (px[x, y] == P["k"] and on_edge(x, y))]
    xs = [x for x, _ in face]
    cut = min(xs) + (max(xs) - min(xs) + 1) / 2
    for x, y in face:
        if x < cut:
            q[x, y] = P[fill]
    return save(f"char{i}-lado", out)


for i in range(1, 9):
    side_view(i)

# Retoques a mano de dos perfiles.
# El de lentes: la patita va del lente a la oreja, por encima del pelo.
img = load("char3-lado")
for x in range(3, 7):
    img.putpixel((x, 5), P["k"])
img.save(SPRITES / "char3-lado.png")
# El calvo de barba: la boca se va a la derecha, bajo el ojo que queda (en medio
# se veía de frente), y la barba sigue cubriendo la quijada de atrás.
img = load("char7-lado")
for x, c in zip(range(3, 14), "eeeeeeeorro"):
    img.putpixel((x, 10), P[c])
for x in range(3, 7):
    img.putpixel((x, 9), P["e"])
img.save(SPRITES / "char7-lado.png")

# El de pelo gris lo trae corto: llega a las orejas. Al cubrirle la cara para
# voltearlo, el gris bajaba hasta el cuello y se juntaba con la sombra gris de
# la playera: parecía melena hasta la espalda. De la fila 7 a la 10 va la nuca,
# en piel, con la última fila en sombra.
for view in ("atras", "lado"):
    front, img = load("char3"), load("char3-" + view)
    for y in range(7, 11):
        for x in range(img.width):
            if img.getpixel((x, y)) == P["s"] and front.getpixel((x, y)) != P["s"]:
                img.putpixel((x, y), P["o" if y == 10 else "y"])
    img.save(SPRITES / f"char3-{view}.png")

# ------------------------------------------------- personajes animados
# Hojas de cuadros en fila, del mismo tamaño que el sprite quieto para que no
# brinque al cambiar. Salen del propio sprite, moviendo sus partes un píxel:
#
#   <char>-idle.png             4 cuadros: quieto, quieto, respira, parpadea
#   <char>-camina.png           4 cuadros: pie izquierdo arriba, apoyo, derecho, apoyo
#   <char>-atras-camina.png     lo mismo visto de espaldas
#   <char>-lado-camina.png      4 cuadros de perfil: piernas abiertas, juntas, abiertas, juntas
#   <char>-sentado-teclea.png   2 cuadros: quieto y el cuerpo un píxel abajo
#   <char>-sentado-frente.png, <char>-sentado-atras.png y sus -teclea: sentado
#                               visto de frente y por detrás
def leg_rows(img):
    """Las filas de las piernas y las columnas de cada una. Se sube desde los
    pies mientras haya hueco entre las dos; `None` si no hay dos piernas."""
    w, h = img.size
    px = img.load()
    runs, start = [], None
    for x in range(w + 1):
        on = x < w and px[x, h - 1][3]
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x - 1))
            start = None
    if len(runs) != 2:
        return None
    gap = range(runs[0][1] + 1, runs[1][0])
    top = h - 1
    while top > 0 and not any(px[x, top - 1][3] for x in gap):
        top -= 1
    split = (runs[0][1] + runs[1][0]) // 2
    return top, (0, split), (split + 1, w - 1)


def lift(img, top, cols):
    """Levanta un pie: esa pierna sube un píxel y deja libre la fila de abajo."""
    out = img.copy()
    box = (cols[0], top, cols[1] + 1, img.height)
    part = img.crop(box)
    out.paste((0, 0, 0, 0), box)
    out.alpha_composite(part.crop((0, 1, part.width, part.height)), (cols[0], top))
    return out


def stride(img, top, left, right):
    """Zancada de perfil: una pierna se va un píxel atrás y la otra adelante."""
    out = img.copy()
    out.paste((0, 0, 0, 0), (0, top, img.width, img.height))
    for cols, dx in ((left, -1), (right, 1)):
        part = img.crop((cols[0], top, cols[1] + 1, img.height))
        out.alpha_composite(part, (max(0, cols[0] + dx), top))
    return out


def squash(img, until):
    """Baja un píxel todo lo de arriba de `until` (cabeza y torso): el rebote."""
    out = img.copy()
    upper = img.crop((0, 0, img.width, until))
    out.paste((0, 0, 0, 0), (0, 0, img.width, until))
    out.alpha_composite(upper, (0, 1))
    return out


def blink(img):
    """Cierra los ojos a medias. Un ojo es un par de píxeles de contorno, uno
    sobre otro, con cara a los dos lados; se le quita el de arriba."""
    out = img.copy()
    px, q = img.load(), out.load()
    w, h = img.size
    k = P["k"]

    def skin(x, y):
        return 0 <= x < w and px[x, y][3] and px[x, y] != k

    found = False
    for y in range(h // 2 + 2):
        for x in range(1, w - 1):
            pair = px[x, y] == k and px[x, y + 1] == k and px[x, y - 1] != k
            if pair and skin(x - 1, y) and skin(x + 1, y) and skin(x - 1, y + 1) and skin(x + 1, y + 1):
                q[x, y] = px[x - 1, y]
                found = True
    if found:
        return out
    # Ojos de color (dos por dos: iris arriba, brillo abajo): el párpado baja
    # sobre la fila de arriba y la de abajo queda como la línea del ojo cerrado.
    eye = {P[c] for c in "wcbstga"}
    for y in range(h // 4, h // 2):
        for x in range(1, w - 2):
            block = [px[x, y], px[x + 1, y], px[x, y + 1], px[x + 1, y + 1]]
            if all(c in eye for c in block) and px[x - 1, y + 1] not in eye and px[x + 2, y + 1] not in eye:
                lid = px[x - 1, y + 1] if px[x - 1, y + 1] != k else px[x + 2, y + 1]
                q[x, y] = q[x + 1, y] = lid
                q[x, y + 1] = q[x + 1, y + 1] = k
    return out


for i in range(1, 9):
    stand = load(f"char{i}")
    legs = leg_rows(stand)
    if legs:
        top, left, right = legs
        save(f"char{i}-idle", strip([stand, stand, squash(stand, top), blink(stand)]))
        low = squash(stand, top)  # en el apoyo el cuerpo baja un píxel: el rebote del paso
        save(f"char{i}-camina", strip([lift(stand, top, left), low, lift(stand, top, right), low]))
    back_file = SPRITES / f"char{i}-atras.png"
    if back_file.exists():
        back = load(f"char{i}-atras")
        legs = leg_rows(back)
        if legs:
            top, left, right = legs
            low = squash(back, top)
            save(f"char{i}-atras-camina", strip([lift(back, top, left), low, lift(back, top, right), low]))
    side = load(f"char{i}-lado")
    legs = leg_rows(side)
    if legs:
        top, left, right = legs
        low = squash(side, top)
        save(f"char{i}-lado-camina", strip([stride(side, top, left, right), low, stride(side, top, left, right), low]))
    # Sentado de frente y de espaldas. El sentado del pack tiene las piernas de
    # lado; para una silla vista de frente (o por detrás) hace falta este: es el
    # de pie con las piernas acortadas dos filas, porque los muslos apuntan a la
    # cámara. El cuerpo baja esas dos filas y el tamaño del cuadro no cambia.
    for view, source in (("frente", stand), ("atras", load(f"char{i}-atras"))):
        legs = leg_rows(source)
        if not legs:
            continue
        top = legs[0]
        sat = Image.new("RGBA", source.size, (0, 0, 0, 0))
        sat.alpha_composite(source.crop((0, 0, source.width, top)), (0, 2))
        sat.alpha_composite(source.crop((0, top + 2, source.width, source.height)), (0, top + 2))
        save(f"char{i}-sentado-{view}", sat)
        save(f"char{i}-sentado-{view}-teclea", strip([sat, squash(sat, top + 2)]))
    seated_name = "char1sentado" if i == 1 else f"char{i}-sentado"  # así se llama en el pack
    seated = load(seated_name)
    save(f"char{i}-sentado-teclea", strip([seated, squash(seated, seated.height - 5)]))

# ------------------------------------------------------------------------ calle
# La calle que corre de arriba abajo a los lados del edificio: acera pegada al
# edificio, bordillo, arroyo vial con su raya, vehículos que suben o bajan,
# peatones y el mobiliario de la acera.
def sidewalk(x, y):
    """Losas de 24 x 12, cuatrapeadas, con su junta."""
    row = y // 12
    if y % 12 == 0 or (x + 12 * (row % 2)) % 24 == 0:
        return "d"
    return "w" if (x * 7 + y * 13) % 53 == 0 else "s"


floor("piso-acera", sidewalk)
floor("piso-asfalto", carpet("e", "k", "d", 7))

# Raya central: un tramo pintado y el resto vacío, para que asome el asfalto.
img = canvas(4, 24)
box(img, 1, 5, 2, 18, "y")
save("calle-raya", img)

# Bordillo, de canto: la cara de arriba clara (con su junta cada 12), el
# escalón y la sombra que echa sobre el asfalto. La acera queda a su izquierda.
img = canvas(4, 24)
for y in range(24):
    for x, c in enumerate("wwdk"):
        img.putpixel((x, y), P["s" if c == "w" and y % 12 == 11 else c])
save("acera-bordillo", img)

# Paso de cebra: una franja y su hueco; se repite a lo ancho del arroyo.
img = canvas(8, 14)
box(img, 0, 0, 3, 13, "w")
save("calle-cebra", img)


# Vehículos. A 45 grados se les ve lo de arriba y la cara que da hacia
# nosotros: de la punta lejana a la cercana van la cubierta del fondo, el techo
# (más claro y más angosto que la carrocería: es la cabina), el cristal que nos
# mira (parabrisas si viene, medallón si se va; el otro no se ve), la cubierta
# de adelante y la cara con sus luces. `bands` lo dice en ese orden: (qué, filas). Las llantas van aparte, para que al rebotar (`up`) la
# carrocería suba un píxel y ellas se queden en el piso.
VW = 24


def vehicle(body, roof, dark, bands, front, up=0, sign=False, logo=None):
    rows = 1 + sum(n for _, n in bands)
    shell = canvas(VW, rows)
    box(shell, 3, 0, VW - 4, 0, "k")
    y = 1
    glass_seen = 0
    for kind, n in bands:
        box(shell, 1, y, VW - 2, y + n - 1, "k")
        box(shell, 2, y, VW - 3, y + n - 1, body)
        if kind == "deck":
            box(shell, 4, y, VW - 5, y, roof)  # brillo de la cara de arriba
            if sign:  # franja de cuadros del taxi
                for x in range(2, VW - 2, 2):
                    shell.putpixel((x, y + n - 1), P["k"])
        elif kind == "roof":
            box(shell, 4, y, VW - 5, y + n - 1, dark)  # el costado de la cabina
            box(shell, 5, y, VW - 6, y + n - 1, roof)
            if sign:
                box(shell, 8, y + n // 2 - 1, 15, y + n // 2 + 1, "k")
                box(shell, 9, y + n // 2, 14, y + n // 2, "o")
            if logo:
                box(shell, 7, y + 5, 16, y + 10, logo)
                box(shell, 9, y + 7, 14, y + 8, "w")
        elif kind == "glass":
            for i in range(n):  # se abre hacia abajo: baja inclinado desde el techo
                x0 = 4 if i >= 2 else 5
                box(shell, x0 - 1, y + i, VW - x0, y + i, dark)
                box(shell, x0, y + i, VW - 1 - x0, y + i, "n")
                for gx in range(x0, VW - x0):
                    if (gx + y + i) % 7 == 0:
                        shell.putpixel((gx, y + i), P["c"])
            glass_seen += 1
            if glass_seen == 1:  # a la altura del cristal van los espejos
                dots(shell, "k", (0, y), (VW - 1, y))
                dots(shell, dark, (0, y + 1), (VW - 1, y + 1))
        elif kind == "face":
            extra = n - 5  # las puertas traseras de la camioneta
            if extra > 0:
                box(shell, 4, y + 1, 9, y + extra - 1, "n")
                box(shell, 14, y + 1, 19, y + extra - 1, "n")
                box(shell, 11, y, 12, y + n - 3, dark)
            fy = y + max(extra, 0)
            lamp, glow = ("y", "w") if front else ("r", "o")
            for x0 in (2, VW - 6):
                box(shell, x0, fy + 1, x0 + 3, fy + 2, lamp)
                box(shell, x0 + 1, fy + 1, x0 + 2, fy + 1, glow)
            if front:  # parrilla
                box(shell, 7, fy + 1, 16, fy + 2, "k")
                for x in range(8, 16, 2):
                    shell.putpixel((x, fy + 2), P["d"])
            box(shell, 2, fy + 3, VW - 3, fy + 3, "s")  # defensa
            box(shell, 10, fy + 3 if front else fy + 2, 13, fy + 3, "w")  # placa
            box(shell, 2, fy + 4, VW - 3, fy + 4, "d")
        y += n
    for x in (1, VW - 2):  # esquinas de la punta lejana, redondeadas
        shell.putpixel((x, 1), (0, 0, 0, 0))
    dots(shell, "k", (2, 1), (VW - 3, 1), (2, 0), (VW - 3, 0))
    img = canvas(VW, rows + 3)
    for x0 in (2, VW - 6):  # llantas
        box(img, x0, rows, x0 + 3, rows + 2, "k")
        img.putpixel((x0 + 1, rows + 1), P["d"])
    img.alpha_composite(shell, (0, 1 - up))
    return img


VEHICLES = {
    # nombre: carrocería, techo, sombra, y lo que va de la punta lejana a la cercana
    "auto-rojo": dict(body="r", roof="o", dark="p",
                      frente=[("deck", 2), ("roof", 8), ("glass", 6), ("deck", 8), ("face", 5)],
                      atras=[("deck", 4), ("roof", 8), ("glass", 5), ("deck", 6), ("face", 5)]),
    "auto-azul": dict(body="b", roof="c", dark="n",  # compacto, sin cajuela
                      frente=[("roof", 11), ("glass", 6), ("deck", 6), ("face", 5)],
                      atras=[("deck", 3), ("roof", 11), ("glass", 6), ("deck", 1), ("face", 5)]),
    "camioneta": dict(body="s", roof="w", dark="d", logo="g",  # van de reparto
                      frente=[("roof", 23), ("glass", 6), ("deck", 3), ("face", 5)],
                      atras=[("deck", 1), ("roof", 26), ("face", 9)]),
    "taxi": dict(body="y", roof="w", dark="o", sign=True,
                 frente=[("deck", 2), ("roof", 8), ("glass", 6), ("deck", 8), ("face", 5)],
                 atras=[("deck", 4), ("roof", 8), ("glass", 5), ("deck", 6), ("face", 5)]),
}
for name, v in VEHICLES.items():
    for view in ("frente", "atras"):
        def paint(up):
            return vehicle(v["body"], v["roof"], v["dark"], v[view], view == "frente", up,
                           v.get("sign", False), v.get("logo"))
        save(f"{name}-{view}", paint(0))
        save(f"{name}-{view}-anim", strip([paint(0), paint(1)]))


# Peatones: cuatro que no son empleados. Mismo cuerpo del pack (17 x 23), con
# pelo y ropa de colores que ningún empleado usa, y cada uno con lo suyo:
# mochila, portafolio, bastón, gorra con audífonos.
# H pelo, S su brillo, Y piel, O su sombra, M ropa, D su sombra, L pantalón, Z zapato.
PEDESTRIAN = [
    "....kkkkkkkkk....", "..kkHHHHHHHHHkk..", ".kHHHSHHHHHHHHHk.", ".kHHHHHHHHHHHHHk.", ".kHHHHHHHHHHHHHk.",
    ".kHHHHYYYYYYHHHk.", ".kHHYYYYYYYYYHHk.", ".kHYYYkYYYkYYYHk.", ".kHYOYkYYYkYOYHk.", ".kYYYYYYYYYYYYYk.",
    "..kOYYYOOYYYYOk..", "...kkOYYYYYOkk...", "....kkkOOOOkk....", "...kkDDMMMMk.....", "...kDMMMMMMMYk...",
    "...kMMDMMMMMYk...", "...kDYMMMMMMDk...", "....kOYMMMMDMk...", "....kkkkkkkkk....", "....kLk...kLk....",
    "....kLk...kLk....", "...kZZk...kZZk...", "...kkkk...kkkk...",
]
CAP = ["....kkkkkkkkk....", "..kkHHHHHHHHHkk..", ".kHHHSHHHHHHHHHk.", ".kHHHHHHHHHHHHHk.", ".kHHHHHHHHHHHHHk.",
       "kSSSSSSSSSSSSSSk.", "kkkkkkkkkkkkkkkk.", ".keYYYkYYYkYYYek.", ".keYOYkYYYkYOYek."]


def pedestrian(name, rows, **tones):
    return save(name, mat(rows, {k: P[v] for k, v in tones.items()}))


def nape(name, skin, shade, hair):
    """Pelo corto visto por detrás: de la fila 10 a la 12 va la nuca, en piel."""
    front, img = load(name), load(name + "-atras")
    for y in range(10, 13):
        for x in range(img.width):
            if img.getpixel((x, y)) == P[hair] and front.getpixel((x, y)) not in (P[hair], P["k"]):
                img.putpixel((x, y), P[shade if y == 12 else skin])
    return img


# 1. Pelo verde azulado, playera morada y mochila.
img = pedestrian("peaton1", PEDESTRIAN, H="t", S="g", Y="y", O="o", M="p", D="n", L="e", Z="w")
dots(img, "o", (5, 14), (5, 15), (10, 14), (10, 15), (10, 16))  # tirantes
img.save(SPRITES / "peaton1.png")
back_view("peaton1", ("t", "g"), 13, logos=[(range(13, 18), "o", "p")], logo_x=(5, 10))
img = nape("peaton1", "y", "o", "t")
box(img, 5, 13, 11, 17, "r")  # la mochila
box(img, 6, 13, 10, 13, "o")
box(img, 7, 16, 9, 16, "p")
img.save(SPRITES / "peaton1-atras.png")

# 2. De traje, corbata roja y portafolio.
img = pedestrian("peaton2", PEDESTRIAN, H="n", S="b", Y="o", O="r", M="e", D="k", L="e", Z="d")
box(img, 7, 14, 9, 15, "w")
dots(img, "r", (8, 14), (8, 15), (8, 16))
box(img, 12, 17, 16, 20, "k")  # portafolio
box(img, 13, 18, 15, 19, "o")
img.save(SPRITES / "peaton2.png")
back_view("peaton2", ("n", "b"), 13, logos=[(range(13, 18), "wr", "e")], logo_x=(6, 10))
nape("peaton2", "o", "r", "n").save(SPRITES / "peaton2-atras.png")

# 3. Persona mayor: pelo blanco, suéter rojo, falda y bastón.
img = pedestrian("peaton3", PEDESTRIAN, H="w", S="s", Y="y", O="o", M="r", D="p", L="n", Z="e")
for y in (19, 20):  # falda
    box(img, 4, y, 12, y, "k")
    box(img, 5, y, 11, y, "n")
box(img, 14, 15, 14, 21, "o")  # bastón
dots(img, "o", (13, 15))
img.save(SPRITES / "peaton3.png")
back_view("peaton3", ("w", "s"), 13)

# 4. Gorra verde, audífonos y sudadera blanca.
img = pedestrian("peaton4", CAP + PEDESTRIAN[9:], H="g", S="l", Y="o", O="r", M="w", D="s", L="n", Z="r")
PHONES = [((0, 7), "k"), ((0, 8), "k"), ((16, 7), "k"), ((16, 8), "k"),
          ((1, 7), "c"), ((1, 8), "c"), ((2, 7), "c"), ((2, 8), "c"),
          ((14, 7), "c"), ((14, 8), "c"), ((15, 7), "c"), ((15, 8), "c")]
for at, c in PHONES:
    img.putpixel(at, P[c])
img.save(SPRITES / "peaton4.png")
back_view("peaton4", ("g", "l"), 7, lower=(7, 13, "e"))
img = nape("peaton4", "o", "r", "e")
for at, c in PHONES:
    img.putpixel(at, P[c])
img.save(SPRITES / "peaton4-atras.png")

# Sus caminatas, con el mismo formato de hoja que las de los empleados.
for i in range(1, 5):
    for view, sheet in (("", "camina"), ("-atras", "atras-camina")):
        walker = load(f"peaton{i}{view}")
        top, left, right = leg_rows(walker)
        low = squash(walker, top)
        save(f"peaton{i}-{sheet}", strip([lift(walker, top, left), low, lift(walker, top, right), low]))


# Mobiliario de la acera, cada pieza con su cara de arriba.
save("buzon", mat([
    ".kkkkkkkk.", "kcccccccck", "kcccccccck", "kbbbbbbbbk", "kbkkkkkkbk", "kbbbbbbbbk", "kbwwwwwwbk", "kbwsssswbk",
    "kbbbbbbbbk", "kbbbbbbbbk", "knnnnnnnnk", ".kkkkkkkk.", "...kddk...", "...kddk...", "..kkddkk..", "..keeeek..",
    "..kkkkkk..",
]))
save("hidrante", mat([
    "...kkk...", "..koook..", ".kkrrrkk.", ".krrrrrk.", "kkrrwrrkk", "kprrwrrpk", "kkrrrrrkk", ".krrrrrk.",
    ".krrrrrk.", ".kprrrpk.", "kkpppppkk", "kkkkkkkkk",
]))

# Farola: el farol arriba (tapa y cristal), el poste y su base. `farola-luz` es
# del mismo tamaño y se encima de noche: el cristal encendido y su halo.
LAMP_W, LAMP_H = 21, 40
img = canvas(LAMP_W, LAMP_H)
box(img, 9, 7, 11, 35, "e")
box(img, 10, 7, 10, 35, "s")
box(img, 7, 35, 13, 38, "k")
box(img, 8, 35, 12, 35, "d")
box(img, 8, 36, 12, 37, "e")
box(img, 5, 0, 15, 6, "k")
box(img, 6, 1, 14, 2, "d")
box(img, 6, 1, 14, 1, "s")
box(img, 6, 3, 14, 5, "s")
box(img, 7, 3, 13, 3, "w")
save("farola", img)
img = canvas(LAMP_W, LAMP_H)
for y in range(LAMP_H):
    for x in range(LAMP_W):
        d2 = (x - 10) ** 2 + (y - 5) ** 2
        if d2 <= 100:
            img.putpixel((x, y), P["y"][:3] + (120 if d2 <= 30 else 60,))
box(img, 6, 3, 14, 5, "y")
box(img, 7, 3, 13, 4, "w")
save("farola-luz", img)

# Árbol chico en su alcorque: copa redonda con la luz arriba a la izquierda.
img = canvas(18, 28)
box(img, 2, 23, 15, 27, "d")
box(img, 3, 24, 14, 26, "p")
dots(img, "e", (5, 25), (12, 24), (9, 26))
box(img, 7, 16, 10, 25, "p")
box(img, 8, 16, 8, 24, "r")
for y in range(18):
    for x in range(18):
        d = ((x - 8.5) / 8.5) ** 2 + ((y - 8.5) / 8.5) ** 2
        if d > 1:
            continue
        if d > 0.8:
            c = "t"
        elif (x - 6) ** 2 + (y - 5) ** 2 < 14 or (x * 5 + y * 3) % 11 == 0:
            c = "l"
        elif y > 11 and (x + y) % 3:
            c = "t"
        else:
            c = "g"
        img.putpixel((x, y), P[c])
save("arbol-acera", img)

print(len(written), "piezas en", SPRITES)
for line in written:
    print(" ", line)
