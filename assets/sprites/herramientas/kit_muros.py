"""Convierte un tramo de muro visto de frente en un kit a medida de la casilla.

El generador entrega muros de cualquier largo y bajitos. El juego arma la
oficina por casillas de 48 px y necesita piezas que se repitan sin costura,
todas del mismo alto y con el mismo grosor en horizontal y en vertical (si no,
un muro en T se ve gordo de un lado y flaco del otro).

De un tramo horizontal saca, en la carpeta de salida:

  tramo.png       48 × alto. Se repite hacia los lados sin costura.
  tramo_izq.png   el mismo, con el borde de remate a la izquierda.
  tramo_der.png   con el borde a la derecha.
  columna.png     48 × 48. Muro que corre de arriba abajo, visto desde arriba:
                  una franja del grosor de la tapa. Se repite hacia abajo.
  poste.png       grosor × alto. El frente de un muro vertical donde termina,
                  o un pilar suelto.

Uso: python kit_muros.py <tramo_horizontal.png> <carpeta> <alto> <bandas> [--vidrio]

  bandas   cómo se reparte el alto. Lista de `desde-hasta:alto` sobre las filas
           del original, de arriba abajo; `*` es la banda que absorbe lo que
           falte. Las dos primeras (borde y tapa) dan el grosor del muro.
           Ej. pared: 0-2:2,2-12:22,12-19:7,19-59:*,59-60:1,60-70:12,70-72:2
  --vidrio el tramo se toma de poste a poste de un ventanal (un vidrio por
           casilla), no del centro.
"""
import sys
from PIL import Image, ImageOps

TILE = 48
args = [a for a in sys.argv[1:] if a != "--vidrio"]
glass = "--vidrio" in sys.argv
src = Image.open(args[0]).convert("RGBA")
out, total = args[1], int(args[2])
bands = []
for part in args[3].split(","):
    rows, height = part.split(":")
    a, b = rows.split("-")
    bands.append([int(a), int(b), None if height == "*" else int(height)])
fixed = sum(h for _, _, h in bands if h)
for band in bands:
    if band[2] is None:
        band[2] = total - fixed
W, H = src.size

# --- una casilla de ancho, del original
if glass:
    # Los postes del ventanal: columnas opacas y oscuras a media altura del vidrio.
    y = (bands[len(bands) // 2][0] + bands[len(bands) // 2][1]) // 2
    dark = [src.getpixel((x, y))[3] == 255 and sum(src.getpixel((x, y))[:3]) < 420 for x in range(W)]
    posts, start = [], None
    for x, d in enumerate(dark + [False]):
        if d and start is None:
            start = x
        elif not d and start is not None:
            posts.append((start + x - 1) / 2)
            start = None
    if len(posts) < 3:
        sys.exit(f"no encontré los postes del ventanal: {posts}")
    a, b = round(posts[1]), round(posts[2])
    column = src.crop((a, 0, b, H)).resize((TILE, H), Image.NEAREST)
else:
    # Media casilla del centro y su espejo: los dos bordes quedan iguales y al
    # repetirla no se nota la unión.
    half = src.crop((W // 2 - TILE // 2, 0, W // 2, H))
    column = Image.new("RGBA", (TILE, H))
    column.paste(half, (0, 0))
    column.paste(ImageOps.mirror(half), (TILE // 2, 0))

# --- estirar cada banda a su alto
tramo = Image.new("RGBA", (TILE, total), (0, 0, 0, 0))
y = 0
for a, b, height in bands:
    tramo.paste(column.crop((0, a, TILE, b)).resize((TILE, height), Image.NEAREST), (0, y))
    y += height
tramo.save(f"{out}/tramo.png")

ink = src.getpixel((W // 2, 0))
for name, x in (("izq", 0), ("der", TILE - 2)):
    end = tramo.copy()
    end.paste(ink, (x, 0, x + 2, total))
    end.save(f"{out}/tramo_{name}.png")

# --- muro vertical: la tapa, girada, del mismo grosor que la del horizontal
thick = bands[0][2] + bands[1][2]
cap = tramo.crop((0, bands[0][2], TILE, thick))  # la tapa sin su borde de arriba
strip = cap.rotate(90, expand=True)  # ahora corre de arriba abajo
columna = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
x0 = (TILE - thick) // 2
columna.paste(ink, (x0, 0, x0 + thick, TILE))
columna.paste(strip.crop((0, 0, strip.width, TILE)), (x0 + (thick - strip.width) // 2, 0))
columna.save(f"{out}/columna.png")

poste = tramo.crop((0, 0, thick, total))
poste.paste(ink, (0, 0, 2, total))
poste.paste(ink, (thick - 2, 0, thick, total))
poste.save(f"{out}/poste.png")
print(out.replace("\\", "/").split("/")[-1], "| alto", total, "| grosor", thick, "| bandas", [h for _, _, h in bands])
