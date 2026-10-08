# Tarea: versión baja de las paredes, para las de adentro

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que dijo el usuario

Sobre los sofás de lado con el respaldo 2 px más bajo:

> "ya asi que lo deje"

Quedan aprobados así; no los toques más.

Sobre las paredes nuevas:

> "no se si recuerdas que hablamos de que las paredes internas medirian menos para alcanzar a ver el interior de las oficinas sin que estorven"

## Contexto

Es una regla que ya teníamos en el estilo anterior y que hay que traer a este:

- La pared **del fondo** de la oficina puede ser alta: no tapa nada.
- Una pared **de adentro** (una división con piso detrás) va **baja**, para que se vea lo que hay atrás.
- El **vidrio** se queda alto: deja ver.

Las nueve `pared-*.png` que hiciste miden todas 26×20. Un personaje mide 23: una división de 20 a media oficina lo tapa casi entero.

## Qué hacer

Para cada pared opaca (`celeste`, `crema`, `gris`, `ladrillo`, `madera`, `lambrin`, `tecnica`), su versión baja: `pared-<tipo>-baja.png`.

- Mismo ancho (26) y misma repetición sin costura, para que empate con la alta.
- **Alto:** que de un personaje parado justo detrás se vean cabeza y torso. Tú mides cuánto; parte de la mitad del alto actual y ajusta. Dime el número final y qué tapa del personaje.
- **Con su cara de arriba:** al ser baja, se le ve la tapa del muro desde arriba (a 45°). Sin tapa se verá como una tira pegada al piso.
- Mismo grosor de tapa en todas, para que una pared baja y otra de distinto material empaten al encontrarse.
- Que la alta y la baja del mismo material se reconozcan como la misma pared.

Las de vidrio (`pared-vidrio`, `pared-vidrio-puerta`) no llevan versión baja.

Si para que una división baja no se vea cortada hace falta un remate de extremo (el canto del muro donde termina), hazlo como `pared-<tipo>-baja-fin.png` o uno común si sirve para todas, y dilo.

## Qué no tocar

- Las nueve paredes altas, los sofás recién aprobados, los originales del pack. Nada fuera de `assets/`.

## Cómo verificar

Una oficina chica de muestra a 8×: pared alta al fondo, una división baja a media altura con un personaje parado detrás y otro delante, un tramo de vidrio alto al lado, piso debajo. Que se vea el interior por encima de la baja. Ábresela al usuario: él aprueba.

## Entrega

`LISTO` (archivos, alto final, grosor de la tapa, si hay remate) o `BLOQUEADO: <motivo>`.
