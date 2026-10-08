# Tarea: sillas y sofás de lado, vitrales sin lo café, prop de cubículo

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

Viendo la oficina compacta ya armada en la app:

> "se ve bien pero el jefe debe mirar hacia el frente, dile al artdesigner que las sillas deberian de lado tambien, lows characters no deben sobre ponerse, los vitarles tienenalgo cafe ensima y ademas, entre los cristales y la zona verde hay un stack o una linea de cubos de madera lo que hace ver mal el diseño, los sofas, igual me gustaria que fueran ilerasfrente a frente de pcs ahorita son 6 pero creo que si hacemos un prop para cubiculos podriamos meter y separarlos ademas podriamos poner dos lineas de computadoras para 12 desarrolladores  no me gusta que los personajes se ponene frentre a optro se tapan"

De eso, lo tuyo es lo de abajo. Lo demás (jefe de frente, que no se encimen, la franja de madera bajo el vidrio, las hileras) es de la app y lo hago yo.

## Antes de generar nada

La vez pasada el documento activo en Pencil era "Logo MacDougan Proveedores" y la hoja se insertó ahí. **Primer paso de esta tarea:** confirma qué documento está activo; si no es `oirquestai.pen`, no generes y avísame con `BLOQUEADO`. Ahora mismo el activo sigue siendo el del logo.

## Qué hacer

### 1. Sillas de lado

Las mesas de la sala tienen una silla a cada lado y hoy las dos se ven de frente. Hace falta `cafeteria/silla_madera` **vista de lado** (mirando a la derecha; la izquierda sale con espejo). Que empate en tamaño con la de frente (38×72).

Ya existe `puesto_lados/silla_lado.png` para la silla de oficina; esa no hay que rehacerla.

### 2. Sofás de lado

Lo mismo para `cafeteria/sofa` y `cafeteria/sillon`: versión vista de lado, para ponerlos contra un muro lateral o frente a frente con una mesa de centro en medio.

### 3. Vitrales: quitar lo café de arriba

El kit de `ventanales/` (`tramo`, `tramo_izq`, `tramo_der`, `columna`, `poste`) tiene una tapa café arriba y el usuario la ve como "algo café encima" de los vitrales. Que la tapa y el marco sean del mismo metal oscuro/gris azulado del marco del vidrio, sin madera. Mismo alto (144) y mismo grosor (24), para que no cambie nada en la app. Rehaz con eso también `ventanales/puerta_alta.png` y `puerta_alta_1.png`.

Aquí sí reemplazas archivos existentes, con el mismo nombre y tamaño.

### 4. Prop de cubículo

El usuario quiere dos hileras de computadoras frente a frente para 12 desarrolladores, separados por cubículos. En la app quedarán así: una hilera de 6 escritorios mirando hacia abajo (la persona detrás, de frente a la cámara) pegada a otra de 6 mirando hacia arriba (la persona abajo, de espaldas). Los escritorios van pegados lado con lado, cada uno de 2 casillas (96 px) de ancho.

Hacen falta dos mamparas que se pongan **encima de los escritorios**, sin ocupar casilla propia:

- `cubiculos/mampara_fondo.png`: panel que corre a lo largo, entre las dos hileras (sobre la orilla donde se tocan los escritorios). Un tramo de 96 px de ancho que se repita sin costura.
- `cubiculos/mampara_lado.png`: panel entre vecinos, visto de canto, que corre del fondo del escritorio hacia la silla. Delgado; que no tape a la persona sentada.

Mismo material que el kit de `cubiculos/` (panel de tela con marco). Bajas: que se vea la cabeza y los hombros de quien está sentado detrás.

## Qué no tocar

- Fuera de `ventanales/` no reemplaces piezas existentes.
- Nada fuera de `assets/`.
- Diseño propio; nada calcado de packs ajenos.

## Cómo verificar

Una imagen de prueba con: (a) una mesa con silla de lado a la izquierda y a la derecha; (b) un tramo de ventanal nuevo con su puerta, junto a un tramo de pared; (c) dos escritorios pegados lado con lado y otros dos enfrente, con las mamparas puestas y gente sentada (`work/sentado_frente.png` arriba, `work/sentado_espalda.png` abajo). Ábresela al usuario.

## Entrega

Contesta empezando con `LISTO` (archivo, tamaño y, para las mamparas, dónde las apoyas respecto al escritorio: cuántos píxeles sobre su base y a qué altura del sprite) o con `BLOQUEADO: <motivo>`. Si una parte no sale, entrega las demás y dilo.
