"""Convierte una hoja generada (piezas sueltas sobre fondo liso) en sprites de pixel art.

Quita el fondo desde los bordes, separa cada pieza, la baja a la cuadrícula real
de píxel, unifica la paleta, le pone contorno y la guarda con su nombre. Las
piezas se leen de izquierda a derecha y de arriba abajo.

Uso: python limpiar_hoja.py <hoja.png> <carpeta_salida> <nombre1,nombre2:alto,...> [alto] [colores] [huecos]

  nombre:alto  esa pieza se escala por su cuenta a ese alto (el generador dibuja
               un teclado tan grande como un escritorio; aquí se corrige)
  nombre!      a esa pieza se le quita el resplandor que la rodea (una lámpara
               encendida trae un halo pintado que no es parte del objeto)

  alto     alto en píxeles que tendrá la pieza más alta (118 = un empleado de pie)
  colores  tamaño de la paleta común (28)
  huecos   quita también el fondo encerrado dentro de una pieza (entre los
           barrotes de una silla). Para muebles; en personajes se come el pelo cano.
"""
import sys
from collections import deque
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
names, own = [], {}
halo = set()
for item in sys.argv[3].split(","):
    if item.endswith("!"):
        item = item[:-1]
        halo.add(item.partition(":")[0])
    name, _, height = item.partition(":")
    names.append(name)
    if height:
        own[name] = int(height)
target = int(sys.argv[4]) if len(sys.argv) > 4 else 118
colors = int(sys.argv[5]) if len(sys.argv) > 5 else 28
# Solo para muebles. En personajes no hay fondo encerrado y sí hay pelo cano o
# ropa gris, lisos y del color del fondo, que se confundirían con un hueco.
holes = len(sys.argv) > 6 and sys.argv[6] == "huecos"
TOL = 38  # qué tan parecido al fondo cuenta como fondo
CELL = 8  # las piezas a menos de esta distancia se cuentan como una sola

im = Image.open(src).convert("RGB")
W, H = im.size
px = im.load()
bg = px[4, 4]


def is_bg(c):
    return sum(abs(a - b) for a, b in zip(c, bg)) < TOL


# Relleno desde los bordes: así lo claro de adentro (camisa, tenis) no se borra.
mask = [[False] * W for _ in range(H)]
queue = deque()
for x in range(W):
    queue.extend(((x, 0), (x, H - 1)))
for y in range(H):
    queue.extend(((0, y), (W - 1, y)))
while queue:
    x, y = queue.popleft()
    if x < 0 or y < 0 or x >= W or y >= H or mask[y][x] or not is_bg(px[x, y]):
        continue
    mask[y][x] = True
    queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

