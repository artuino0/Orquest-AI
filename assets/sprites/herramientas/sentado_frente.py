"""Pose sentado de frente, a partir de la pose de pie de frente.

Sentado y visto de frente, los muslos apuntan a la cámara y casi no se ven: el
cuerpo baja lo que medían y de las piernas queda la rodilla y la espinilla. Así
que no hace falta dibujo nuevo: se quitan las filas del muslo, se marca la
rodilla y lo demás (cabeza, torso, brazos, zapatos) es el mismo dibujo.

Deja también una hoja de 4 cuadros para "trabajando" de frente: mueve un brazo,
cabecea, mueve el otro.

Uso: python sentado_frente.py <front.png> <salida.png> [hoja_trabajando.png]
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
W, H = src.size
hip = round(H * 0.72)  # donde acaba el torso y empieza la pierna
THIGH = round(H * 0.11)  # filas de muslo que desaparecen
px = src.load()


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


sit = Image.new("RGBA", (W, H - THIGH), (0, 0, 0, 0))
sit.alpha_composite(src.crop((0, 0, W, hip)), (0, 0))
sit.alpha_composite(src.crop((0, hip + THIGH, W, H)), (0, hip))

# La rodilla: una fila más clara donde el muslo dobla hacia abajo, y debajo su
# sombra, solo sobre el pantalón (lo que hay entre los contornos de la pierna).
s = sit.load()
ink = min((px[x, y][:3] for y in range(hip, H) for x in range(W) if px[x, y][3]), key=lum)
for x in range(W):
    c = s[x, hip]
    if not c[3] or lum(c) < lum(ink) + 18:
        continue
    s[x, hip] = tuple(min(255, round(v * 1.18)) for v in c[:3]) + (255,)
    below = s[x, hip + 1]
    if below[3] and lum(below) > lum(ink) + 18:
        s[x, hip + 1] = tuple(round(v * 0.82) for v in below[:3]) + (255,)
sit.save(sys.argv[2])

if len(sys.argv) > 3:
    neck, shoulder, arm_w = round(H * 0.40), round(H * 0.44), 9
    xs = [x for x in range(W) if s[x, round(H * 0.58)][3]]
    left, right = xs[0], xs[-1]
    boxes = {"L": (left, shoulder, left + arm_w, hip + 4), "R": (right - arm_w + 1, shoulder, right + 1, hip + 4)}
    frames = [("L",), ("nod",), ("R",), ()]
    sheet = Image.new("RGBA", (W * len(frames), sit.height), (0, 0, 0, 0))
    for i, moves in enumerate(frames):
        f = sit.copy()
        for m in moves:
            if m == "nod":
                head = f.crop((0, 0, W, neck))
                f.paste((0, 0, 0, 0), (0, 0, W, 1))
                f.alpha_composite(head, (0, 1))
            else:
                box = boxes[m]
                part = f.crop(box)
                f.paste((0, 0, 0, 0), (box[0], box[3] - 1, box[2], box[3]))
                f.alpha_composite(part, (box[0], box[1] - 1))
        sheet.alpha_composite(f, (i * W, 0))
    sheet.save(sys.argv[3])
print("sentado", sit.size, "| cadera", hip, "| muslo", THIGH)
