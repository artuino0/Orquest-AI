"""Arma el escritorio en L a partir del escritorio normal (`puesto/escritorio.png`).

Misma madera, mismos tonos y mismo frente con cajones; recto por construcción
(el generador, con muebles en ángulo, mete perspectiva). Ocupa 3 casillas de
ancho por 2 de fondo: el tramo largo va al fondo y el brazo baja una casilla
por un lado. Quien trabaja ahí se sienta en el hueco, en la columna de en medio.

Deja en la carpeta de salida:

  escritorio_l_izq.png        brazo a la izquierda, cajones a la derecha
  escritorio_l_der.png        su espejo
  escritorio_l_atras_izq.png  el mismo puesto visto por detrás: el tramo largo
                              queda al frente con su panel liso y el brazo se
                              aleja hacia el fondo
  escritorio_l_atras_der.png  su espejo

Uso: python escritorio_l.py <escritorio.png> <carpeta_salida>
"""
import sys
from PIL import Image, ImageOps

src = Image.open(sys.argv[1]).convert("RGBA")
out = sys.argv[2]
W, H = src.size
px = src.load()
TILE = 48
EXTRA = TILE  # lo que crece el tramo largo: de 2 casillas a 3


def dark(c):
    return c[3] and sum(c[:3]) < 200


# La cubierta acaba en la primera fila casi toda de contorno.
edge = next(y for y in range(5, H) if sum(dark(px[x, y]) for x in range(W)) > W * 0.9)
ink = px[W // 2, edge]
face_h = H - edge - 1

# Tonos de la madera del frente (el más usado a secas es el hueco de debajo).
counts = {}
for y in range(edge + 1, H):
    for x in range(W):
        c = px[x, y]
        if c[3] and not dark(c):
            counts[c[:3]] = counts.get(c[:3], 0) + 1
tones = sorted(counts, key=counts.get, reverse=True)
wood = next(t for t in tones if sum(t) > 330)
shade = next(t for t in tones if 230 < sum(t) <= 330)

# Cubierta del tramo largo: la original con una casilla más de la misma veta.
top = src.crop((2, 2, W - 2, edge))
cut = top.width * 3 // 5
long_top = Image.new("RGBA", (top.width + EXTRA, top.height))
long_top.paste(top.crop((0, 0, cut, top.height)), (0, 0))
long_top.paste(top.crop((cut - EXTRA, 0, cut, top.height)), (cut, 0))
long_top.paste(top.crop((cut, 0, top.width, top.height)), (cut + EXTRA, 0))
LONG = long_top.width + 4  # ancho total, con contorno

# Cubierta del brazo: la veta corre hacia el fondo. El brazo mide de ancho lo
# que el escritorio de fondo, visto sin achicar.
ARM = round(top.height / 0.7) + 4
turned = top.rotate(90, expand=True).resize((ARM - 4, round(top.width * 0.7)), Image.NEAREST)


def panel(width, height, legs):
    """Tabla lisa con su contorno y un hueco abajo entre patas."""
    p = Image.new("RGBA", (width, height), ink)
    p.paste(wood + (255,), (2, 0, width - 2, height - 2))
    p.paste(shade + (255,), (2, 0, width - 2, 3))  # sombra de la cubierta
    p.paste(shade + (255,), (2, 0, 5, height - 2))
    p.paste(shade + (255,), (width - 5, 0, width - 2, height - 2))
    gap = height // 3
    p.paste(ink, (legs, height - gap - 2, width - legs, height - gap))
    p.paste((0, 0, 0, 0), (legs + 2, height - gap, width - legs - 2, height))
    p.paste(ink, (legs, height - gap, legs + 2, height))
    p.paste(ink, (width - legs - 2, height - gap, width - legs, height))
    return p


TOP = edge + 1  # filas de cubierta del tramo largo, con contorno
size = (LONG, TOP + TILE + face_h)

# --- de frente: tramo largo arriba, brazo que baja por la izquierda
front = Image.new("RGBA", size, (0, 0, 0, 0))
front.paste(ink, (0, 0, LONG, TOP))
front.paste(ink, (0, 0, ARM, TOP + TILE))
front.paste(long_top, (2, 2))
arm_rows = TILE - 2
front.paste(turned.crop((0, 0, ARM - 4, arm_rows)), (2, TOP))
front.paste(shade + (255,), (2, TOP - 1, ARM - 2, TOP))  # la unión de las dos tablas
# Frente del tramo largo, junto al brazo: faldón, hueco para las piernas y cajones.
face = src.crop((0, edge + 1, W, H))
seg_w = LONG - ARM
seg = Image.new("RGBA", (seg_w, face_h))
body = face.crop((10, 0, W, face_h))  # sin la pata izquierda: ahí va el brazo
fill = seg_w - body.width
apron = face.crop((14, 0, 15, face_h))
for x in range(fill):
    seg.paste(apron, (x, 0))
seg.paste(body, (fill, 0))
front.alpha_composite(seg, (ARM, TOP))
front.alpha_composite(panel(ARM, face_h, 7), (0, TOP + TILE))
front.save(f"{out}/escritorio_l_izq.png")
ImageOps.mirror(front).save(f"{out}/escritorio_l_der.png")

# --- por detrás: el brazo se aleja hacia el fondo y el tramo largo queda al
# frente, con panel liso en vez de cajones
back = Image.new("RGBA", size, (0, 0, 0, 0))
back.paste(ink, (0, 0, ARM, TILE + 2))
back.paste(turned.crop((0, 0, ARM - 4, TILE - 2)), (2, 2))
back.paste(ink, (0, TILE, LONG, TILE + TOP))
back.paste(long_top, (2, TILE + 2))
back.paste(shade + (255,), (2, TILE, ARM - 2, TILE + 2))
back.alpha_composite(panel(LONG - 4, face_h, 9), (2, TILE + TOP))
back.save(f"{out}/escritorio_l_atras_izq.png")
ImageOps.mirror(back).save(f"{out}/escritorio_l_atras_der.png")
print("tamaño", size, "| brazo", ARM, "de ancho | cubierta", TOP, "filas | frente", face_h)
