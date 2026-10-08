"""Saca el escritorio en las posiciones que faltan, a partir del que se ve de
frente (cajones hacia la cámara).

El generador, al girar un mueble, le mete perspectiva y lo deja en trapecio.
Aquí se arma con la misma madera y los mismos colores del original, recto por
construcción:

  escritorio_atras     visto por detrás: la misma cubierta y un panel liso
  escritorio_lado_izq  girado, visto por su extremo corto
  escritorio_lado_der  espejo del anterior

Uso: python escritorio_posiciones.py <escritorio.png> <carpeta_salida>
"""
import sys
from PIL import Image, ImageOps

src = Image.open(sys.argv[1]).convert("RGBA")
out = sys.argv[2]
W, H = src.size
px = src.load()
DEPTH = 0.7  # cuánto se achica en pantalla lo que corre hacia el fondo


def dark(c):
    return c[3] and sum(c[:3]) < 200


# La cubierta acaba en la primera fila casi toda de contorno.
edge = next(y for y in range(5, H) if sum(dark(px[x, y]) for x in range(W)) > W * 0.9)
ink = px[W // 2, edge]
top = src.crop((0, 0, W, edge + 1))
face_h = H - edge - 1

# Tonos de la madera del frente: el más usado y uno de sombra.
counts = {}
for y in range(edge + 1, H):
    for x in range(W):
        c = px[x, y]
        if c[3] and not dark(c):
            counts[c[:3]] = counts.get(c[:3], 0) + 1
# (el tono más usado a secas es el hueco oscuro de debajo, no la madera)
tones = sorted(counts, key=counts.get, reverse=True)
wood = next(t for t in tones if sum(t) > 330)
shade = next(t for t in tones if 230 < sum(t) <= 330)


def panel(width, height, legs):
    """Tabla lisa con su contorno; `legs` deja un hueco abajo entre patas."""
    p = Image.new("RGBA", (width, height), ink)
    p.paste(wood + (255,), (2, 0, width - 2, height - 2))
    p.paste(shade + (255,), (2, 0, width - 2, 3))  # sombra de la cubierta
    p.paste(shade + (255,), (2, 0, 5, height - 2))
    p.paste(shade + (255,), (width - 5, 0, width - 2, height - 2))
    if legs:
        gap = height // 3
        p.paste(ink, (legs, height - gap - 2, width - legs, height - gap))
        p.paste((0, 0, 0, 0), (legs + 2, height - gap, width - legs - 2, height))
        p.paste(ink, (legs, height - gap, legs + 2, height))
        p.paste(ink, (width - legs - 2, height - gap, width - legs, height))
    return p


# --- por detrás: la cubierta tal cual y un panel liso con patas a los lados
back = Image.new("RGBA", (W, H), (0, 0, 0, 0))
back.alpha_composite(top, (0, 0))
body = panel(W - 4, face_h, 9)
back.alpha_composite(body, (2, edge + 1))
back.save(f"{out}/escritorio_atras.png")

# --- de lado: la cubierta girada (lo largo ahora corre hacia el fondo y se
# achica; lo que era fondo ahora es el ancho y se ve completo)
inner = src.crop((2, 2, W - 2, edge))
side_w = round(inner.height / DEPTH)
side_len = round(inner.width * DEPTH)
turned = inner.rotate(90, expand=True).resize((side_w, side_len), Image.NEAREST)
side = Image.new("RGBA", (side_w + 4, side_len + 3 + face_h), (0, 0, 0, 0))
side.paste(ink, (0, 0, side_w + 4, side_len + 3))
side.paste(turned, (2, 2))
side.alpha_composite(panel(side_w, face_h, 7), (2, side_len + 3))
side.save(f"{out}/escritorio_lado_izq.png")
ImageOps.mirror(side).save(f"{out}/escritorio_lado_der.png")
print("cubierta hasta fila", edge, "| de lado", side.size, "| por detrás", back.size)
