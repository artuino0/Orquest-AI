"""Caminata de perfil hecha como marioneta, a partir de UNA pose de pie.

El cuerpo (cabeza y torso) es un solo dibujo que no cambia. De esa misma pose
se cortan las piezas que se mueven:

  - el brazo: la franja que va del hombro a la mano; gira en el hombro;
  - la pierna, en muslo y espinilla (con su zapato); gira en cadera y rodilla.

El brazo y la pierna lejanos son las mismas piezas, más oscuras y medio ciclo
desfasadas. Como los dos lados recorren los mismos ángulos, el cruce es exacto.

Uso: python caminata_marioneta.py <perfil.png> <hoja_salida.png> [cadera] [rodilla] [vista.png]

  cadera   fracción del alto donde empieza la pierna (0.70)
  rodilla  fracción del alto donde dobla (0.85)
"""
import math
import sys
from PIL import Image

src = Image.open(sys.argv[1]).convert("RGBA")
hip_at = float(sys.argv[3]) if len(sys.argv) > 3 else 0.70
knee_at = float(sys.argv[4]) if len(sys.argv) > 4 else 0.85
W, H = src.size
hip, knee = round(H * hip_at), round(H * knee_at)
shoulder = round(H * 0.43)
OVERLAP = 3  # muslo y espinilla se enciman en la rodilla para que no se abra un hueco
PAD = 26  # aire a los lados para la zancada
SWING = 0.9  # cuánto gira el brazo por cada grado del muslo contrario

# (ángulo del muslo, flexión de rodilla) en grados a lo largo de un paso.
# Muslo positivo = pie adelante; la flexión manda el pie hacia atrás.
STEP = [(20, 0), (11, 5), (0, 0), (-11, 0), (-19, 8), (-13, 34), (5, 42), (17, 18)]


def rnd(v):
    # round() de Python redondea .5 al par y deja columnas sin pintar.
    return math.floor(v + 0.5)


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


px = src.load()
ink = min((px[x, y][:3] for y in range(H) for x in range(W) if px[x, y][3]), key=lum)

# ------------------------------------------------------------------- brazo
# La mano es lo que hay, a la altura de la cadera, del color de la piel de la
# cara. Solo cuentan los tres tonos de piel más usados: un pantalón claro puede
# compartir alguno de los demás.
def skin_tones(floor, blue):
    found = {}
    for y in range(round(H * 0.2), round(H * 0.38)):
        for x in range(W):
            c = px[x, y]
            if c[3] and c[0] > floor and c[0] > c[1] > c[2] > blue and c[0] - c[2] > 35:
                found[c[:3]] = found.get(c[:3], 0) + 1
    return found


# Primero piel clara; si la cara casi no tiene, es piel oscura y se baja la vara
# (bajarla siempre confunde la piel con prendas ocres).
tones = skin_tones(170, 90)
if sum(tones.values()) < 40:
    tones = skin_tones(110, 40)
