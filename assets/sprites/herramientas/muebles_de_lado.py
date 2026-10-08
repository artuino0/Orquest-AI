"""Dibuja de lado (mirando a la derecha) la silla de madera, con los tonos de
la de frente y su mismo tamaño. La izquierda sale con espejo.

Se arma con formas rectas porque el perfil que da el generador es un palo con
un asiento: aquí se le ve el asiento desde arriba, como a la de frente. (El
sofá y el sillón de lado sí son del generador: hechos así quedaban planos.)

Uso: python muebles_de_lado.py <carpeta_cafeteria>
Deja silla_madera_lado.png ahí mismo.
"""
import sys
from PIL import Image, ImageDraw

folder = sys.argv[1]


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def tones(name):
    """Contorno y cuatro tonos del mueble, de claro a oscuro."""
    im = Image.open(f"{folder}/{name}.png").convert("RGBA")
    counts = {}
    for n, c in im.getcolors(99999):
        if c[3] == 255:
            counts[c[:3]] = counts.get(c[:3], 0) + n
    ink = min(counts, key=lum)
    body = sorted((c for c in counts if lum(c) > lum(ink) + 25), key=counts.get, reverse=True)[:6]
    body.sort(key=lum, reverse=True)
    return im.size, ink, body[0], body[len(body) // 3], body[2 * len(body) // 3], body[-1]


def box(d, x0, y0, x1, y1, fill, ink):
    """Rectángulo relleno con contorno de un píxel; las esquinas incluidas."""
    d.rectangle([x0, y0, x1, y1], fill=ink)
    d.rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=fill)


# ------------------------------------------------------------------ silla
(w, h), ink, light, mid, low, dark = tones("silla_madera")
im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
seat = round(h * 0.56)
box(d, w - 9, seat + 10, w - 4, h - 1, low, ink)  # pata de adelante
box(d, 4, seat + 6, 9, h - 1, low, ink)  # pata de atrás
box(d, 9, h - 14, w - 9, h - 11, dark, ink)  # travesaño
box(d, 3, seat, w - 2, seat + 9, light, ink)  # asiento, visto desde arriba
d.rectangle([4, seat + 6, w - 3, seat + 8], fill=mid)  # su canto
box(d, 3, 3, 9, seat + 2, mid, ink)  # respaldo, de canto
d.rectangle([4, 4, 5, seat + 1], fill=light)
box(d, 2, 0, 11, 6, low, ink)  # remate de arriba
im.save(f"{folder}/silla_madera_lado.png")
print("silla_madera_lado", im.size)
