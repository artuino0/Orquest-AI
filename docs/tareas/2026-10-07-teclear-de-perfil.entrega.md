# Entrega: teclear de perfil y mampara entre escritorios de lado

De: ArtDesigner · Para: Orquestador · 2026-10-07
Tarea: `docs/tareas/2026-10-07-teclear-de-perfil.md`

LISTO

Las dos partes están hechas. La prueba quedó abierta al usuario como GIF: dos bloques, cada uno con una columna de 3 puestos mirando a la derecha frente a otra de 3 mirando a la izquierda, gente tecleando de perfil y la mampara en medio.

**Pencil:** confirmé que el documento activo era `C:/Users/artur/Documents/DisenosPencil/oirquestai.pen`. No generé nada: las dos partes salen de piezas que ya existían.

Todas las rutas son bajo `assets/sprites/`.

## 1. Teclear de perfil

Para los siete, `generados/<nombre>/work/sentado_lado.png`: hoja horizontal de 4 cuadros, mirando a la derecha. La izquierda sale con espejo. Cada cuadro mide lo mismo que `<nombre>/sit.png`, así que no brinca al pasar de quieto a tecleando.

| Empleado | Cuadro | Hoja |
| --- | --- | --- |
| `rizos` | 58 × 109 | 232 × 109 |
| `jefe` | 60 × 113 | 240 × 113 |
| `bob` | 59 × 117 | 236 × 117 |
| `coleta` | 71 × 110 | 284 × 110 |
| `gorra` | 73 × 115 | 292 × 115 |
| `rapada` | 55 × 110 | 220 × 110 |
| `trenza` | 56 × 112 | 224 × 112 |

Ojo: el ancho del cuadro cambia de un empleado a otro (de 55 a 73), porque `sit.png` ya venía así.

Cuadros: sube una mano 2 px, cabecea 1 px, sube la otra mano 2 px, quieto. Es el mismo dibujo de `sit.png`.

También dejé `generados/<nombre>/work/<nombre>_work_lado.aseprite` (etiqueta `work_side`, 220 ms por cuadro).

Herramienta: `herramientas/sentado_lado.py <sit.png> <hoja.png>`. Encuentra las manos por el color de piel de la cara.

## 2. Mampara entre escritorios de lado

En `generados/cubiculos/`, con el material de `mampara_fondo` (`herramientas/mamparas.py`):

| Archivo | Tamaño | Qué es |
| --- | --- | --- |
| `mampara_vertical.png` | 8 × 96 | la tapa del panel, vista desde arriba. Un tramo por puesto; sin borde arriba ni abajo, se repite hacia abajo sin costura |
| `mampara_vertical_fin.png` | 8 × 66 | el remate de abajo: el canto del panel, hasta el piso |

Mide de alto lo mismo que `mampara_fondo`: 34 px sobre la cubierta del escritorio. No tapa a nadie; la gente queda a los lados.

Al volver a correr `mamparas.py` verifiqué por suma que `mampara_fondo`, `mampara_lado` y `mampara_lado_atras` quedaron idénticas. No reemplacé ninguna pieza.

## Dónde apoyo cada cosa

Dos letras:

- **`D`** = la `y` de la base del escritorio de lado: el borde inferior de la casilla de abajo de las dos que ocupa (`escritorio_lado_izq/der` mide 51 × 106 y ocupa 1 casilla de ancho × 2 de fondo). El siguiente puesto de la columna va en `D + 96`.
- **`cx`** = la `x` del borde de casilla donde se tocan los dos escritorios que se dan la cara.

Todas las medidas son la base del sprite (su borde inferior) y la `x` de su centro. Restar en `y` es subir.

**Columna izquierda** (mira a la derecha):

| Pieza | Sprite | x | Base |
| --- | --- | --- | --- |
| silla | `puesto_lados/silla_lado.png` | `cx − 86` | `D − 26` |
| persona | `<nombre>/work/sentado_lado.png` | `cx − 76` | `D − 20` |
| escritorio | `puesto_lados/escritorio_lado_izq.png` | `cx − 24` | `D` |
| monitor | `puesto_lados/monitor_lado_izq.png` | `cx − 16` | `D − 50` |

**Columna derecha** (mira a la izquierda): lo mismo en espejo.

| Pieza | Sprite | x | Base |
| --- | --- | --- | --- |
| escritorio | `puesto_lados/escritorio_lado_der.png` | `cx + 24` | `D` |
| monitor | `puesto_lados/monitor_lado_der.png` | `cx + 16` | `D − 50` |
| persona | `<nombre>/work/sentado_lado.png`, con espejo | `cx + 76` | `D − 20` |
| silla | `puesto_lados/silla_lado.png`, con espejo | `cx + 86` | `D − 26` |

**Mampara:**

| Pieza | x | Base | Cuándo |
| --- | --- | --- | --- |
| `mampara_vertical` | `cx` | `D − 44` | una por cada puesto de la columna |
| `mampara_vertical_fin` | `cx` | `D` | solo en el último puesto de la columna (el de más abajo) |

El tramo de un puesto va de `D − 140` a `D − 44`, y el del siguiente empieza justo ahí, así que la tapa queda continua. El remate va de `D − 66` a `D` y tapa lo que sobra del último tramo.

**Orden de dibujo en cada puesto**, de atrás hacia adelante: silla, persona, escritorio, monitor, `mampara_vertical`; y al final de la columna, `mampara_vertical_fin`. Ordenando por base sale solo, salvo el monitor y la mampara, que van después de su escritorio aunque su base sea más alta.

## Sobre "muy despegados del escritorio"

Acerqué a la persona: con `cx − 76` las manos llegan a la orilla del escritorio (antes, en mi primera prueba de puestos de lado, quedaba 8 px más lejos). Si en la app aún se ve separada, se puede bajar a `cx − 72`.

## Lo que hay que saber

- **Las personas de una misma columna se enciman un poco.** Cada puesto mide 96 px de fondo y un empleado sentado mide de 109 a 117 de alto: la cabeza del de abajo tapa entre 13 y 21 px de los pies del de arriba. Con 96 px por puesto no hay forma de evitarlo desde el arte; para que no se toquen haría falta 3 casillas por puesto (144 px) o aceptar ese traslape.
- **El tecleo es sutil**: 2 px en la mano y 1 px en la cabeza. Revisé los cuadros fijos, no el GIF en movimiento.
- **La mampara vertical se ve como una franja gris de 8 px**: es la tapa del panel vista desde arriba; a ese ancho no se lee la tela.
- **Los dos monitores de lado casi no se distinguen** entre sí: de canto son una placa delgada.
- Verificado en imagen compuesta por script, no dentro de la app.

## Sin tocar

Nada fuera de `assets/` salvo este archivo. Ninguna pieza existente reemplazada.
