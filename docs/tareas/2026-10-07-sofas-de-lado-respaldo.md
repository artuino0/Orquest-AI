# Corrección 2: sofás de lado, el respaldo quedó plano

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que dijo el usuario

> "se ve muy mal lo de los sillones, aplano el respaldo a  nivel de los descansabrasos"

## Qué revisé

`coach*-lado` (16×30), a 8× junto a los de frente: `docs/tareas/vistas/sofas-de-lado-respaldo-plano.png`.

Ya corre el largo hacia arriba y se ven los dos cojines, eso está bien. Lo que falla:

- **El respaldo no tiene altura.** Es una franja a la izquierda, al mismo nivel que los cojines y que los brazos. En el sofá de frente el respaldo es lo más alto del mueble; aquí queda aplastado.
- Los brazos son dos bandas iguales, arriba y abajo.
- Con todo al mismo nivel se lee como una caja, un casillero o un refrigerador de frente, no como un sofá.
- El gris de lado se ve casi blanco comparado con el gris de frente.

## Qué hacer

Repintar los cuatro `coach*-lado` de modo que se lean las **tres alturas** de un sofá visto a 45°:

1. **Respaldo, lo más alto.** A 45° lo que está más alto se dibuja más arriba en pantalla: el respaldo debe subir por encima del asiento, con su cara de arriba (filo claro) y, debajo, su cara interior bajando hasta los cojines. Que se note que hay un escalón entre respaldo y asiento.
2. **Brazos, a media altura**: más bajos que el respaldo y más altos que el asiento. El de adelante con su cara de arriba y su frente; el del fondo asomando.
3. **Asiento, lo más bajo**: los dos cojines desde arriba, y al frente el canto del asiento y las patas.

Fíjate cómo lo resuelve el pack en el de frente (`coach2.png`): respaldo con botones arriba, brazos redondeados a los lados más bajos, cojines al frente. Es el mismo sofá girado un cuarto de vuelta; deben reconocerse las mismas partes.

Corrige también el gris para que use los mismos tonos que `coach1.png`.

## Qué no tocar

- Los originales del pack ni lo aprobado. Nada fuera de `assets/`.

## Cómo verificar

A 8×: cada sofá de lado junto al suyo de frente y de atrás. Y una salita con un sofá de frente y uno de lado en escuadra, con mesa de centro y un personaje al lado (no encima de la mesa). Ábresela al usuario: él aprueba.

## Entrega

`LISTO` (tamaño final y qué cambiaste) o `BLOQUEADO: <motivo>`.
