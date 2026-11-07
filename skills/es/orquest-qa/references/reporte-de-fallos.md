# Estructura del Reporte de Fallos y Veredicto de QA

Esta referencia define el estándar riguroso para documentar incidentes y fallos, garantizando que el desarrollador pueda reproducirlos y corregirlos de inmediato sin ambigüedad.

---

## 1. Clasificación de Severidad

- **Crítica (P0)**:
  - Causa caída total del servicio, pérdida o corrupción irrecuperable de datos, o brecha de seguridad grave.
  - Veredicto inmediato: `no_pasa`.
- **Mayor (P1)**:
  - Una funcionalidad primaria de la tarea está completamente rota y no existe alternativa de uso (*workaround*).
  - Veredicto inmediato: `no_pasa`.
- **Media (P2)**:
  - Un flujo secundario falla o existe un comportamiento erróneo no crítico pero existe una alternativa funcional.
  - Si afecta criterios de aceptación pactados: `no_pasa`.
- **Menor (P3)**:
  - Detalles cosméticos, errores ortográficos, inconsistencias visuales leves.
  - Puede resultar en `pasa` con observaciones si no viola los criterios de aceptación principales.

---

## 2. Anatomía de un Reporte de Defecto Impecable

Cada fallo reportado debe contener obligatoriamente estos 5 elementos:

1. **Título descriptivo**: Formato `[Módulo/Componente] - Comportamiento anómalo en condición específica`.
2. **Severidad y Entorno**: Nivel de criticidad, commit/rama probada, sistema operativo, navegador o versión de Node/Python.
3. **Pasos exactos para reproducir (Paso a paso numerado)**: Instrucciones reproducibles desde un estado inicial limpio.
4. **Comportamiento Esperado vs Comportamiento Obtenido**: Qué dice la especificación que debía ocurrir frente a lo que ocurrió en la realidad.
5. **Evidencia y Logs**: Capturas de pantalla, fragmento exacto del log de error con stack trace, o salida de comando terminal.

---

## 3. Ejemplo Real de Defecto

```markdown
### [Facturación] - Excepción 500 al procesar pago con tarjeta sin código postal
- **Severidad**: Mayor (P1)
- **Entorno**: Rama `feature/checkout-v2` (commit `a81b2c`), Node v20.10.0, Postgres 16

#### Pasos para reproducir:
1. Iniciar sesión con usuario de prueba `test.qa@example.com`.
2. Agregar el producto "Licencia Pro" ($99) al carrito.
3. Avanzar al checkout y seleccionar método de pago "Tarjeta de Crédito".
4. Ingresar número de tarjeta válido pero dejar el campo "Código Postal" vacío.
5. Hacer clic en "Confirmar y Pagar".

#### Comportamiento Esperado:
El formulario debe resaltar el campo "Código Postal" con el mensaje "El código postal es obligatorio" y retornar HTTP 422.

#### Comportamiento Obtenido:
La pantalla se congela en estado de carga. En la consola del servidor se arroja:
`Unhandled rejection: TypeError: Cannot read properties of undefined (reading 'postalCode') at PaymentGateway.charge (payment.js:45)`
La API responde con HTTP 500 Internal Server Error.

#### Evidencia:
- Captura adjunta: `capturas/error_500_checkout.png`
- Log del servidor:
  ```
  [ERROR] 2026-11-06 19:15:22 - POST /api/v1/payments 500 in 142ms
  ```
```

---

## 4. Plantilla de Entrega de QA (`entregar`)

Al emitir la entrega al jefe, estructura el reporte con esta plantilla:

```markdown
## Veredicto: [pasa | no_pasa]

### Resumen de Pruebas Realizadas:
- [x] Ejecución de suite automatizada (`npm test` o `pytest`): 42 pruebas en verde.
- [x] Validación de criterios de aceptación de la tarea.
- [x] Pruebas exploratorias de bordes y escenarios negativos.

### Criterios de Aceptación:
1. "El usuario puede registrarse con correo y contraseña": CUMPLIDO.
2. "Se envía correo de confirmación con token firmado": CUMPLIDO.
3. "No permite correos duplicados": CUMPLIDO.

### Hallazgos / Defectos Encontrados:
(Si el veredicto es no_pasa, detallar aquí los defectos siguiendo la anatomía de la sección 2. Si es pasa y no hubo fallos, indicar "Ninguno").

### Conclusión:
(Explicación en dos líneas de por qué la entrega está lista para integrarse o por qué debe regresar al empleado para correcciones).
```
