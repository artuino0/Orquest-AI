"""Animación de "trabajando" a partir de la pose de espaldas: el empleado sentado
frente a su monitor mueve un brazo, luego el otro, y cabecea un poco.

En el juego va con la silla dibujada encima (le tapa las piernas) y el monitor
encendido al frente. No es teclear de verdad: es el movimiento mínimo para que
no parezca estatua mientras no haya una pose de tecleo por empleado.

Uso: python sentado_espalda.py <back.png> <hoja_salida.png>
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
W, H = src.size
neck = round(H * 0.40)  # hasta aquí llega la cabeza
shoulder = round(H * 0.44)
ARM_W = 10


def span(y):
    xs = [x for x in range(W) if src.getpixel((x, y))[3]]
    return xs[0], xs[-1]


# Los brazos son las orillas del torso, del hombro a donde acaba la mano.
left, right = span(round(H * 0.58))
hand = shoulder
for y in range(shoulder, H):
    if src.getpixel((left + 2, y))[3] or src.getpixel((right - 2, y))[3]:
        hand = y
arm_boxes = {"L": (left, shoulder, left + ARM_W, hand + 1), "R": (right - ARM_W + 1, shoulder, right + 1, hand + 1)}


def lift(img, box):
    """Sube un píxel lo que hay en la caja."""
    part = img.crop(box)
    img.paste((0, 0, 0, 0), (box[0], box[3] - 1, box[2], box[3]))
    img.alpha_composite(part, (box[0], box[1] - 1))


def nod(img):
    """Baja la cabeza un píxel, encimándola sobre el cuello."""
    head = img.crop((0, 0, W, neck))
    img.paste((0, 0, 0, 0), (0, 0, W, 1))
    img.alpha_composite(head, (0, 1))


FRAMES = [("L",), ("nod",), ("R",), ()]
sheet = Image.new("RGBA", (W * len(FRAMES), H), (0, 0, 0, 0))
for i, moves in enumerate(FRAMES):
    frame = src.copy()
    for m in moves:
        if m == "nod":
            nod(frame)
        else:
            lift(frame, arm_boxes[m])
    sheet.alpha_composite(frame, (i * W, 0))
sheet.save(sys.argv[2])
print(len(FRAMES), "cuadros de", W, "x", H, "| brazos", arm_boxes)
