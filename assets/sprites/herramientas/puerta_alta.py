"""Sube la puerta corrediza del ventanal a la altura del kit de muros.

`ventanales/puerta.png` mide 94 de alto y el kit de ventanal 144, así que en un
ventanal la puerta quedaba como hueco. Aquí se estira por bandas igual que el
kit (riel de arriba, vidrio, riel de abajo) y se recorta a la puerta:

  puerta_alta.png    96 de ancho, las dos hojas (2 casillas)
  puerta_alta_1.png  48 de ancho, una hoja (1 casilla)

Uso: python puerta_alta.py <puerta.png> <carpeta_salida> <alto> <bandas>
Las bandas son las mismas del ventanal en kit_muros.py.
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
out, total = sys.argv[2], int(sys.argv[3])
bands = []
for part in sys.argv[4].split(","):
    rows, height = part.split(":")
    a, b = rows.split("-")
    bands.append([int(a), int(b), None if height == "*" else int(height)])
fixed = sum(h for _, _, h in bands if h)
for band in bands:
    if band[2] is None:
        band[2] = total - fixed
W, H = src.size
tall = Image.new("RGBA", (W, total), (0, 0, 0, 0))
y = 0
for a, b, height in bands:
    tall.paste(src.crop((0, a, W, b)).resize((W, height), Image.NEAREST), (0, y))
    y += height

# Las hojas son lo de en medio: se recortan dos casillas alrededor del centro.
TILE = 48
mid = W // 2
ink = src.getpixel((mid, 0))
double = tall.crop((mid - TILE, 0, mid + TILE, total))
for x in (0, 2 * TILE - 2):
    double.paste(ink, (x, 0, x + 2, total))
double.save(f"{out}/puerta_alta.png")
single = tall.crop((mid - TILE, 0, mid, total))
single.paste(ink, (0, 0, 2, total))
single.paste(ink, (TILE - 2, 0, TILE, total))
single.save(f"{out}/puerta_alta_1.png")
print("puerta alta", double.size, "y", single.size)
