"""Arma la oficina de Orquest con las piezas sueltas del pack y las nuevas.

La oficina de herdr-oficina es una escena fija de 256×224 ya compuesta. Esta
es más grande y con cuartos: se describe aquí abajo (qué piso, qué pared y qué
mueble va dónde) y de ahí salen los archivos que usa la página, en `escena/`:

  fondo.png     pared, pisos y muebles; transparente donde va el cielo y en
                los vidrios, que se pintan aparte según la hora
  muebles.png   solo muebles y divisiones (la página recorta de aquí lo que
                tapa a quien pasa por detrás)
  vidrios.png   solo los vidrios de ventanas y puertas
  mapa.json     por dónde se camina, en celdas de 4 px
  escena.json   tamaño, puestos (silla y computadora), cafetera, reloj,
                mascotas, tapas (qué tapa a quién) y piezas animadas

Uso: python armar_oficina.py        (desde cualquier lado; escribe en ../escena)
"""
import json
import os
from PIL import Image, ImageOps

AQUI = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(AQUI, '..', 'sprites')
SALIDA = os.path.join(AQUI, '..', 'escena')

W, H = 480, 356
CIELO = 48  # arriba de esto se ve el cielo
PISO = 112  # aquí acaba la pared del fondo y empieza el piso
CELDA = 4
CORTE = 252  # la oficina tiene dos franjas de cuartos; aquí va la división
X1, X2 = 112, 368  # divisiones de arriba abajo

BORDE, TAPA, CARA, SOMBRA = (0x33, 0x3C, 0x57, 255), (0xF4, 0xF4, 0xF4, 255), (0x94, 0xB0, 0xC2, 255), (0x56, 0x6C, 0x86, 255)

_cache = {}


def img(nombre):
    if nombre not in _cache:
        _cache[nombre] = Image.open(os.path.join(SPRITES, nombre + '.png')).convert('RGBA')
    return _cache[nombre]


fondo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
muebles = Image.new('RGBA', (W, H), (0, 0, 0, 0))
vidrios = Image.new('RGBA', (W, H), (0, 0, 0, 0))
bloqueado = set()  # celdas por donde no se camina
puestos = []
tapas = []  # [x, y, w, h, base]: pedazo de muebles.png que tapa a quien tenga los pies más arriba que `base`
animados = []
postes = []

# Azules del vidrio en el pack: la página los cambia de color según la hora.
VIDRIO = {(0x29, 0x36, 0x6F), (0x3B, 0x5D, 0xC9), (0x41, 0xA6, 0xF6), (0x73, 0xEF, 0xF7)}


