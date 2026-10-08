# Entrega: calle a los lados de la oficina

De: ArtDesigner · Para: Orquestador · 2026-10-08

LISTO

Salió todo, incluidos los opcionales (cebra, taxi, farola con su luz y árbol). 42 archivos nuevos en `assets/herdr-oficina/sprites/`, pintados con `herramientas/pintar_nuevos.py` (sección "calle"), con los 16 colores del pack.

## Suelo

| Archivo | Tamaño | Cómo se repite |
| --- | --- | --- |
| `piso-acera.png` | 72 × 24 | hacia los cuatro lados; losas de 24 × 12 cuatrapeadas |
| `piso-asfalto.png` | 72 × 24 | hacia los cuatro lados; oscuro con grano suelto |
| `calle-raya.png` | 4 × 24 | hacia abajo; tramo amarillo de 14 y hueco de 10, lo demás transparente |
| `acera-bordillo.png` | 4 × 24 | hacia abajo; de izquierda a derecha: 2 px de cara de arriba clara (junta cada 12), 1 de escalón, 1 de sombra |
| `calle-cebra.png` | 8 × 14 | a lo ancho; franja blanca de 4 y hueco de 4 |

El bordillo está pintado con la acera a su izquierda y el asfalto a su derecha. Para el otro lado de la calle, con espejo.

## Vehículos

Todos de 24 de ancho. Cada uno trae la pieza quieta y su hoja `-anim` de 2 cuadros en fila, del mismo tamaño de cuadro.

| Pieza | `-frente` | `-atras` | Qué es |
| --- | --- | --- | --- |
| `auto-rojo` | 24 × 33 | 24 × 32 | sedán |
| `auto-azul` | 24 × 32 | 24 × 30 | compacto, sin cajuela |
| `camioneta` | 24 × 41 | 24 × 40 | van de reparto blanca, con logo verde en el techo |
| `taxi` | 24 × 33 | 24 × 32 | amarillo, techo blanco, letrero y franjas de cuadros |

- De frente (viene): techo, parabrisas, cofre y la cara con faros amarillos, parrilla y placa.
- De atrás (se va): cofre al fondo, techo, medallón, cajuela y la cara con calaveras rojas y placa. La van enseña sus dos puertas traseras.
- Animación: en el segundo cuadro la carrocería sube 1 px y las llantas se quedan en el piso (se les ve un renglón más). Ritmo: unos 200 ms por cuadro.
- Las hojas `-anim` miden 48 de ancho por el alto de su pieza.
- Carril: con 28 px caben holgados; el mínimo es 26 (los espejos llegan a las orillas del cuadro).

## Peatones

Cuatro, de 17 × 23, igual que `char6` a `char8` (los del pack varían de 13 a 19 de ancho). Colores de pelo y ropa que ningún empleado usa.

| Pieza | Quién es |
| --- | --- |
| `peaton1` | pelo verde azulado, playera morada, mochila roja (se le ve por detrás; de frente, los tirantes) |
| `peaton2` | de traje oscuro, corbata roja y portafolio naranja en la mano |
| `peaton3` | persona mayor: pelo blanco, suéter rojo, falda y bastón |
| `peaton4` | gorra verde, audífonos azules, sudadera blanca |

Por cada uno:

- `peatonN.png` — de pie, de frente (17 × 23)
- `peatonN-atras.png` — de pie, de espaldas (17 × 23; no se pedía, pero de ahí sale la caminata)
- `peatonN-camina.png` — 4 cuadros en fila (68 × 23)
- `peatonN-atras-camina.png` — 4 cuadros en fila (68 × 23)

Mismo formato que `char1-camina.png`: pie izquierdo arriba, apoyo con el cuerpo 1 px abajo, pie derecho arriba, apoyo. Ritmo: unos 200 a 220 ms por cuadro.

## Mobiliario de la acera

| Archivo | Tamaño | Qué estorba el paso |
| --- | --- | --- |
| `buzon.png` | 10 × 17 | su pie: 6 px de ancho por las 3 filas de abajo |
| `hidrante.png` | 9 × 12 | 9 px de ancho por las 3 filas de abajo |
| `farola.png` | 21 × 40 | su base: 7 px de ancho (columnas 7 a 13) por las 4 filas de abajo |
| `farola-luz.png` | 21 × 40 | nada: se encima sobre `farola.png` de noche |
| `arbol-acera.png` | 18 × 28 | el alcorque: 14 px de ancho por las 5 filas de abajo |

- Buzón azul con su cara de arriba clara, ranura y etiqueta. Hidrante rojo con tapa, tomas a los lados y al frente.
- Farola: farol con tapa y cristal, poste y base. El cuadro mide 21 de ancho para que quepa el halo; el poste va al centro (columna 10).
- `farola-luz` lleva el cristal encendido y un halo amarillo **semitransparente** (dos anillos). Es la única pieza con transparencia parcial; todo lo demás es color sólido de la paleta.

## Verificado

- Muestra: `docs/tareas/vistas/calle.png`. Arriba, la franja armada de día y la misma oscurecida de noche: edificio con puerta y `char1`, acera, bordillo, dos carriles con raya, cebra, dos coches bajando y dos subiendo, cuatro peatones, buzón, hidrante, farola y árbol. Abajo, cada pieza suelta y los cuadros de todas las animaciones.
- En movimiento: `docs/tareas/vistas/calle.gif` (día y noche).
- Comparé por suma toda la carpeta antes y después: no cambió ningún archivo que ya existiera. `pintar_nuevos.py` pinta ahora 211 piezas.
- No toqué `armar_oficina.py`, `src/renderer/oficina/` ni nada de código.

## Lo que conviene mirar

- **De noche** los coches se distinguen bien del asfalto. Los peatones de pelo oscuro (`peaton2`, y `peaton4` de espaldas) se apagan bastante sobre la acera; se salvan por la ropa.
- **Los coches son cajas con cabina**: se leen como coche por techo, cristal, cofre y luces, pero no tienen curvas. A este tamaño no dio para más.
- **El techo del rojo es naranja** y el del azul celeste: es el tono claro de cada color en la paleta, como en los sofás.
- **`peaton3` de espaldas** es una bola blanca de pelo sobre el suéter; se reconoce por el bastón.
- **Al caminar**, el portafolio y el bastón se encogen 1 px en un cuadro, porque suben con la pierna de ese lado. Se ve como balanceo.
- La franja de edificio de la muestra (alfombra azul y tira crema) es relleno mío para dar escala, no una pieza.
- No hay peatones ni coches de lado: todo sube o baja, como pedía la tarea.
