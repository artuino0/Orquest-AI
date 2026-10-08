"""Cambia la madera de un ventanal por el metal de su marco.

El ventanal del generador trae el riel de arriba y un filo de abajo en madera
café; sobre un muro de vidrio se ve como "algo café encima". Aquí todo lo café
opaco pasa al gris azulado del marco, conservando su luz y su sombra. El
vidrio (semitransparente) y el contorno oscuro no se tocan.

Uso: python marco_metal.py <pieza.png>...   (reescribe cada archivo)
"""
import sys
from PIL import Image

METAL = (90, 119, 118)  # el tono del marco entre vidrios
BASE = 0.3 * METAL[0] + 0.59 * METAL[1] + 0.11 * METAL[2]

for path in sys.argv[1:]:
    im = Image.open(path).convert("RGBA")
    p = im.load()
    n = 0
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            # Café: opaco, cálido y más claro que el contorno.
            if a == 255 and r > b + 14 and r >= g and lum > 75:
                k = lum / BASE * 0.9
                p[x, y] = tuple(min(255, round(v * k)) for v in METAL) + (255,)
                n += 1
    im.save(path)
    print(path.replace("\\", "/").split("/")[-1], n, "píxeles de madera a metal")
