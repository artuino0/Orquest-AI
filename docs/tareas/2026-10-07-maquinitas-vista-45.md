# Corrección: las maquinitas se ven como pegatinas

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que dijo el usuario

> "las maquinitas no fueron aprobadas se ven como pegatinas recuerda que hicimos la vista top 45"

## Qué revisé

Comparé `assets/herdr-oficina/sprites/maquinita-azul.png` y `maquinita-roja.png` (16×30) contra muebles del pack que sí están aprobados. Dejé la comparación en `docs/tareas/vistas/maquinitas-rechazadas-junto-al-pack.png` (a 8×).

- `vendymachine1` y `librero-alv` tienen **cara de arriba**: una franja clara en lo alto que es la tapa vista desde arriba, y debajo el frente. Por eso se leen como un mueble con volumen.
- Las maquinitas son frente puro: marquesina, pantalla, tablero y base en un solo plano, sin tapa. El tablero de controles, que en una maquinita sobresale e inclina hacia el jugador, está dibujado como una franja plana. Por eso parecen pegatinas.

Es la regla que el usuario ya te había marcado: todo se ve a 45° desde arriba; sin la superficie de arriba se ve plano.

## Qué hacer

Repintar las dos maquinitas con la vista a 45°, como `vendymachine1`:

- **Tapa arriba**: franja con la cara superior del mueble, más clara que el frente.
- **Tablero de controles con volumen**: que sobresalga del cuerpo, con su cara de arriba visible (ahí van palanca y botones) y un canto debajo.
- Marquesina y pantalla en el frente, bajo la tapa.
- Mismo ancho de 16 px si cabe; el alto puede crecer lo que pida la tapa. Dime el tamaño final.
- Misma paleta y contorno del pack.

Rehaz también `maquinita-azul-anim.png` y `maquinita-roja-anim.png` sobre el dibujo nuevo.

Revisa de paso, con el mismo criterio, las demás piezas nuevas que hayas pintado en esta tanda: si alguna quedó sin cara de arriba, corrígela y dilo.

## Qué no tocar

- Los sprites originales del pack. Nada fuera de `assets/`.
- Sin generador: pintado a mano con `herramientas/pintar_nuevos.py`.

## Cómo verificar

Imagen a 8× con las dos maquinitas nuevas junto a `vendymachine1`, `librero-alv` y un personaje de pie y otro de espaldas frente a la maquinita. Ábresela al usuario: es él quien aprueba.

## Entrega

Contesta `LISTO` (archivos, tamaño final, qué otras piezas corregiste) o `BLOQUEADO: <motivo>`.
