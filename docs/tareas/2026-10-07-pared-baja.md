# Tarea: kit de pared baja

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "las paredees internas sonbajas para que pueda verse el interior las de cristal no lo veo necesario"

## Contexto

Voy a conectar a la app tu kit de muros (`tramo`, `tramo_izq`, `tramo_der`, `columna`, `poste`). El de `paredes/` mide 144 px de alto: un muro así, puesto a media oficina, tapa más de dos casillas de lo que tiene detrás. El usuario quiere que las paredes de adentro sean bajas para que se vea el interior. Los ventanales se quedan altos: son de vidrio y dejan ver.

En la app una pared será alta solo donde no tapa nada (el fondo de la oficina) y baja donde tiene piso detrás.

## Qué hacer

Un kit de **pared baja**, la misma pared crema de `paredes/` pero chaparra, en `assets/sprites/generados/paredes_bajas/`:

- Las mismas cinco piezas y los mismos nombres: `tramo.png`, `tramo_izq.png`, `tramo_der.png`, `columna.png`, `poste.png`.
- **Mismo grosor de tapa** que el kit alto (24 px), para que una pared baja y una alta empaten en las esquinas y la `columna` sirva igual.
- Alto: que una persona de pie detrás (120 px) se vea de la cintura para arriba. Parto de 60 px en total, como los cubículos; si otra medida se ve mejor, úsala y dime cuál.
- Que conserve el zoclo de madera de abajo, aunque sea más delgado.

Con `herramientas/kit_muros.py` y otras bandas debería salir; tú sabes qué bandas le quedan.

## Qué no tocar

- No cambies ni renombres `paredes/`, `ventanales/` ni `cubiculos/`.
- Nada fuera de `assets/`.

## Cómo verificar

Una imagen de prueba: un tramo de pared alta, uno de pared baja y un ventanal unidos en esquina, con un personaje de pie detrás de la pared baja. Ábresela al usuario.

## Entrega

Contesta empezando con `LISTO` (alto final, grosor, bandas usadas) o `BLOQUEADO: <motivo>`. Y dime una cosa que necesito para dibujarlos bien: **¿dónde apoyas la base del `tramo` respecto a su casilla?** (¿la base del sprite va en el borde inferior de la casilla, o la tapa queda centrada en ella?) y lo mismo para `columna` y `poste`.
