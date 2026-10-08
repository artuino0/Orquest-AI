# Impresora grande de oficina

## Contexto

La oficina de píxel (`src/renderer/oficina.html`, armada con `assets/herdr-oficina/herramientas/armar_oficina.py`) solo tiene la impresora chica de escritorio del pack (`impresora1.png`). El usuario pidió, textual:

> "que diseñe una impresora de las grandes com las lexar"

Se entiende una multifuncional de piso de oficina, del tipo de las Lexmark grandes: mueble alto que va en el suelo, no sobre una mesa. Si "lexar" te suena a otra cosa, dilo en la entrega en vez de adivinar.

## Qué hacer

Pintar a mano, en el estilo del pack Pixel Office (mismas 16 colores, vista superior a 45°, con `pintar_nuevos.py`), una impresora multifuncional de piso:

1. `impresora-grande.png` — vista de frente. Que se le reconozcan: tapa del escáner con alimentador de hojas arriba, panel de control con pantallita, bandeja de salida con una hoja, y dos o tres cajones de papel abajo. Alto parecido al de la expendedora o el garrafón (más alta que una mesa, más baja que un librero); ancho de unos 16 a 20 px.
2. `impresora-grande-anim.png` — imprimiendo: hoja de cuadros en fila, mismo tamaño de cuadro que la quieta (para que no brinque). De 3 a 4 cuadros: la hoja va saliendo a la bandeja y parpadea la luz del panel.
3. `impresora-grande-lado.png` — vista de lado (mirando a la derecha; la página la espeja), para ponerla contra una división de canto.

Tiene que verse su cara de arriba (la tapa del escáner), como en las maquinitas y los servidores ya aprobados: sin eso "se ve como pegatina".

## Qué no tocar

- Ninguna pieza existente del pack ni las ya aprobadas.
- `armar_oficina.py`, `src/renderer/oficina/` y el resto del código: yo la coloco en la oficina cuando el usuario la apruebe.

## Cómo verificar

- Muestra en `docs/tareas/vistas/impresora-grande.png`: las tres piezas ampliadas sobre piso (el azul del pack y el de madera), junto a una persona de pie (`char1.png`), la expendedora y la impresora chica, para comparar tamaño.
- Los cuadros de la animación, uno junto a otro, en la misma muestra.

## Entrega

Reporte en `docs/tareas/2026-10-08-impresora-grande.entrega.md`: archivo, tamaño, cuántos px de su base estorban el paso, cuadros de la animación y a qué ritmo se ve bien. En la terminal contesta `LISTO` o `BLOQUEADO: <motivo>`.