def bloquear(x, y, w, h):
    for cy in range(max(0, y) // CELDA, min(H, y + h + CELDA - 1) // CELDA):
        for cx in range(max(0, x) // CELDA, min(W, x + w + CELDA - 1) // CELDA):
            bloqueado.add((cx, cy))


def piso(nombre, x0, y0, x1, y1):
    """Llena el rectángulo repitiendo la loseta, alineada al origen de la escena."""
    t = img(nombre)
    parche = Image.new('RGBA', (x1 - x0, y1 - y0))
    for y in range(-(y0 % t.height), y1 - y0, t.height):
        for x in range(-(x0 % t.width), x1 - x0, t.width):
            parche.paste(t, (x, y), t)
    fondo.alpha_composite(parche, (x0, y0))


def pared(nombre, x0, x1, arriba=None):
    """Pared del fondo: zoclo oscuro arriba y tres hiladas. `arriba`: tramo de las dos de arriba, si la de abajo lleva lambrín."""
    franja = Image.new('RGBA', (x1 - x0, PISO - CIELO), SOMBRA)
    alto = img(nombre).height
    ultima = 4 + 2 * alto
    for y in range(4, PISO - CIELO, alto):
        t = img(arriba) if arriba and y < ultima else img(nombre)
        for x in range(0, x1 - x0, t.width):
            franja.paste(t, (x, y), t)
    fondo.alpha_composite(franja, (x0, CIELO))


def pilastra(x):
    """Columna en la pared del fondo, donde arranca una división: remata el cambio de pared."""
    fondo.paste(BORDE, (x - 3, CIELO + 4, x + 3, PISO))
    fondo.paste(TAPA, (x - 2, CIELO + 5, x + 2, PISO))
    fondo.paste(CARA, (x + 1, CIELO + 5, x + 2, PISO))


def pon(nombre, x, y, espejo=False, fondo_px=None, pisa=True, capa=True, anim=None, juego=False):
    """Pone un mueble. `fondo_px`: cuánto de su parte de abajo estorba el paso. `anim`: (cuadros, ms por cuadro) de su hoja `<nombre>-anim`. `juego`: solo se anima mientras alguien lo usa."""
    s = img(nombre)
    if espejo:
        s = ImageOps.mirror(s)
    fondo.alpha_composite(s, (x, y))
    if capa:
        muebles.alpha_composite(s, (x, y))
    if pisa:
        f = min(s.height, 12) if fondo_px is None else fondo_px
        bloquear(x, y + s.height - f, s.width, f)
        if capa:
            tapas.append([x, y, s.width, s.height, y + s.height])
    if anim:
        hoja = img(nombre + '-anim')
        assert hoja.width == s.width * anim[0], f'{nombre}-anim: {hoja.width} px no son {anim[0]} cuadros de {s.width}'
        animados.append({'archivo': nombre + '-anim.png', 'x': x, 'y': y, 'w': s.width, 'h': s.height,
                         'cuadros': anim[0], 'ms': anim[1], 'z': y + s.height if pisa else 1, 'juego': juego})
    return s


def vidrio(nombre, x, y, espejo=False):
    """Ventana o puerta en la pared: sus vidrios van a su propia imagen y dejan hueco en el fondo."""
    s = img(nombre)
    if espejo:
        s = ImageOps.mirror(s)
    fondo.alpha_composite(s, (x, y))
    px = s.load()
    for j in range(s.height):
        for i in range(s.width):
            c = px[i, j]
            if c[3] and c[:3] in VIDRIO:
                vidrios.putpixel((x + i, y + j), c)
                fondo.putpixel((x + i, y + j), (0, 0, 0, 0))


def tramos(a, b, huecos):
    out = []
    for h0, h1 in sorted(huecos):
        out.append((a, h0))
        a = h1
    out.append((a, b))
    return [(p, q) for p, q in out if q > p]


def muro_bajo(nombre, x0, x1, y, huecos=()):
    """División baja, de izquierda a derecha, con huecos para pasar. Cada punta que da a un hueco remata en poste."""
    t = img(nombre)
    for a, b in tramos(x0, x1, huecos):
        tira = Image.new('RGBA', (b - a, t.height))
        for x in range(0, b - a, t.width):
            tira.paste(t, (x, 0), t)
        fondo.alpha_composite(tira, (a, y))
        muebles.alpha_composite(tira, (a, y))
        bloquear(a, y, b - a, t.height)
        tapas.append([a, y, b - a, t.height, y + t.height])
        if a > x0:
            postes.append((a + 3, y + t.height + 1))
        if b < x1:
            postes.append((b - 3, y + t.height + 1))


def muro_canto(x, y0, y1, huecos=()):
    """División vista de canto (corre de arriba abajo): se le ve la tapa. Remata en poste en cada punta."""
    for a, b in tramos(y0, y1, huecos):
        for capa in (fondo, muebles):
            capa.paste(BORDE, (x, a, x + 4, b))
            capa.paste(TAPA, (x + 1, a, x + 3, b))
        # Estorba un poco más que su grosor: quien pasa junto no se le encima.
        bloquear(x - 3, a, 10, b - a)
        if a > y0:
            postes.append((x + 2, a + 14))
        postes.append((x + 2, b))


def poste(cx, base):
    """Poste de 6×14: tapa clara arriba y cara al frente. Va en esquinas, cruces y puntas de las divisiones."""
    x0, y0 = cx - 3, base - 14
    for capa in (fondo, muebles):
        capa.paste(BORDE, (x0, y0, x0 + 6, base))
        capa.paste(TAPA, (x0 + 1, y0 + 1, x0 + 5, y0 + 5))
        capa.paste(CARA, (x0 + 1, y0 + 5, x0 + 5, base - 2))
        capa.paste(SOMBRA, (x0 + 1, base - 2, x0 + 5, base - 1))
    bloquear(x0, base - 6, 6, 6)
    tapas.append([x0, y0, 6, 14, base])


# Módulo de cubículo con dos puestos que se dan la espalda, tal como viene
# armado en la oficina original: se recorta de su capa de muebles.
_mitad = img('muebles').crop((145, 131, 185, 163))
# El puesto derecho del original trae la silla pegada al escritorio y quien se
# sienta queda metido bajo la mesa y la computadora. Se usa el izquierdo, que
# deja su hueco, y su espejo.
# La silla no va pintada: la pone la página, pegada al escritorio si el puesto
# no es de nadie y separada cuando alguien lo ocupa. Donde estaba se repone lo
# que tapaba (bandera o panel).
SILLA_EN = (5, 8)
_silla, _panel, _bandera = img('silla6'), img('moduledivider1'), img('banderaindia')
for j in range(_silla.height):
    for i in range(_silla.width):
        if not _silla.getpixel((i, j))[3]:
            continue
        x, y = SILLA_EN[0] + i, SILLA_EN[1] + j
        detras = (0, 0, 0, 0)
        for pieza, (ox, oy) in ((_panel, (0, 1)), (_bandera, (3, 6))):
            if 0 <= x - ox < pieza.width and 0 <= y - oy < pieza.height and pieza.getpixel((x - ox, y - oy))[3]:
                detras = pieza.getpixel((x - ox, y - oy))
        _mitad.putpixel((x, y), detras)
MODULO = Image.new('RGBA', (80, 32))
MODULO.alpha_composite(_mitad, (0, 0))
MODULO.alpha_composite(ImageOps.mirror(_mitad), (40, 0))


def modulo(x, y):
    """Cubículo doble, cerrado con su panel a cada lado: se entra por abajo."""
    lateral = img('divider-cubiculo-vertical')
    for capa in (fondo, muebles):
        capa.alpha_composite(MODULO, (x, y))
        capa.alpha_composite(lateral, (x - 3, y + 1))
        capa.alpha_composite(lateral, (x + 79, y + 1))
    bloquear(x - 3, y + 2, 86, 26)
    # Tapa a quien pasa por el pasillo de arriba; quien está sentado va encima.
    tapas.append([x - 3, y, 86, 30, y + 26])
    puestos.append({'silla': [x + 5, y + 8], 'sillaSprite': 'SILLA6', 'pc': ['COMPUTADORA2', x + 21, y + 7]})
    puestos.append({'silla': [x + 64, y + 8, True], 'sillaSprite': 'SILLA6', 'pc': ['COMPUTADORA2', x + 46, y + 7, True]})


# ── Pisos ────────────────────────────────────────────────────────────────────
B = CORTE  # los cuartos de abajo se acomodan desde aquí
piso('piso-espiga', 0, PISO, X1, CORTE)          # oficina del jefe
piso('floor', X1, PISO, X2, CORTE)               # área de trabajo
piso('piso-loseta', X2, PISO, W, CORTE)          # cafetería
piso('piso-alfombra-azul', 0, CORTE, 152, H)     # sala
piso('piso-madera', 152, CORTE, X2, H)           # juegos
piso('piso-tecnico', X2, CORTE, W, H)            # servidores

# ── Pared del fondo ──────────────────────────────────────────────────────────
pared('pared-lambrin', 0, X1, arriba='wall')
pared('wall', X1, X2)
pared('pared-crema', X2, W)
pilastra(X1)
pilastra(X2)

vidrio('window', 20, 80)
vidrio('window', 150, 80)
vidrio('window', 190, 80)
vidrio('door', 224, 82)
vidrio('door', 240, 82, espejo=True)
vidrio('window', 276, 80)
vidrio('window', 316, 80)
vidrio('window', 440, 80)
pon('reloj', 230, 73, pisa=False, capa=False)
pon('calendario', 256, 86, pisa=False, capa=False)
pon('posticks', 344, 84, pisa=False, capa=False)
pon('cuadroplaya', 56, 74, pisa=False, capa=False)
pon('banderamexico', 84, 76, pisa=False, capa=False)
pon('cuadronaranja', 388, 74, pisa=False, capa=False)
pon('aire-pared', 404, 60, pisa=False, capa=False, anim=(3, 260))

# ── Divisiones ───────────────────────────────────────────────────────────────
# De canto, con la puerta a la altura del primer pasillo entre cubículos.
muro_canto(X1 - 2, PISO, CORTE + 5, huecos=[(146, 174)])
muro_canto(X2 - 2, PISO, CORTE + 5, huecos=[(146, 174)])
muro_canto(X2 - 2, CORTE + 4, H, huecos=[(B + 36, B + 64)])
muro_bajo('pared-lambrin-baja', 0, X1 - 2, CORTE - 5, huecos=[(40, 68)])
muro_bajo('pared-gris-baja', X1 + 2, X2 - 2, CORTE - 5, huecos=[(224, 256)])
muro_bajo('pared-tecnica-baja', X2 + 2, W, CORTE - 5, huecos=[(446, 474)])
for p in postes:
    poste(*p)

# ── Oficina del jefe: mesa grande de madera, de frente ───────────────────────
pon('librero-alv', 84, 87)
pon('plant-decoration', 4, 99)
pon('coach3', 36, 104, fondo_px=10)
pon('silla3-frente', 44, 158, pisa=False, capa=False)
pon('tablelarge', 34, 170, fondo_px=10)
# `pie`: dónde quedan sus pies sentado de frente; la mesa (base en `z`) le tapa las piernas.
JEFE = {'silla': [44, 158], 'frente': True, 'pie': [49, 173], 'pc': ['COMPUTADORA ATRAS', 58, 165], 'z': 186}  # él nos da la cara: su monitor se ve por atrás
pon('plant-decoration', 92, 214)
pon('plant-decoration', 4, 214)

# ── Área de trabajo: doce puestos ────────────────────────────────────────────
for my in (124, 166, 208):
    for mx in (140, 262):
        modulo(mx, my)
pon('plant-decoration', 208, 99)
pon('plant-decoration', 258, 99)
pon('garrafon-de-agua', 122, 101)
pon('impresora1', 344, 108, fondo_px=6)
pon('basura1', 332, 106, fondo_px=6)

# ── Cafetería ────────────────────────────────────────────────────────────────
pon('vendymachine1', 374, 84)
pon('garrafon-de-agua', 400, 101)
pon('tablelarge', 412, 104, fondo_px=10)
pon('cafetera', 430, 96, pisa=False)
pon('taza-de-cafe', 418, 100, pisa=False)
CAFETERA = [432, 126]
pon('librero2', 456, 87)
pon('tablesmall', 400, 184, fondo_px=10)
pon('silla1', 386, 176, fondo_px=6)
pon('silla1', 428, 176, espejo=True, fondo_px=6)
pon('coach1', 440, 216, fondo_px=10)
pon('plant-decoration', 378, 222)

# ── Sala ─────────────────────────────────────────────────────────────────────
pon('coach2', 46, B + 18, fondo_px=10)
pon('coach4-lado', 22, B + 34, fondo_px=22)
pon('coach4-lado', 90, B + 34, espejo=True, fondo_px=22)
pon('tablesmall', 50, B + 48, fondo_px=10)
pon('plant-decoration', 4, B + 12)
pon('librero-alv', 122, B + 6)
pon('plant-decoration', 132, B + 80)

# ── Juegos ───────────────────────────────────────────────────────────────────
pon('maquinita-azul', 166, B + 4, anim=(3, 220), juego=True)
pon('maquinita-roja', 186, B + 4, anim=(3, 260), juego=True)
pon('maquinita-azul', 206, B + 4, anim=(3, 300), juego=True)
pon('billar', 232, B + 50, fondo_px=22)
pon('futbolito', 296, B + 36, fondo_px=28, anim=(2, 320), juego=True)
pon('vendymachine1', 326, B + 4)
pon('coach1', 168, B + 76, fondo_px=10)

# Dónde se para quien va a jugar un rato y qué sale en su globo. `atras`: juega de espaldas a nosotros.
JUEGOS = [
    {'x': 174, 'y': B + 42, 'emoji': '🕹️', 'atras': True},
    {'x': 194, 'y': B + 42, 'emoji': '🕹️', 'atras': True},
    {'x': 214, 'y': B + 42, 'emoji': '🕹️', 'atras': True},
    {'x': 256, 'y': B + 86, 'emoji': '🎱', 'atras': True},
    {'x': 288, 'y': B + 62, 'emoji': '⚽'},
    {'x': 334, 'y': B + 62, 'emoji': '⚽'},
]

# ── Servidores ───────────────────────────────────────────────────────────────
pon('servidor-doble', 380, B + 6, anim=(3, 300))
pon('servidor-doble', 412, B + 6, anim=(3, 380))
pon('aire', 462, B + 52, anim=(3, 240))
pon('servidor-doble', 384, B + 64, anim=(3, 340))
pon('servidor', 420, B + 64, anim=(3, 280))

# ── Por dónde se camina ──────────────────────────────────────────────────────
COLS, FILAS = W // CELDA, H // CELDA
libre = {(cx, cy) for cy in range(FILAS) for cx in range(COLS)
         if cy * CELDA >= PISO + 4 and cy * CELDA < H - 2 and (cx, cy) not in bloqueado}
# Solo vale lo que se alcanza caminando desde la cafetera: así nadie queda mandado a un rincón cerrado.
inicio = (CAFETERA[0] // CELDA, CAFETERA[1] // CELDA)
assert inicio in libre, 'la cafetera quedó sobre un mueble'
alcanzable, cola = {inicio}, [inicio]
while cola:
    cx, cy = cola.pop()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n = (cx + dx, cy + dy)
        if n in libre and n not in alcanzable:
            alcanzable.add(n)
            cola.append(n)
filas = [''.join('.' if (cx, cy) in alcanzable else '#' for cx in range(COLS)) for cy in range(FILAS)]

os.makedirs(SALIDA, exist_ok=True)
fondo.save(os.path.join(SALIDA, 'fondo.png'))
muebles.save(os.path.join(SALIDA, 'muebles.png'))
vidrios.save(os.path.join(SALIDA, 'vidrios.png'))
json.dump({'celda': CELDA, 'columnas': COLS, 'filas': FILAS, 'pisoY': PISO, 'caminable': filas},
          open(os.path.join(SALIDA, 'mapa.json'), 'w', encoding='utf-8'))


def medida(nombre):
    s = img(nombre)
    return {'w': s.width, 'h': s.height, 'archivo': nombre + '.png'}


escena = {
    'ancho': W, 'alto': H,
    'fondo': {
        'archivo': '../escena/fondo.png', 'muebles': '../escena/muebles.png', 'vidrios': '../escena/vidrios.png',
        'nubes': 'nubes.png', 'ancho': W, 'alto': H, 'edificioY': CIELO,
        'mascotas': [{'nombre': 'GATO', 'x': 138, 'y': B + 58, 'espejo': False}, {'nombre': 'PERRO', 'x': 280, 'y': B + 86, 'espejo': False}],
        'reloj': {'x': 230, 'y': 73, 'w': 19, 'h': 6, 'marco': '#1a1c2c', 'digito': '#b13e53'},
    },
    'jefe': JEFE,
    'puestos': puestos,
    'cafetera': CAFETERA,
    'juegos': JUEGOS,
    'tapas': tapas,
    'animados': animados,
    # Personajes que el pack no traía, con su pose sentada.
    'sprites': {f'CHAR{n}': medida(f'char{n}') for n in (6, 7, 8)} | {f'CHAR{n} SENTADO': medida(f'char{n}-sentado') for n in (6, 7, 8)}
    | {'COMPUTADORA ATRAS': medida('computadora-atras'), 'COMPUTADORA FRENTE': medida('computadora-frente')},
}
json.dump(escena, open(os.path.join(SALIDA, 'escena.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'escena {W}x{H} | {len(puestos)} puestos + jefe | {len(alcanzable)} celdas caminables, {len(libre - alcanzable)} cerradas | {len(tapas)} tapas | {len(animados)} animados')