# Fondo encerrado (entre los barrotes de una silla, entre una pizarra y su
# soporte): no toca la orilla, así que el relleno de arriba no lo alcanza. Se
# reconoce porque es del color del fondo y completamente liso; un mueble gris
# tiene sombreado y no pasa por fondo.
HOLE_TOL, HOLE_MIN = 22, 60
border = [row[:] for row in mask]  # el fondo que sí toca la orilla
seen_hole = [[False] * W for _ in range(H)]
for y0 in range(H if holes else 0):
    for x0 in range(W):
        if mask[y0][x0] or seen_hole[y0][x0]:
            continue
        c0 = px[x0, y0]
        if sum(abs(a - b) for a, b in zip(c0, bg)) >= HOLE_TOL:
            continue
        blob, queue = [], deque([(x0, y0)])
        seen_hole[y0][x0] = True
        while queue:
            x, y = queue.popleft()
            blob.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < W and 0 <= ny < H and not mask[ny][nx] and not seen_hole[ny][nx]                         and sum(abs(a - b) for a, b in zip(px[nx, ny], bg)) < HOLE_TOL:
                    seen_hole[ny][nx] = True
                    queue.append((nx, ny))
        if len(blob) < HOLE_MIN:
            continue
        mean = [sum(px[x, y][i] for x, y in blob) / len(blob) for i in range(3)]
        spread = sum(abs(px[x, y][i] - mean[i]) for x, y in blob for i in range(3)) / (3 * len(blob))
        if spread >= 4.5:
            continue
        # Y además tiene que ser idéntico al fondo que rodea a la pieza. El fondo
        # cambia un poco de una esquina a otra de la hoja, así que se compara con
        # el de cerca; un vidrio o un pelo cano se parecen, pero no son iguales.
        xs, ys = [c[0] for c in blob], [c[1] for c in blob]
        near = [px[x, y] for y in range(max(0, min(ys) - 60), min(H, max(ys) + 60), 3)
                for x in range(max(0, min(xs) - 60), min(W, max(xs) + 60), 3) if border[y][x]]
        if not near:
            continue
        local = [sum(c[i] for c in near) / len(near) for i in range(3)]
        if sum(abs(mean[i] - local[i]) for i in range(3)) < 8:
            # Confirmado el hueco, se vacía hasta su orilla real: los píxeles
            # del borde son fondo mezclado con la pieza y no pasaron por lisos.
            grow = deque(blob)
            for x, y in blob:
                mask[y][x] = True
            while grow:
                x, y = grow.popleft()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not mask[ny][nx]                             and sum(abs(a - b) for a, b in zip(px[nx, ny], local)) < TOL:
                        mask[ny][nx] = True
                        grow.append((nx, ny))

# El borde con el fondo sale manchado de gris: se come dos píxeles hacia adentro.
for _ in range(2):
    grow = [(x, y) for y in range(1, H - 1) for x in range(1, W - 1)
            if not mask[y][x] and (mask[y][x + 1] or mask[y][x - 1] or mask[y + 1][x] or mask[y - 1][x])]
    for x, y in grow:
        mask[y][x] = True

rgba = im.convert("RGBA")
a = rgba.load()
for y in range(H):
    for x in range(W):
        if mask[y][x]:
            a[x, y] = (0, 0, 0, 0)

