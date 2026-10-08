# Calle a los lados de la oficina

## Contexto

La oficina de píxel (`src/renderer/oficina.html`, armada con `assets/herdr-oficina/herramientas/armar_oficina.py`) mide 480×356 y es más cuadrada que la ventana: a los lados queda una franja vacía del color de fondo. El usuario pidió, textual:

> "en las orillas se ven una franja del color de fondo, como vez si le metemos vida cmo una calle a los lados dile a art desinges que cree veiculo y characters caminando por acera la acera el arrollo vial y un buzon un hidrante"

La idea: a cada lado del edificio corre una calle de arriba abajo. Pegada al edificio va la acera; más afuera, el arroyo vial. Por la acera camina gente y por el arroyo pasan vehículos, todos subiendo o bajando por la pantalla. Yo ensancho la escena y los pongo a moverse; tú pintas las piezas.

La impresora grande quedó aprobada y ya está colocada junto al garrafón.

## Qué hacer

Todo pintado a mano en el estilo del pack Pixel Office (los mismos 16 colores, vista superior a 45°, con `pintar_nuevos.py`), en `assets/herdr-oficina/sprites/`. Nombres en minúsculas con guiones, como las demás piezas.

### Suelo (losetas que se repiten sin costura, 72×24 como `piso-*.png`)

1. `piso-acera.png` — banqueta de losas de concreto claro, con sus juntas.
2. `piso-asfalto.png` — arroyo vial oscuro, con algo de grano; que no compita con los coches.
3. `calle-raya.png` — raya central discontinua para una calle que corre de arriba abajo: una pieza angosta (unos 4×24) que se repite hacia abajo y deja ver el asfalto entre tramos.
4. `acera-bordillo.png` — guarnición entre acera y arroyo, vista de canto y repetible hacia abajo (unos 4×24): se le ve la cara de arriba clara y el escalón hacia el asfalto.
5. `calle-cebra.png` — paso de cebra para cruzar el arroyo de lado a lado (opcional si te da el tiempo).

### Vehículos (se mueven hacia arriba o hacia abajo de la pantalla)

Cada uno en dos vistas, porque un carril sube y el otro baja: `-frente` (viene hacia nosotros, se le ven faros y parabrisas) y `-atras` (se aleja, se le ven calaveras). Que se les vea el techo y el cofre: es vista a 45°, no de perfil. Ancho de unos 22 a 26 px para que quepan dos carriles.

6. `auto-rojo-frente.png` / `auto-rojo-atras.png` — sedán.
7. `auto-azul-frente.png` / `auto-azul-atras.png` — otro modelo o color, para que no se repita.
8. `camioneta-frente.png` / `camioneta-atras.png` — pickup o van de reparto, un poco más larga.
9. `taxi-frente.png` / `taxi-atras.png` — amarillo, con su letrero (opcional).

Si puedes, una hoja `<pieza>-anim.png` de 2 cuadros en fila (mismo tamaño de cuadro) con las llantas o un brinquito de 1 px, para que no se vean deslizándose como calcomanías.

### Gente caminando por la acera

10. Cuatro peatones nuevos, distintos de los empleados (`char1`…`char8`) para que no se confundan con ellos: `peaton1` a `peaton4`. Variedad: alguien con mochila, alguien con portafolio o bolsa, una persona mayor, alguien con gorra o audífonos.
    - `peatonN.png` — de pie, de frente.
    - `peatonN-camina.png` — caminando hacia nosotros, 4 cuadros en fila.
    - `peatonN-atras-camina.png` — caminando de espaldas, 4 cuadros en fila.
    - Mismo tamaño y mismo formato de hoja que `char1-camina.png` y `char1-atras-camina.png`, para que la página los anime igual.

### Mobiliario de la acera

11. `buzon.png` — buzón de correo de pie.
12. `hidrante.png` — hidrante.
13. `farola.png` — poste de luz alto, y `farola-luz.png` con el halo encendido para la noche (mismo tamaño, se encima). Lo propongo yo; si no da tiempo, déjalo fuera.
14. `arbol-acera.png` — árbol chico en su alcorque (también propuesta mía, opcional).

Todas con su cara de arriba visible, como las maquinitas y los servidores ya aprobados: sin eso "se ve como pegatina".

## Qué no tocar

- Ninguna pieza existente del pack ni las ya aprobadas.
- `armar_oficina.py`, `src/renderer/oficina/` y el resto del código: yo armo la calle y pongo a moverse coches y gente cuando el usuario apruebe el arte.

## Cómo verificar

- Muestra en `docs/tareas/vistas/calle.png`: una franja de calle armada de arriba abajo (edificio a un lado, acera, bordillo, dos carriles con su raya), con un coche subiendo y otro bajando, dos peatones, el buzón, el hidrante y la farola, junto a un empleado (`char1.png`) y la puerta del edificio para comparar tamaños. Ampliada, y en una segunda fila cada pieza suelta.
- Los cuadros de cada animación, uno junto a otro.
- Una versión de la misma franja oscurecida (como se ve de noche) para comprobar que los coches y la gente se distinguen del asfalto.

## Entrega

Reporte en `docs/tareas/2026-10-08-calle-a-los-lados.entrega.md`: por pieza, archivo, tamaño, cuántos cuadros y a qué ritmo se ve bien, y qué parte de su base estorba el paso (buzón, hidrante, farola). Di cuáles opcionales no salieron. En la terminal contesta `LISTO` o `BLOQUEADO: <motivo>`.
