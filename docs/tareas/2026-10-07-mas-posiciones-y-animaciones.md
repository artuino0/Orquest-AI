# Tarea: muebles en otras posiciones y assets animados

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "mandale a art dginer que cree mas assets, en otras posiciones por que hay muchas cosas que se ven mal puestas por que miran de rente, quiero que animemos a los assets porque los anime con css"

Antes señaló su otro proyecto como referencia de lo que quiere ver moverse:

> "C:\desarrollo\herdr-oficina aca hice solo un listener para herdr […] de aca tomaremos los assets  los globos y demas"

## Contexto

En la oficina casi todo mueble existe solo visto de frente. Al ponerlo contra un muro lateral, o de espaldas a la cámara, se ve mal puesto. Ya resolviste esto para el escritorio, la silla de oficina, la silla de madera, el sofá y el sillón; falta el resto.

En `C:\desarrollo\herdr-oficina` (suyo; arte CC0, Pixel Office de 2dPig) las cosas se mueven con CSS: la pantalla parpadea mientras alguien trabaja, las mascotas respiran, las nubes pasan, la gente rebota un píxel al teclear (`public/styles.css`, busca `@keyframes`). Quiere esa vida aquí, pero con cuadros de sprite. Míralo para ver el tipo de movimiento; no copies su arte a esta carpeta, eso lo decide él aparte.

## Antes de generar nada

Confirma que el documento activo en Pencil es `oirquestai.pen`. Si no, no generes y contesta `BLOQUEADO`.

## Qué hacer

### 1. Otras posiciones

Para cada mueble que hoy solo mira al frente, las vistas que falten: **de lado** (mirando a la derecha; la izquierda sale con espejo) y **por detrás**. En orden de lo que más se nota:

1. `juegos/maquinita_azul`, `juegos/maquinita_roja`: de lado y por detrás.
2. `cafeteria/barra`: de lado.
3. `sala/librero`, `cafeteria/archivero`: de lado.
4. `sala/impresora`, `cafeteria/garrafon`: de lado.
5. `cafeteria/sofa`, `cafeteria/sillon`: por detrás (de lado ya están).
6. `pared/pizarra_ruedas`: de lado.
7. `sala/mesa_centro`, `plantas/jardinera`, `juegos/futbolito`, `juegos/billar`: girados un cuarto de vuelta (corriendo de arriba abajo).
8. Lo colgado (`pared/pizarra`, `corcho`, `kanban`, `pantalla`, `ventana_*`, `juegos/dardos`): versión para muro lateral, vista de canto.

Mismo nombre con sufijo: `_lado`, `_atras`, `_vertical`. Recuerda que el generador mete perspectiva y deja trapecios: si pasa, ármalo recto como hiciste con los escritorios.

### 2. Animaciones

Hojas de cuadros en fila (como las de `work/`), mismo tamaño de cuadro que la pieza quieta, para que no brinque. Nombre: `<pieza>_anim.png`. En orden:

1. `juegos/maquinita_azul` y `maquinita_roja`: la pantalla cambia (juego corriendo).
2. `pared/pantalla`: la gráfica se mueve.
3. `plantas/planta_piso`, `planta_palma`: se mecen apenas.
4. `cafeteria/garrafon`: una burbuja sube.
5. `cafeteria/lampara`: la luz respira.
6. `cafeteria/barra`: vapor de la cafetera.
7. Lo que veas que pide moverse.

De 2 a 4 cuadros, movimiento chico: es ambiente, no debe distraer.

## Qué no tocar

- No reemplaces ni renombres piezas existentes. Nada fuera de `assets/`.
- Diseño propio.

## Cómo verificar

Un GIF por grupo (posiciones, animaciones) con las piezas nuevas junto a su versión de frente y un personaje para ver la escala. Ábrelos al usuario.

## Entrega

Reporte completo en `docs/tareas/2026-10-07-mas-posiciones-y-animaciones.entrega.md`: por pieza, archivo, tamaño, casillas que ocupa (ancho × fondo) y, en las animadas, cuántos cuadros y a qué ritmo se ven bien. Di cuáles no salieron. En la terminal contesta `LISTO` o `BLOQUEADO: <motivo>`.

Es bastante: si conviene, entrega por partes (primero posiciones 1–5 y animaciones 1–3) y avisa.
