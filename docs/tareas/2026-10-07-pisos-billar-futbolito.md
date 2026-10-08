# Tarea: más pisos, billar y futbolito

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "que haga mas tipos de pisos, un billar yu un futbolito"

## Contexto

Estilo del pack: pintado a mano con `herramientas/pintar_nuevos.py`, paleta del pack, vista a 45° desde arriba, cada mueble con su cara de arriba. Sin generador.

Hoy solo hay un piso (`floor.png`). El usuario arma su oficina pintando piso por áreas, así que necesita variedad para distinguir zonas.

## Qué hacer

En `assets/herdr-oficina/sprites/`:

### 1. Pisos

Losetas que se repitan sin costura en las cuatro direcciones, del mismo tamaño que `floor.png`. Nombre `piso-<tipo>.png`. Al menos:

- madera (duela)
- alfombra, en dos colores (uno frío y uno cálido)
- loseta clara tipo cocina o baño
- concreto o cemento
- uno oscuro o técnico para el cuarto de servidores

Si se te ocurren otros que sirvan a una oficina (parquet en espiga, tapete de entrada), añádelos y dilo.

### 2. Billar

`billar.png`: mesa vista a 45°, con el paño arriba (es lo que más se ve), bandas, patas y el frente. Unas bolas y un taco encima si caben. Es un mueble grande: más ancho que `tablelarge`.

### 3. Futbolito

`futbolito.png`: mesa de futbolito a 45°, con la cancha arriba, las barras con sus muñecos y los mangos saliendo a los lados.

Si alguno pide animación chica (las barras del futbolito girando), opcional: `futbolito-anim.png`.

## Qué no tocar

- Los sprites originales del pack ni las piezas ya aprobadas. Nada fuera de `assets/`.

## Cómo verificar

- Pisos: cada uno repetido en un cuadro de 6×4 losetas, para ver que no se nota la costura, con un personaje y un mueble encima para ver el contraste.
- Billar y futbolito: a 8× junto a `tablelarge`, `vendymachine1` y un personaje.

Ábrele las imágenes al usuario: él aprueba.

## Entrega

Contesta `LISTO` (archivos, tamaños y, de cada mueble, cuánto ocupa en el piso) o `BLOQUEADO: <motivo>`.
