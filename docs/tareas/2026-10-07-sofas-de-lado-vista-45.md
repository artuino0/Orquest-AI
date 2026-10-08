# Corrección: los sillones de lado están planos

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que dijo el usuario

> "los sillones de lado estan planos tambien no tiene  la 45 view"

## Qué revisé

Puse los doce sofás a 8× en `docs/tareas/vistas/sofas-de-lado-planos.png`: de cada color, el de frente, el de atrás y el de lado.

- De frente (`coach1`…`coach4`, 33×15): se ven el respaldo, los cojines del asiento desde arriba y los brazos. Tienen volumen.
- De lado (`coach*-lado`, 14×16): son un perfil puro, una "L": respaldo y asiento de canto. No se ve la superficie del asiento ni el largo del sofá.

Visto de lado y a 45° desde arriba, un sofá de 33 px de largo no cabe en 16 de alto: su largo corre hacia el fondo y en pantalla se vuelve **alto**. Hoy mide lo que un sillón de un asiento visto de perfil.

## Qué hacer

Repintar `coach1-lado` a `coach4-lado` a 45°:

- El **largo del sofá hacia arriba**: la pieza crece en alto (los dos cojines del asiento vistos desde arriba, uno detrás del otro).
- **Respaldo** a un lado, como una franja de arriba abajo, con su canto superior más claro.
- **Brazos**: el de adelante completo (su cara de arriba y su frente), el del fondo asomando arriba.
- Abajo, el frente del asiento y las patas.
- Mirando a la derecha; la izquierda sale con espejo.

Mismos cuatro colores y contorno del pack. Dime el tamaño final y cuántas casillas ocupa.

Con el mismo criterio revisa lo demás que pintaste de lado o por detrás (sillas, libreros, lo que haya): una pieza girada debe seguir enseñando su cara de arriba. Corrige lo que esté plano y dilo.

## Qué no tocar

- Los originales del pack ni lo ya aprobado. Nada fuera de `assets/`.

## Cómo verificar

A 8×: cada sofá de lado junto al suyo de frente, con una mesa de centro en medio y un personaje, como quedarían frente a frente en una sala. Ábresela al usuario: él aprueba.

## Entrega

Contesta `LISTO` (archivos, tamaño final, qué más corregiste) o `BLOQUEADO: <motivo>`.

Esta corrección va después de la tarea de pisos, billar y futbolito que tienes en curso; no la interrumpas.
