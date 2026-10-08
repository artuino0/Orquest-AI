# Entrega: impresora grande de oficina

De: ArtDesigner · Para: Orquestador · 2026-10-08

LISTO

"Lexar" lo tomé como Lexmark: multifuncional de piso. No me suena a otra cosa.

## Archivos

En `assets/herdr-oficina/sprites/`:

| Archivo | Tamaño | Qué es |
| --- | --- | --- |
| `impresora-grande.png` | 18 × 28 | de frente, con una hoja ya en la bandeja |
| `impresora-grande-anim.png` | 72 × 28 (4 cuadros de 18 × 28) | imprimiendo |
| `impresora-grande-lado.png` | 14 × 29 | de lado, mirando a la derecha (el frente queda a la derecha) |

Pintadas a mano con `herramientas/pintar_nuevos.py` (sección "impresora grande"), con los 16 colores del pack y los tonos de `vendymachine1` e `impresora1`.

## Qué se le reconoce (de frente, de arriba abajo)

- Alimentador de hojas, más angosto, sobre la tapa (filas 0 a 4).
- Tapa del escáner: su cara de arriba en claro (filas 5 a 9). Es lo que le quita lo de pegatina.
- Panel de control con pantallita azul, luz verde y dos botones (filas 10 a 12).
- Bandeja de salida: hueco oscuro con la hoja blanca (filas 13 a 16).
- Tres cajones de papel con su jalador (filas 18 a 26).

De lado: el alimentador y la tapa se ven más largos (el ancho de la máquina corre hacia el fondo), y a la derecha asoman el brillo de la pantallita y la hoja saliendo de la bandeja. En el costado, tres rejillas.

## Tamaño frente a lo demás

- Persona de pie (`char1`): 23 de alto. La impresora mide 28: le llega arriba de la cabeza en pantalla porque incluye su cara de arriba; el frente solo (de la fila 10 al piso) mide 18.
- Expendedora: 24 × 34. La impresora es más baja y más angosta.
- Mesa (`tablesmall`): 16 de alto. La impresora es más alta.
- Librero: 31. La impresora es más baja.

## Cuánto estorba el paso

- De frente: 18 px de ancho por las 6 filas de abajo.
- De lado: 14 px de ancho por las 8 filas de abajo.

Lo de arriba de eso es altura de la máquina: una persona puede pasar por detrás y quedar tapada, no bloqueada.

## Animación

4 cuadros en fila, del mismo tamaño que la quieta (no brinca):

1. bandeja vacía, luz y pantallita encendidas
2. la hoja asoma al fondo de la bandeja, luz normal
3. la hoja a medio salir, luz y pantallita encendidas
4. la hoja descansa en la bandeja, luz normal (igual a la quieta)

Ritmo que se ve bien: 250 ms por cuadro y el último sostenido unos 900 ms antes de repetir. Si se quiere que imprima varias hojas seguidas, repetir 1 a 3 y dejar el 4 al final.

## Verificado

- Muestra: `docs/tareas/vistas/impresora-grande.png` (piso azul del pack y piso de madera; arriba: persona, impresora de frente, de lado, expendedora, garrafón y mesa con la impresora chica; abajo: los cuatro cuadros y la de lado con espejo).
- En movimiento: `docs/tareas/vistas/impresora-grande.gif`.
- Comparé por suma toda la carpeta antes y después: no cambió ningún archivo que ya existiera. `pintar_nuevos.py` pinta ahora 169 piezas.
- No toqué `armar_oficina.py`, `src/renderer/oficina/` ni nada de código.

## Lo que conviene mirar

- La de lado es la más sosa: el costado es un panel liso con rejillas. Se reconoce por el alimentador, la tapa y la hoja que asoma.
- No hay animación de lado; solo la de frente imprime.
- Es toda gris, como la expendedora. Sobre piso gris (`piso-concreto`) se va a perder un poco.

## Laptops

Quedan sin usar, como pidió el usuario. No las borré: `laptop-frente`, `laptop-frente-anim`, `laptop-atras`, `laptop-lado` siguen en la carpeta y en el script. Si hay que quitarlas, lo hago cuando se pida.
