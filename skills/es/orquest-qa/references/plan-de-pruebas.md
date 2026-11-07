# Elaboración del Plan de Pruebas por Riesgo

Esta referencia describe cómo diseñar un plan de pruebas conciso, accionable y priorizado por nivel de impacto en el negocio.

---

## 1. Evaluación de Riesgos y Priorización

No todo se puede probar con la misma profundidad en cada entrega. Asigna el esfuerzo según la matriz de impacto y probabilidad:

| Nivel de Riesgo | Criterio | Estrategia de Prueba |
| :--- | :--- | :--- |
| **Crítico (P0)** | Autenticación, procesamiento de pagos, integridad de base de datos, pérdida de datos. | Pruebas unitarias completas, integración con mocks realistas, pruebas negativas exhaustivas y E2E automatizado. |
| **Alto (P1)** | Flujos principales de negocio (checkout, creación de recursos clave, filtros de búsqueda). | Pruebas de integración de API, validación de reglas de negocio y pruebas de borde. |
| **Medio (P2)** | Exportaciones secundarias, notificaciones no bloqueantes, paneles de configuración. | Pruebas de integración básicas y revisión exploratoria. |
| **Bajo (P3)** | Ajustes estéticos menores, textos informativos, tooltips. | Inspección visual y validación de renderizado. |

---

## 2. Estructura de un Plan de Pruebas Rápido

Antes de ejecutar pruebas complejas, documenta mentalmente o en tu reporte de trabajo:

1. **Objetivo de la entrega**: ¿Qué problema resuelve el cambio revisado?
2. **Alcance cubierto**: Funcionalidades modificadas y servicios impactados.
3. **Fuera de alcance**: Partes del sistema no afectadas que no requieren pruebas en profundidad.
4. **Matriz de Casos**:
   - Casos Funcionales (Positivos).
   - Casos de Frontera / Negativos.
   - Verificación de Regresión.
5. **Datos de prueba requeridos**: Fixtures necesarios, usuarios con roles específicos (admin, cliente, invitado).

---

## 3. Ejemplo Práctico: Cambio en Proceso de Facturación

```markdown
### Plan de Pruebas: Descuentos en Facturación
- **Riesgo**: Alto (Cálculo financiero).
- **Escenarios**:
  1. [P0] Factura con cupón del 10% aplica descuento correcto sobre subtotal antes de impuestos.
  2. [P0] Factura con cupón de monto fijo ($50) que supera el total resulta en total $0, nunca valor negativo.
  3. [P1] Intento de aplicar cupón expirado retorna error 422 con mensaje legible.
  4. [P1] Reintento concurrente del mismo cupón de un solo uso no permite doble aplicación.
  5. [Regresión] Facturación normal sin cupón continúa calculando impuestos y totales intactos.
```

---

## 4. Checklist del Plan de Pruebas

- [ ] ¿Se identificaron los componentes críticos afectados por el cambio?
- [ ] ¿Los casos P0 y P1 cubren tanto el éxito como los fallos esperados?
- [ ] ¿Se cuenta con los datos de prueba y credenciales necesarias sin usar datos sensibles reales?
- [ ] ¿Se definió el criterio de aceptación inequívoco para cada prueba?
