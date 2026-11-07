# Casos de Prueba y Casos de Borde (Edge Cases)

Esta referencia proporciona técnicas de análisis de valores límite y partición equivalente para descubrir errores que escapan a las pruebas ingenuas de camino feliz.

---

## 1. Técnicas Fundamentales de Diseño

### A. Partición de Equivalencia
Divide las entradas posibles en grupos que deben recibir el mismo tratamiento:
- **Ejemplo (Edad para registro entre 18 y 65 años)**:
  - Clase inválida menor: `17` o menos.
  - Clase válida: `18` a `65`.
  - Clase inválida mayor: `66` o más.
Prueba un solo valor representativo de cada clase para evitar pruebas redundantes.

### B. Análisis de Valores Límite (Boundary Value Analysis)
La inmensa mayoría de los bugs ocurren exactamente en las fronteras de las condiciones (`<` vs `<=`).
Para un rango `[min, max]`, prueba:
- `min - 1`, `min`, `min + 1`
- `max - 1`, `max`, `max + 1`

---

## 2. Catálogo de Casos de Borde Típicos por Tipo de Dato

### Cadenas de Texto (`strings`)
- Cadena vacía `""`.
- Cadenas compuestas solo por espacios en blanco `"   "`.
- Cadenas extremadamente largas (10,000+ caracteres para comprobar desbordes o denegación de servicio).
- Caracteres especiales y Unicode: emojis (`🚀`), caracteres con tildes y diacríticos (`año`, `straße`), alfabetos no latinos (`日本語`, `العربية`).
- Cadenas con inyecciones comunes: `"' OR 1=1 --"`, `<script>alert(1)</script>`, `../../etc/passwd`.
- Espacios al inicio o al final: `"  test@example.com  "` (¿se sanitizan con trim?).

### Números y Moneda (`numbers`)
- Cero (`0`, `0.00`).
- Números negativos (`-1`, `-0.01`).
- Límites de enteros: `2^31 - 1` (2,147,483,647) y `2^63 - 1`.
- Precisión decimal y punto flotante: operaciones como `0.1 + 0.2 !== 0.3`. Validar redondeo a 2 decimales para dinero.
- División por cero.

### Colecciones y Listas (`arrays` / `lists`)
- Colección vacía `[]`.
- Colección con exactamente 1 elemento (comprobar algoritmos de reducción, promedios o comas finales).
- Colección con duplicados idénticos.
- Paginación: solicitar página `0`, página `-1`, o página más allá del total existente (página `99999`).

### Fechas y Tiempos (`datetime`)
- Fechas de año bisiesto (`29 de febrero`).
- Cambio de año (`31 de diciembre a 01 de enero`).
- Diferencias de zona horaria (UTC vs zona local con offsets negativos y positivos).
- Horario de verano (DST transition: una hora se repite o se salta).

---

## 3. Checklist de Casos de Borde

- [ ] ¿Qué pasa si el campo requerido se envía como `null` o se omite en el JSON?
- [ ] ¿Qué ocurre con cadenas de texto que contienen espacios antes o después?
- [ ] ¿Se validó el comportamiento ante un arreglo vacío y ante un arreglo con miles de ítems?
- [ ] ¿Cómo reacciona el sistema ante números negativos donde solo se esperan cantidades positivas?
- [ ] ¿Se manejan adecuadamente fechas con zonas horarias distintas a la del servidor?
