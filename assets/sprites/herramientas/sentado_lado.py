"""Animación de teclear de perfil, a partir de la pose sentada (`sit.png`).

Es el mismo dibujo en los cuatro cuadros: sube una mano, cabecea, sube la otra,
quieto. El cuadro mide lo mismo que `sit.png`, así que al pasar de quieto a
tecleando el personaje no brinca. Mira a la derecha; la izquierda es su espejo.

Las manos se encuentran por el color de la piel de la cara: lo que haya de ese
color al frente del cuerpo, a la altura del regazo.

Uso: python sentado_lado.py <sit.png> <hoja_salida.png>
"""
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
W, H = src.size
px = src.load()
neck = round(H * 0.47)  # hasta aquí llega la cabeza en la pose sentada
LIFT = 2  # píxeles que sube la mano al teclear


def skin_tones(floor, blue):
    found = {}
    for y in range(round(H * 0.15), round(H * 0.42)):
        for x in range(W):
            c = px[x, y]
            if c[3] and c[0] > floor and c[0] > c[1] > c[2] > blue and c[0] - c[2] > 35:
                found[c[:3]] = found.get(c[:3], 0) + 1
    return found


# Primero piel clara; si la cara casi no tiene, es piel oscura.
tones = skin_tones(170, 90)
if sum(tones.values()) < 40:
    tones = skin_tones(110, 40)
face = set(sorted(tones, key=tones.get, reverse=True)[:3])

hands = [(x, y) for y in range(neck, round(H * 0.82)) for x in range(W // 2, W)
         if px[x, y][3] and px[x, y][:3] in face]
if len(hands) < 6:
    sys.exit("no encontré las manos")
x0 = min(x for x, _ in hands) - 8  # con un tramo de antebrazo
y0, y1 = min(y for _, y in hands) - 2, max(y for _, y in hands) + 3
mid = (y0 + y1) // 2
boxes = {"A": (max(0, x0), y0, W, mid), "B": (max(0, x0), mid, W, y1)}


def lift(img, box):
    """Sube lo de la caja. Se pega encima, sin borrar lo de abajo: así no se
    abre un hueco en el antebrazo."""
    part = img.crop(box)
    img.alpha_composite(part, (box[0], box[1] - LIFT))


def nod(img):
    head = img.crop((0, 0, W, neck))
    img.paste((0, 0, 0, 0), (0, 0, W, 1))
    img.alpha_composite(head, (0, 1))


FRAMES = [("A",), ("nod",), ("B",), ()]
sheet = Image.new("RGBA", (W * len(FRAMES), H), (0, 0, 0, 0))
for i, moves in enumerate(FRAMES):
    frame = src.copy()
    for m in moves:
        nod(frame) if m == "nod" else lift(frame, boxes[m])
    sheet.alpha_composite(frame, (i * W, 0))
sheet.save(sys.argv[2])
print(len(FRAMES), "cuadros de", W, "x", H, "| manos", boxes)
