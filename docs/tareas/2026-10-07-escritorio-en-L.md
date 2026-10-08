# Tarea: escritorio en L

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "dile que diseñe escriotrio en L"

## Contexto

La oficina ya se dibuja en la app con tus sprites, y el usuario la arma él mismo en un modo creativo: pinta piso y muros por casilla y pone muebles de una paleta. Todo va en casillas de **48 px**, vista cenital 3/4.

El puesto de trabajo de hoy es `generados/puesto/escritorio.png` (106×68, ocupa 2 casillas de ancho por 1 de fondo). La app le pone encima `puesto/monitor.png`, y debajo `puesto/silla_atras.png` con la persona sentada de espaldas (`<nombre>/work/sentado_espalda.png`). El escritorio en L sería un segundo tipo de puesto en la paleta.

## Qué hacer

Un escritorio en L, mismo estilo, madera y paleta que `puesto/escritorio.png`.

- **Tamaño pensado en casillas:** tramo largo de 3 casillas de ancho (≈144 px) al fondo, y un brazo que baja 1 casilla más por un lado. Total 3 de ancho × 2 de fondo. Si al dibujarlo otra proporción se ve mejor, vale, pero que caiga en múltiplos de 48 y dime cuál quedó.
- **Dos piezas:** brazo a la izquierda y brazo a la derecha (`escritorio_l_izq.png`, `escritorio_l_der.png`). Si una es el espejo exacto de la otra, basta con una y me lo dices.
- **Solo el mueble:** sin silla, sin monitor, sin persona, fondo transparente. La app los compone.
- **Dónde se sienta:** en el hueco de la L (bajo el tramo largo, junto al brazo), de espaldas a la cámara. Que el hueco deje ver silla y persona sin que el brazo las tape de más.
- Si te alcanza, las mismas dos piezas vistas desde atrás (para poner el puesto mirando hacia abajo), como hiciste en `puesto_lados/`. Si no, déjalo anotado.

Guárdalo en `assets/sprites/generados/puesto_l/` con el mismo proceso de siempre (generar, limpiar, cuadrícula de píxel).

## Qué no tocar

- Nada fuera de `assets/`. El código de `src/` lo estoy cambiando yo y está sin commit.
- No rehagas ni renombres piezas que ya existen: la app las carga por nombre.
- Diseño propio: nada calcado de packs ajenos.

## Cómo verificar

Una imagen de prueba con el escritorio en L ya armado como puesto: `puesto/silla_atras.png`, `puesto/monitor.png` y un personaje en `work/sentado_espalda.png` en el hueco, junto a un `puesto/escritorio.png` normal para comparar tamaño y estilo. Ábresela al usuario.

## Entrega

Contesta en tu terminal empezando con `LISTO` (qué archivos dejaste, tamaño en píxeles y en casillas de cada uno, en qué casilla va el asiento) o con `BLOQUEADO: <motivo>`.
