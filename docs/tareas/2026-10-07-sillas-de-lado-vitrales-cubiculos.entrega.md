# Entrega: sillas y sofás de lado, vitrales sin lo café, prop de cubículo

De: ArtDesigner · Para: Orquestador · 2026-10-07
Tarea: `docs/tareas/2026-10-07-sillas-de-lado-vitrales-cubiculos.md`

LISTO

Las cuatro partes están hechas y la imagen de prueba quedó abierta al usuario: (a) mesa con silla de lado a cada lado y sofá y sillón de lado frente a frente, (b) pared junto al ventanal nuevo con su puerta, (c) dos hileras de tres escritorios frente a frente con mamparas y gente sentada.

**Documento de Pencil:** antes de generar confirmé que el activo era `C:/Users/artur/Documents/DisenosPencil/oirquestai.pen`. La hoja quedó ahí, en el frame `Sprite/Sillas y sofás - De lado`. Las partes 3 y 4 no usaron generador.

Todas las rutas son bajo `assets/sprites/`.

## 1 y 2. Sillas y sofás de lado

En `generados/cafeteria/`, todos mirando a la derecha (la izquierda sale con espejo):

| Archivo | Tamaño | Origen |
| --- | --- | --- |
| `silla_madera_lado.png` | 38 × 72 | armada con los tonos de `silla_madera` (`herramientas/muebles_de_lado.py`) |
| `sofa_lado.png` | 66 × 76 | generador |
| `sillon_lado.png` | 61 × 74 | generador |
| `silla_madera_atras.png` | 40 × 74 | generador; extra, no pedida |

La silla empata exacto con la de frente (38 × 72).

La hoja original del generador y su `hoja.png` están en `generados/cafeteria_lados/`.

## 3. Vitrales sin lo café

Reemplazados con el mismo nombre y tamaño en `generados/ventanales/`:

| Archivo | Tamaño |
| --- | --- |
| `tramo.png`, `tramo_izq.png`, `tramo_der.png` | 48 × 144 |
| `columna.png` | 48 × 48 |
| `poste.png` | 24 × 144 |
| `puerta_alta.png` | 96 × 144 |
| `puerta_alta_1.png` | 48 × 144 |

El riel de arriba y el filo de abajo pasaron de madera café al gris azulado del marco, conservando luz y sombra. Alto 144 y grosor 24 sin cambio. Herramienta: `herramientas/marco_metal.py`.

No toqué `ventanales/largo`, `corto`, `vertical`, `puerta` ni `esmerilado`: esos siguen con madera.

## 4. Mamparas de cubículo

En `generados/cubiculos/`, con la tela y el marco del kit (`herramientas/mamparas.py`):

| Archivo | Tamaño | Qué es |
| --- | --- | --- |
| `mampara_fondo.png` | 96 × 34 | corre entre las dos hileras; una por escritorio, se repite sin costura |
| `mampara_lado.png` | 8 × 108 | entre vecinos de la hilera de abajo: tapa de 46 px y canto de 62 px hasta el piso |
| `mampara_lado_atras.png` | 8 × 46 | entre vecinos de la hilera de arriba: solo la tapa |

### Qué significa B

`B` es la **base del escritorio de la hilera de abajo**: la coordenada `y` (en píxeles del mundo) del borde inferior de `puesto/escritorio.png`, que es el borde inferior de su casilla. En esa hilera la gente va de espaldas a la cámara.

El escritorio de la hilera de arriba (`puesto_lados/escritorio_atras.png`, gente de frente a la cámara) tiene su base una casilla más arriba: `B − 48`.

Todas las medidas de abajo son la `y` de la **base del sprite** (su borde inferior); el sprite crece hacia arriba desde ahí. Restar es subir en pantalla.

### Dónde apoyo cada mampara

| Pieza | x | Base del sprite | Orden de dibujo |
| --- | --- | --- | --- |
| `mampara_fondo` | centro de cada escritorio | `B − 62` | después de escritorio y monitor de arriba, antes del escritorio de abajo |
| `mampara_lado` | la unión entre dos escritorios | `B + 10` | después del escritorio y monitor de abajo |
| `mampara_lado_atras` | la unión entre dos escritorios | `B − 96` | después del escritorio de arriba, antes de `mampara_fondo` |

"La unión entre dos escritorios" es el borde de casilla donde se tocan dos escritorios vecinos; el sprite de 8 px va centrado en ese borde. En la prueba puse también una en cada extremo de la hilera.

Con eso la mampara del fondo queda parada en la orilla trasera del escritorio de abajo, 34 px de alto (de `B − 96` a `B − 62`): tapa el frente del escritorio de arriba y el tercio inferior de su monitor, y deja ver cabeza y hombros de quien está detrás. Las de lado van en la unión y no tapan a nadie.

### Dónde puse escritorio, monitor, silla y persona en la prueba

Todo centrado en `x` sobre el centro de su escritorio.

**Hilera de abajo** (gente de espaldas), con las constantes que ya usa `scene.ts`:

| Pieza | Sprite | Base |
| --- | --- | --- |
| escritorio | `puesto/escritorio.png` | `B` |
| monitor | `puesto/monitor.png` | `B − 38` (`MONITOR_UP`) |
| persona | `<nombre>/work/sentado_espalda.png` | `B + 62` (`SEATED_DOWN`) |
| silla | `puesto/silla_atras.png` | `B + 70` (`CHAIR_DOWN`) |

**Hilera de arriba** (gente de frente):

| Pieza | Sprite | Base | Respecto a su escritorio (`B − 48`) |
| --- | --- | --- | --- |
| silla | `puesto/silla_frente.png` | `B − 130` | 82 arriba |
| persona | `<nombre>/work/sentado_frente.png` | `B − 112` | 64 arriba |
| escritorio | `puesto_lados/escritorio_atras.png` | `B − 48` | 0 |
| monitor | `puesto/monitor_atras.png` | `B − 82` | 34 arriba |

Orden en la hilera de arriba: silla, persona, escritorio, monitor (el escritorio tapa las piernas de la persona).

Orden completo que usé, de atrás hacia adelante:

1. silla, persona, escritorio y monitor de la hilera de arriba
2. `mampara_lado_atras`
3. `mampara_fondo`
4. escritorio y monitor de la hilera de abajo
5. `mampara_lado`
6. persona y silla de la hilera de abajo

## Lo que no quedó fino

- **Sofá y sillón de lado son casi iguales** entre sí salvo el color: un sofá visto de canto es un brazo y un respaldo. Y son perfil puro, sin la franja de arriba que sí tienen los de frente.
- **Primero los armé a mano y quedaron planos**; los descarté y usé los del generador en cuanto el `.pen` estuvo activo.
- **La silla de lado es más sencilla** que la de frente: no tiene veta ni barrotes.
- **Las mamparas de lado se ven como postes grises** de 8 px; son el canto del panel, pero a ese ancho no se lee la tela.
- Verificado en imagen compuesta por script, no dentro de la app.

## Sin tocar

Nada fuera de `assets/` (salvo este archivo, pedido aparte). Fuera de `ventanales/` no reemplacé ninguna pieza existente.
