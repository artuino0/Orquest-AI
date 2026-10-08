# Tarea: teclear de perfil y mampara entre escritorios de lado

Para: ArtDesigner · De: Orquestador · 2026-10-07

## Lo que pidió el usuario

> "muy despegados del escritorio, no quiero que se vean las rodillas de los que estan de frente, ademas dveria ser vertical 3x3 3x3"

Le pregunté qué acomodo quería y eligió **"Columnas, de lado"**: dos bloques; en cada uno, 3 personas en columna mirando a la derecha frente a 3 mirando a la izquierda, con los escritorios en medio. Se les ve de perfil.

```
o>[==|==]<o     o>[==|==]<o
o>[==|==]<o     o>[==|==]<o
o>[==|==]<o     o>[==|==]<o
```

## Contexto

Lo estoy armando en la app con lo que ya hiciste en `puesto_lados/` (escritorio, silla y monitor de lado) y con `<nombre>/sit.png` para la persona. Faltan dos cosas de arte.

## Antes de generar nada

Confirma que el documento activo en Pencil es `oirquestai.pen`. Si no, no generes y contesta `BLOQUEADO`.

## Qué hacer

### 1. Teclear de perfil

Para los siete (`rizos`, `jefe`, `bob`, `coleta`, `gorra`, `rapada`, `trenza`): `<nombre>/work/sentado_lado.png`, 4 cuadros en fila como las otras hojas de `work/`, sentado de perfil mirando a la derecha y tecleando. Mismo tamaño de cuadro que `<nombre>/sit.png`, para que no brinque al cambiar de quieto a tecleando. La izquierda sale con espejo.

Como en `sentado_frente` y `sentado_espalda`: mismo dibujo que `sit.png`, moviendo solo brazos y un cabeceo.

### 2. Mampara entre escritorios de lado

Un panel de cubículo que corre **de arriba abajo** entre los dos escritorios de lado que se dan la cara (donde se tocan). Mismo material que `cubiculos/mampara_fondo.png`.

- `cubiculos/mampara_vertical.png`: tramo para un puesto (96 px de alto en el piso), que se repita hacia abajo sin costura.
- Si hace falta un remate para el extremo de abajo (el canto, hasta el piso), `cubiculos/mampara_vertical_fin.png`.

Baja: que no tape a nadie; la gente queda a los lados, no detrás.

## Qué no tocar

- No reemplaces piezas existentes. Nada fuera de `assets/`.

## Cómo verificar

Imagen de prueba: una columna de 3 puestos de lado frente a otra de 3 (`escritorio_lado_izq/der`, `silla_lado`, `monitor_lado_izq/der`), con gente tecleando de perfil y la mampara en medio. Ábresela al usuario.

## Entrega

Deja el reporte completo en `docs/tareas/2026-10-07-teclear-de-perfil.entrega.md` (archivos, tamaños, y dónde apoyas escritorio, silla, persona, monitor y mampara respecto a la casilla) y contesta en la terminal con `LISTO` o `BLOQUEADO: <motivo>`.
