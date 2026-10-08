# Tarea: servidores y aire acondicionado

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "que haga servidores un aire acondicionado"

## Contexto

Para armar un cuarto de servidores en la oficina. Ya habías hecho una sala así en el estilo antiguo (`assets/sprites/generados/servidores/`): sirve para recordar qué piezas eran, no como estilo. Ahora van en el del pack: pintadas a mano, paleta del pack, vista a 45° desde arriba.

Recuerda lo de las maquinitas: **cada pieza con su cara de arriba**. Sin tapa se ve como pegatina.

## Qué hacer

En `assets/herdr-oficina/sprites/`, con `herramientas/pintar_nuevos.py`, sin generador:

1. **Servidores**
   - `servidor.png`: un rack de frente, con tapa arriba, rejilla o charolas y lucecitas.
   - `servidor-doble.png`: dos racks juntos, si sale bien; si no, basta repetir el sencillo.
   - `servidor-anim.png`: las luces parpadean (2 a 4 cuadros, mismo tamaño de cuadro).
   - De alto parecido a `vendymachine1` (34 px): es un mueble de piso alto.
2. **Aire acondicionado**
   - `aire.png`: una unidad de piso (torre) con rejilla, con su tapa arriba.
   - Si te parece que queda mejor uno de pared (mini split) para colgar como los cuadros, hazlo también como `aire-pared.png` y dime cuál recomiendas.
   - `aire-anim.png`: algo chico que diga que está prendido (una lucecita, las rejillas).

## Qué no tocar

- Los sprites originales del pack ni las piezas ya aprobadas. Nada fuera de `assets/`.

## Cómo verificar

Imagen a 8× con las piezas nuevas junto a `vendymachine1`, `librero-alv` y un personaje, para ver escala y que tengan volumen. Ábresela al usuario: él aprueba.

## Entrega

Contesta `LISTO` (archivos, tamaños, cuadros de cada animación) o `BLOQUEADO: <motivo>`.
