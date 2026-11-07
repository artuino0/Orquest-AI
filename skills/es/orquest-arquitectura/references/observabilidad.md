# Observabilidad, Telemetría y Definición de SLOs

Esta referencia establece los estándares para estructurar la visibilidad del sistema: logs, métricas, trazas distribuidas y objetivos de nivel de servicio.

---

## 1. Los Tres Pilares de la Observabilidad

### A. Logs Estructurados en Formato JSON
Prohibido emitir líneas de texto plano no estructuradas (`console.log("Error: " + err)`). Todo log debe ser un objeto JSON parseable con campos estándar:

```json
{
  "timestamp": "2026-11-06T19:15:30.125Z",
  "level": "error",
  "message": "Payment processing failed due to upstream gateway timeout",
  "service": "billing-service",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "user_id": "usr_98124",
  "order_id": "ord_5521",
  "error": {
    "type": "GatewayTimeoutError",
    "code": "UPSTREAM_TIMEOUT",
    "retry_count": 3
  }
}
```

### B. Métricas de Rendimiento (Método RED y USE)
- **Método RED (Para servicios orientados a peticiones / APIs)**:
  - **R (Rate)**: Número de peticiones por segundo recibidas (RPS).
  - **E (Errors)**: Tasa o porcentaje de peticiones que fallan (códigos HTTP 5xx o excepciones).
  - **D (Duration)**: Histograma de duración o latencia (percentiles p50, p95, p99).
- **Método USE (Para recursos de infraestructura)**:
  - **U (Utilization)**: Porcentaje de uso del recurso (CPU, RAM, disco).
  - **S (Saturation)**: Trabajo encolado pendiente de procesar (longitud de cola de tareas).
  - **E (Errors)**: Contador de errores físicos o fallos de dispositivo.

### C. Trazabilidad Distribuida (Distributed Tracing con OpenTelemetry)
- Propaga los encabezados del estándar **W3C Trace Context** (`traceparent`, `tracestate`) a través de todas las llamadas HTTP y colas de mensajes.
- Un `trace_id` único permite seguir una petición de usuario desde el frontend a través de 5 microservicios hasta la consulta de base de datos final.

---

## 2. Definición Práctica de SLI y SLO

- **SLI (Service Level Indicator)**: La métrica cuantitativa en tiempo real de cómo se comporta el servicio.
  - *Ejemplo*: Porcentaje de peticiones exitosas (no-5xx) al endpoint `/checkout` en ventanas de 30 días.
- **SLO (Service Level Objective)**: La meta interna acordada con el negocio que el SLI debe cumplir.
  - *Ejemplo*: 99.9% de peticiones de `/checkout` deben responder con éxito en menos de 300 ms en un periodo de 30 días móviles.
- **Presupuesto de Error (Error Budget)**: `100% - SLO`. Para un SLO de 99.9%, el presupuesto de error es 0.1%. Si el presupuesto se agota debido a incidentes, se congelan los despliegues de nuevas características para priorizar estabilidad.

---

## 3. Checklist de Observabilidad

- [ ] ¿Los logs se emiten en formato JSON estructurado hacia `stdout`?
- [ ] ¿Todos los logs y llamadas externas propagan `trace_id` y `correlation_id`?
- [ ] ¿Están configuradas las métricas RED (Rate, Errors, Duration) para cada endpoint crítico?
- [ ] ¿Se definieron alertas proactivas basadas en agotamiento de presupuesto de error (Error Budget Burn Rate)?
