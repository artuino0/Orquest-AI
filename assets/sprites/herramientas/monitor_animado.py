"""Anima un monitor visto de frente: el código de la pantalla va subiendo y el
brillo parpadea. También saca la versión apagada.

El estado "trabajando" se muestra con el empleado sentado de espaldas y este
monitor encendido; "blink" es esta animación, "on" su primer cuadro y "off" el
monitor apagado.

Uso: python monitor_animado.py <monitor.png> <carpeta_salida>
Deja monitor_on.png (hoja horizontal de 4 cuadros) y monitor_apagado.png.
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
out = sys.argv[2]
W, H = src.size
px = src.load()


def screen_like(c):
    """Fondo de la pantalla: oscuro y azulado."""
    return c[3] and c[2] > c[0] + 8 and sum(c[:3]) < 330


# La pantalla es la caja que ocupa ese fondo en la parte de arriba del monitor.
cells = [(x, y) for y in range(H * 3 // 4) for x in range(W) if screen_like(px[x, y])]
x0, x1 = min(x for x, _ in cells), max(x for x, _ in cells) + 1
y0, y1 = min(y for _, y in cells), max(y for _, y in cells) + 1
# Dos píxeles hacia adentro: en la orilla hay reflejos del marco, y si se
# desplazan con el texto se ve una raya clara recorriendo la pantalla.
x0, y0, x1, y1 = x0 + 2, y0 + 2, x1 - 2, y1 - 2
screen = src.crop((x0, y0, x1, y1))
back = max(screen.getcolors(4096), key=lambda nc: nc[0])[1]

STEPS = [0, 2, 4, 6]  # filas que ha subido el texto en cada cuadro
GLOW = [1.0, 1.12, 1.0, 1.06]  # parpadeo del brillo
sheet = Image.new("RGBA", (W * len(STEPS), H), (0, 0, 0, 0))
for i, (step, glow) in enumerate(zip(STEPS, GLOW)):
    frame = src.copy()
    scrolled = Image.new("RGBA", screen.size, back)
    scrolled.paste(screen.crop((0, step, screen.width, screen.height)), (0, 0))
    scrolled.paste(screen.crop((0, 0, screen.width, step)), (0, screen.height - step))
    scrolled = scrolled.point(lambda v: min(255, round(v * glow)))
    scrolled.putalpha(255)
    frame.paste(scrolled, (x0, y0))
    sheet.alpha_composite(frame, (i * W, 0))
sheet.save(f"{out}/monitor_on.png")

off = src.copy()
dark = Image.new("RGBA", screen.size, (24, 27, 34, 255))
d = dark.load()
# Un reflejo en diagonal, para que no se vea como un hueco negro.
for y in range(dark.height):
    for x in range(dark.width):
        if (x + y) % 23 in (0, 1, 2) and x > dark.width // 2:
            d[x, y] = (40, 45, 56, 255)
off.paste(dark, (x0, y0))
off.save(f"{out}/monitor_apagado.png")
print("pantalla", (x0, y0, x1, y1), "| hoja de", len(STEPS), "cuadros de", W, "x", H)
