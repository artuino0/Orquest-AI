"""Arma una mesa vista desde arriba (mesa de juntas) con la madera del
escritorio normal, del tamaño que se pida en casillas.

En esta vista el piso no se achica hacia el fondo: una mesa de 3 casillas de
fondo mide en pantalla sus 3 casillas, más el canto de enfrente. Por eso no se
le pide al generador (la dibujaría en perspectiva) y se arma aquí, recta y con
los mismos tonos que los demás muebles de madera.

Uso: python mesa_larga.py <escritorio.png> <salida.png> <casillas_ancho> <casillas_fondo>
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
tiles_w, tiles_d = int(sys.argv[3]), int(sys.argv[4])
W, H = src.size
px = src.load()
TILE = 48


def dark(c):
    return c[3] and sum(c[:3]) < 200


edge = next(y for y in range(5, H) if sum(dark(px[x, y]) for x in range(W)) > W * 0.9)
ink = px[W // 2, edge]
face_h = H - edge - 1
counts = {}
for y in range(edge + 1, H):
    for x in range(W):
        c = px[x, y]
        if c[3] and not dark(c):
            counts[c[:3]] = counts.get(c[:3], 0) + 1
tones = sorted(counts, key=counts.get, reverse=True)
wood = next(t for t in tones if sum(t) > 330)
shade = next(t for t in tones if 230 < sum(t) <= 330)

# Mismo vuelo que el escritorio: sobresale de sus casillas igual que él.
over_x = W - 2 * TILE
width = tiles_w * TILE + over_x
top_h = (edge + 1) + (tiles_d - 1) * TILE
table = Image.new("RGBA", (width, top_h + face_h), (0, 0, 0, 0))
table.paste(ink, (0, 0, width, top_h))

# Cubierta: la veta corre a lo largo de la mesa, repitiendo la del escritorio.
plank = src.crop((2, 2, W - 2, edge)).rotate(90, expand=True)
inner_w, inner_h = width - 4, top_h - 3
top = Image.new("RGBA", (inner_w, inner_h))
for x in range(0, inner_w, plank.width):
    for y in range(0, inner_h, plank.height):
        top.paste(plank, (x, y))
table.paste(top, (2, 2))
# Un filete más oscuro cerca de la orilla, para que no sea una tabla lisa.
t = table.load()
for x in range(8, width - 8):
    for y in (8, top_h - 8):
        t[x, y] = shade + (255,)
for y in range(8, top_h - 7):
    for x in (8, width - 9):
        t[x, y] = shade + (255,)

# Canto de enfrente con patas a los lados.
face = Image.new("RGBA", (width - 4, face_h), ink)
face.paste(wood + (255,), (2, 0, width - 6, face_h // 2))
face.paste(shade + (255,), (2, 0, width - 6, 3))
legs = 10
face.paste((0, 0, 0, 0), (legs, face_h // 2 + 2, width - 4 - legs, face_h))
for x0 in (0, width - 4 - legs):
    face.paste(ink, (x0, face_h // 2, x0 + legs, face_h))
    face.paste(shade + (255,), (x0 + 2, face_h // 2, x0 + legs - 2, face_h - 2))
table.alpha_composite(face, (2, top_h))
table.save(sys.argv[2])
print("mesa", table.size, "|", tiles_w, "x", tiles_d, "casillas")
