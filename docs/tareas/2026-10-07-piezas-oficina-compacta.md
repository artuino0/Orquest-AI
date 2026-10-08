# Tarea: piezas para la oficina compacta

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "puedes intentar replicar esta oficina, es mas chica y se ve con mas zoom creo que es suficiente si no establecemos areas y cada uno trae su rol"

Lo dijo mostrando `assets/1O01Mf.png` (una de las referencias de packs ajenos).

## Contexto

Ya armé en la app una oficina chica con esa distribución usando tus sprites: oficina del jefe arriba a la izquierda, sala de vidrio arriba a la derecha, seis puestos al centro, sala y juegos abajo a la derecha, entrada abajo. Se ve con más zoom y quedó bien, pero comparada con la referencia se siente vacía: nos faltan piezas que allá llenan el espacio.

La referencia es solo para ver **qué tipo de muebles hay y cómo se reparten**. Diseño propio: no la calques ni se la pases al generador.

## Qué hacer

Piezas nuevas, mismo estilo, paleta y vista que lo que ya tenemos, pensadas en casillas de 48 px. En orden de lo que más falta:

1. **Plantas**: una de piso en maceta (1 casilla, alta) y una chica de escritorio (para poner encima de un mueble). Si sale una jardinera larga (2–3 casillas de ancho), mejor.
2. **Mesa de juntas** para 6: mesa larga vista desde arriba (≈2 casillas de ancho × 3 de fondo). Solo la mesa; las sillas las pone la app.
3. **Librero** contra la pared (1–2 casillas de ancho).
4. **Impresora / multifuncional** de piso (1 casilla).
5. **Mesa de centro** baja para la sala (1–2 casillas).
6. **Pantalla de pared** con una gráfica (para colgar, como `pared/pizarra.png`).
7. **Puerta de vidrio a la altura del kit de ventanal** (144 px): hoy una puerta en ventanal queda como hueco, porque `ventanales/puerta.png` mide 94.

Guárdalas por carpeta con sentido (`plantas/`, `sala/`…), un PNG por pieza con fondo transparente.

## Qué no tocar

- No cambies ni renombres piezas existentes.
- Nada fuera de `assets/`.

## Cómo verificar

Una imagen de prueba con las piezas nuevas junto a un `puesto/escritorio.png` y un personaje de pie, para ver escala y estilo. Ábresela al usuario.

## Entrega

Contesta empezando con `LISTO`: por cada pieza, archivo, tamaño en píxeles y cuántas casillas ocupa (ancho × fondo), y si va en el piso, colgada o encima de un mueble. O `BLOQUEADO: <motivo>`. Si alguna no sale bien, dilo y entrega las demás.
