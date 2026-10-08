"""Enciende y hace parpadear las lucecitas de un equipo (servidores, red).

Al bajar la hoja a cuadrícula de píxel las luces del generador, que miden un
píxel, se promedian con el panel oscuro y pierden el color: quedan como puntos
grises. Aquí se localizan esos puntos (un píxel más claro que sus vecinos de
los lados, sobre fondo oscuro), se pintan de verde o ámbar, y se saca una hoja
de 3 cuadros donde en cada uno se apaga un grupo distinto.

Uso: python luces_parpadeo.py <pieza.png> <hoja_salida.png>
La pieza se reescribe con las luces encendidas.
"""
import sys
from PIL import Image

path = sys.argv[1]
src = Image.open(path).convert("RGBA")
W, H = src.size
px = src.load()
GREEN, AMBER, OFF = (112, 224, 134), (242, 184, 75), (38, 44, 46)


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] if c[3] else 255


lights = []
for y in range(1, H - 1):
    for x in range(1, W - 1):
        here = lum(px[x, y])
        sides = max(lum(px[x - 1, y]), lum(px[x + 1, y]))
        around = (lum(px[x, y - 1]) + lum(px[x, y + 1])) / 2
        if px[x, y][3] and 70 < here < 190 and here > sides + 14 and sides < 95 and around < 110:
            lights.append((x, y))

# Una luz está sola o en fila con otras; una columna entera de "luces" es el
# brillo del canto del gabinete, no luces.
column = {}
for x, y in lights:
    column.setdefault(x, []).append(y)
lights = [(x, y) for x, y in lights if len(column[x]) <= H // 3]

on = src.copy()
p = on.load()
for x, y in lights:
    p[x, y] = (AMBER if (x * 5 + y * 3) % 4 == 0 else GREEN) + (255,)
on.save(path)

FRAMES = 3
sheet = Image.new("RGBA", (W * FRAMES, H), (0, 0, 0, 0))
for f in range(FRAMES):
    frame = on.copy()
    q = frame.load()
    for x, y in lights:
        # Reparto fijo y disparejo: cada luz se apaga en uno de los cuadros.
        if (x * 7 + y * 13) % FRAMES == f:
            q[x, y] = OFF + (255,)
    sheet.alpha_composite(frame, (f * W, 0))
sheet.save(sys.argv[2])
print(len(lights), "luces |", FRAMES, "cuadros de", W, "x", H)