face = set(sorted(tones, key=tones.get, reverse=True)[:3])
ARM_W = 12  # ancho máximo de la franja del brazo
rows = range(hip - 12, min(H, hip + 10))
skin = [(x, y) for y in rows for x in range(W) if px[x, y][3] and px[x, y][:3] in face]
arm = None
if len(skin) >= 12:
    # La franja de columnas con más piel es la mano.
    count = [sum(1 for x, _ in skin if x == col) for col in range(W)]
    start = max(range(W - ARM_W + 1), key=lambda c0: sum(count[c0:c0 + ARM_W]))
    cols = [c for c in range(start, start + ARM_W) if count[c]]
    hx0, hx1 = cols[0], cols[-1]
    # Hacia abajo, la mano acaba donde se termina la piel
    by_row = {y: sum(1 for x, yy in skin if yy == y and hx0 <= x <= hx1) for y in rows}
    top = next(y for y in rows if by_row[y] >= 2)
    # (se perdonan hasta dos filas: una arruga o la sombra de la muñeca)
    bottom, y = top, top
    while y + 1 in by_row and y - bottom < 3:
        y += 1
        if by_row[y] >= 2:
            bottom = y
    hand = {(x, y) for x, y in skin if hx0 <= x <= hx1 and top <= y <= bottom}
    arm_box = (max(0, hx0 - 2), shoulder, min(W, hx1 + 3), min(H, bottom + 2))
    arm = src.crop(arm_box)
    a = arm.load()
    # De la mano para abajo la franja solo lleva la mano y su contorno, no el
    # pantalón que tenía detrás.
    for y in range(arm.height):
        for x in range(arm.width):
            sx, sy = x + arm_box[0], y + arm_box[1]
            if sy < top or not a[x, y][3] or (sx, sy) in hand:
                continue
            near_hand = any((sx + dx, sy + dy) in hand for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            if not (a[x, y][:3] == ink and near_hand):
                a[x, y] = (0, 0, 0, 0)
    arm_pivot = ((arm_box[0] + arm_box[2] - 1) / 2, shoulder + 3)

# Cuerpo sin brazo: donde estaba, cada fila se rellena con lo que tiene al lado
# (la prenda de atrás), para que no quede un brazo fantasma.
base = src.copy()
if arm:
    b = base.load()
    for y in range(arm_box[1] + 4, arm_box[3]):
        left = next((px[x, y] for x in range(arm_box[0] - 1, -1, -1) if px[x, y][3] and px[x, y][:3] != ink), None)
        right = next((px[x, y] for x in range(arm_box[2], W) if px[x, y][3] and px[x, y][:3] != ink), None)
        fill = left or right
        if not fill:
            continue
        for x in range(arm_box[0], arm_box[2]):
            if px[x, y][3]:
                b[x, y] = fill


def span(img, y):
    xs = [x for x in range(img.width) if img.getpixel((x, y))[3]]
    return xs[0], xs[-1]


x0, x1 = span(base, hip)
hip_x = (x0 + x1) / 2
upper = base.crop((0, 0, W, hip))
thigh = base.crop((0, hip, W, knee + OVERLAP))
shin = base.crop((0, knee - OVERLAP, W, H))
kx0, kx1 = span(base, knee)
knee_x = (kx0 + kx1) / 2


def darker(img, k=0.62):
    out = img.copy()
    p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, bl, al = p[x, y]
            if al:
                p[x, y] = (round(r * k), round(g * k), round(bl * k), al)
    return out


def rotate_onto(canvas, piece, origin, pivot, angle, at):
    """Pega `piece` girada `angle` grados alrededor de `pivot` (en coordenadas
    del original; `origin` es dónde estaba la esquina de la pieza), dejando el
    pivote en `at` del lienzo. Muestreo inverso: sin huecos."""
    rad = math.radians(angle)
    cos, sin = math.cos(rad), math.sin(rad)
    p, c = piece.load(), canvas.load()
    r = int(math.hypot(piece.width, piece.height)) + 2
    ox, oy = rnd(at[0]), rnd(at[1])
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            # De destino a origen: giro contrario.
            ix = rnd(dx * cos - dy * sin + pivot[0] - origin[0])
            iy = rnd(dx * sin + dy * cos + pivot[1] - origin[1])
            if 0 <= ix < piece.width and 0 <= iy < piece.height and p[ix, iy][3]:
                tx, ty = ox + dx, oy + dy
                if 0 <= tx < canvas.width and 0 <= ty < canvas.height:
                    c[tx, ty] = p[ix, iy]


def leg(canvas, thigh_img, shin_img, pose, at):
    theta, flex = pose
    rotate_onto(canvas, thigh_img, (0, hip), (hip_x, hip), theta, at)
    # La rodilla viaja con el muslo; la espinilla gira ahí con el ángulo total.
    rad = math.radians(theta)
    dx, dy = knee_x - hip_x, knee - hip
    at_knee = (at[0] + dx * math.cos(rad) + dy * math.sin(rad), at[1] - dx * math.sin(rad) + dy * math.cos(rad))
    rotate_onto(canvas, shin_img, (0, knee - OVERLAP), (knee_x, knee), theta - flex, at_knee)


def swing(canvas, arm_img, angle):
    """Brazo girado en el hombro, con su contorno (la franja se cortó de en
    medio de la prenda y no trae borde a los lados)."""
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    at = (PAD + arm_pivot[0], arm_pivot[1])
    rotate_onto(layer, arm_img, (arm_box[0], arm_box[1]), arm_pivot, angle, at)
    l = layer.load()
    edge = []
    for y in range(shoulder + 6, layer.height):
        for x in range(layer.width):
            if l[x, y][3]:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < layer.width and 0 <= ny < layer.height and l[nx, ny][3]:
                    edge.append((x, y))
                    break
    for x, y in edge:
        l[x, y] = ink + (255,)
    canvas.alpha_composite(layer)


far_thigh, far_shin = darker(thigh), darker(shin)
far_arm = darker(arm) if arm else None
half = len(STEP) // 2
frames = []
for i in range(len(STEP)):
    canvas = Image.new("RGBA", (W + 2 * PAD, H + 8), (0, 0, 0, 0))
    at = (PAD + hip_x, hip)
    near, far = STEP[i], STEP[(i + half) % len(STEP)]
    # Cada brazo va al contrario de la pierna de su lado.
    if arm:
        swing(canvas, far_arm, -SWING * far[0])
    leg(canvas, far_thigh, far_shin, far, at)
    leg(canvas, thigh, shin, near, at)
    canvas.alpha_composite(upper, (PAD, 0))
    if arm:
        swing(canvas, arm, -SWING * near[0])
    frames.append(canvas)

# El pie más bajo de cada cuadro pisa el suelo: de ahí sale el sube y baja.
floor = max(f.getbbox()[3] for f in frames)
left = min(f.getbbox()[0] for f in frames)
right = max(f.getbbox()[2] for f in frames)
cw, ch = right - left + 2, floor + 1
sheet = Image.new("RGBA", (cw * len(frames), ch), (0, 0, 0, 0))
for i, f in enumerate(frames):
    drop = floor - f.getbbox()[3]
    sheet.alpha_composite(f.crop((left - 1, 0, right + 1, floor)), (i * cw, drop + 1))
sheet.save(sys.argv[2])
if len(sys.argv) > 5:
    bg = Image.new("RGBA", sheet.size, (128, 86, 60, 255))
    bg.alpha_composite(sheet)
    bg.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(sys.argv[5])
print(len(frames), "cuadros de", cw, "x", ch, "| cadera", hip, "rodilla", knee, "| brazo", arm_box if arm else "no encontrado")