# Piezas: manchas conectadas sobre una rejilla gruesa, para que un cable o un
# mechón suelto no cuenten como pieza aparte.
gw, gh = (W + CELL - 1) // CELL, (H + CELL - 1) // CELL
grid = [[False] * gw for _ in range(gh)]
for y in range(H):
    row = mask[y]
    for x in range(W):
        if not row[x]:
            grid[y // CELL][x // CELL] = True
seen = [[False] * gw for _ in range(gh)]
boxes = []
for gy in range(gh):
    for gx in range(gw):
        if not grid[gy][gx] or seen[gy][gx]:
            continue
        x0 = x1 = gx
        y0 = y1 = gy
        n = 0
        queue = deque([(gx, gy)])
        seen[gy][gx] = True
        while queue:
            cx, cy = queue.popleft()
            n += 1
            x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < gw and 0 <= ny < gh and grid[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        queue.append((nx, ny))
        if n >= 40:  # menos que esto es una etiqueta o una mota, no una pieza
            boxes.append((x0 * CELL, y0 * CELL, min(W, (x1 + 1) * CELL), min(H, (y1 + 1) * CELL)))

# Orden de lectura: por renglón (según el centro) y luego por x.
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows, current = [], []
for b in boxes:
    if current and (b[1] + b[3]) / 2 > max(c[3] for c in current):
        rows.append(current)
        current = []
    current.append(b)
if current:
    rows.append(current)
boxes = [b for row in rows for b in sorted(row, key=lambda b: b[0])]
if len(boxes) != len(names):
    sys.exit(f"esperaba {len(names)} piezas y encontré {len(boxes)}: {boxes}")

def drop_specks(crop):
    """Quita lo suelto y chico que quedó junto a la pieza (el generador a veces
    le pone un numerito debajo)."""
    p = crop.load()
    todo = {(x, y) for y in range(crop.height) for x in range(crop.width) if p[x, y][3]}
    total, blobs = len(todo), []
    while todo:
        stack, blob = [todo.pop()], []
        while stack:
            x, y = stack.pop()
            blob.append((x, y))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in todo:
                        todo.remove(n)
                        stack.append(n)
        blobs.append(blob)
    for blob in blobs:
        if len(blob) < total * 0.02:
            for x, y in blob:
                p[x, y] = (0, 0, 0, 0)
    return crop


def drop_halo(crop):
    """Quita el resplandor: desde afuera se avanza por todo lo claro y poco
    saturado hasta topar con un contorno. La pantalla de la lámpara también es
    clara, pero está encerrada por su línea y no se alcanza."""
    p = crop.load()
    w, h = crop.size
    floor = 0.3 * bg[0] + 0.59 * bg[1] + 0.11 * bg[2] - 30

    def glow(c):
        return c[3] and 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] > floor and max(c[:3]) - min(c[:3]) < 70

    queue = deque((x, y) for y in range(h) for x in range(w)
                  if not p[x, y][3] or x in (0, w - 1) or y in (0, h - 1))
    done = set(queue)
    while queue:
        x, y = queue.popleft()
        if p[x, y][3] and not glow(p[x, y]):
            continue
        p[x, y] = (0, 0, 0, 0)
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= n[0] < w and 0 <= n[1] < h and n not in done:
                done.add(n)
                queue.append(n)
    return crop


crops = []
for b, name in zip(boxes, names):
    crop = rgba.crop(b)
    if name in halo:
        crop = drop_halo(crop)
    crop = drop_specks(crop)
    crops.append(crop.crop(crop.getbbox()))
div = max(c.height for c in crops) / target

pieces = []
for crop, name in zip(crops, names):
    d = crop.height / own[name] if name in own else div
    w, h = max(1, round(crop.width / d)), max(1, round(crop.height / d))
    # Mezcla de vecino más cercano (nitidez) con promedio (menos ruido).
    small = Image.blend(crop.resize((w, h), Image.NEAREST), crop.resize((w, h), Image.BOX), 0.35)
    small.putalpha(crop.resize((w, h), Image.BOX).split()[3].point(lambda v: 255 if v >= 128 else 0))
    pieces.append(small)

# Paleta común a toda la hoja, sin tramado.
strip = Image.new("RGB", (sum(p.width for p in pieces), max(p.height for p in pieces)), bg)
x = 0
for p in pieces:
    strip.paste(p.convert("RGB"), (x, 0), p.split()[3])
    x += p.width
pal = strip.quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def outlined(p):
    flat = p.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
    flat.putalpha(p.split()[3])
    # Contorno de un píxel con el color más oscuro de la pieza.
    dark = min((c for _, c in flat.convert("RGB").getcolors(100000)), key=sum)
    edged = Image.new("RGBA", (flat.width + 2, flat.height + 2), (0, 0, 0, 0))
    edged.alpha_composite(flat, (1, 1))
    e, f = edged.load(), flat.load()
    for yy in range(edged.height):
        for xx in range(edged.width):
            if e[xx, yy][3]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                fx, fy = xx - 1 + dx, yy - 1 + dy
                if 0 <= fx < flat.width and 0 <= fy < flat.height and f[fx, fy][3]:
                    e[xx, yy] = dark + (255,)
                    break
    return edged


done = [outlined(p) for p in pieces]
# Cada pieza suelta va recortada; la hoja las alinea por abajo en celdas iguales.
cw, ch = max(p.width for p in done) + 2, max(p.height for p in done) + 2
sheet = Image.new("RGBA", (cw * len(done), ch), (0, 0, 0, 0))
for i, (p, name) in enumerate(zip(done, names)):
    p.save(f"{out}/{name}.png")
    sheet.alpha_composite(p, (i * cw + (cw - p.width) // 2, ch - 1 - p.height))
sheet.save(f"{out}/hoja.png")
print(f"divisor {div:.2f} celda {cw}x{ch}", {n: p.size for n, p in zip(names, done)})
