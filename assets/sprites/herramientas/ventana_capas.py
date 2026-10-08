"""Prepara las ventanas para cambiar con la hora del día.

1. Parte la hoja de vistas (franjas apiladas del mismo paisaje a distintas
   horas) en una imagen por hora, ya en cuadrícula de píxel.
2. A cada ventana le vuelve transparente el vidrio y guarda solo el marco.

En el juego la vista va detrás y el marco encima: una sola ventana sirve para
todas las horas, fundiendo una vista en otra.

Uso: python ventana_capas.py <vistas.png> <carpeta_salida> <hora1,hora2,...> <ventana.png>...
"""
import sys
from collections import deque
from PIL import Image

vistas, out, hours, windows = sys.argv[1], sys.argv[2], sys.argv[3].split(","), sys.argv[4:]
VIEW_W = 192  # ancho de cada vista ya pixelada


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


# --- vistas: las franjas están separadas por renglones oscuros y parejos.
im = Image.open(vistas).convert("RGB")
W, H = im.size
px = im.load()
dark = []
for y in range(H):
    row = [lum(px[x, y]) for x in range(0, W, 8)]
    dark.append(max(row) < 40)
strips, start = [], None
for y, d in enumerate(dark + [True]):
    if not d and start is None:
        start = y
    elif d and start is not None:
        if y - start > H // (len(hours) * 3):
            strips.append((start, y))
        start = None
if len(strips) != len(hours):
    sys.exit(f"esperaba {len(hours)} franjas y encontré {len(strips)}: {strips}")
h = min(b - a for a, b in strips)
for (a, _), name in zip(strips, hours):
    strip = im.crop((0, a, W, a + h))
    small = strip.resize((VIEW_W, round(h * VIEW_W / W)), Image.BOX)
    small.quantize(48, dither=Image.Dither.NONE).convert("RGB").save(f"{out}/vista_{name}.png")
print("vistas de", VIEW_W, "x", round(h * VIEW_W / W))

# --- marcos: el vidrio es cada mancha grande de azul oscuro; se vacía su caja
# completa (las luces de los edificios quedan dentro).
for path in windows:
    win = Image.open(path).convert("RGBA")
    p = win.load()
    glass = {(x, y) for y in range(win.height) for x in range(win.width)
             if p[x, y][3] and p[x, y][2] > p[x, y][0] + 12 and lum(p[x, y]) < 95}
    panes = []
    while glass:
        queue, blob = deque([glass.pop()]), []
        while queue:
            x, y = queue.popleft()
            blob.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in glass:
                    glass.remove(n)
                    queue.append(n)
        if len(blob) > 80:
            xs, ys = [c[0] for c in blob], [c[1] for c in blob]
            panes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1))
    for x0, y0, x1, y1 in panes:
        win.paste((0, 0, 0, 0), (x0, y0, x1, y1))
    name = path.replace("\\", "/").split("/")[-1].replace(".png", "_marco.png")
    win.save(f"{out}/{name}")
    print(name, "vidrios:", panes)
