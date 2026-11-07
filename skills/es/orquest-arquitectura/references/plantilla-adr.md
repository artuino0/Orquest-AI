# Plantilla de Registro de Decisión de Arquitectura (ADR - MADR v3)

Utiliza esta plantilla basada en el estándar MADR (Markdown Architectural Decision Records) para registrar formalmente cada decisión de diseño técnico relevante.

---

```markdown
# ADR-[NUMERO]: [Título corto imperativo, ej. Uso de Outbox Pattern para Notificaciones]

- **Estado**: [propuesto | aceptado | rechazado | obsoleto | superado por ADR-XXX]
- **Fecha**: [AAAA-MM-DD]
- **Autor(es)**: [Puesto / Nombre del Arquitecto]
- **Decisores**: [Jefe, Arquitecto, Usuario]

## Contexto y Planteamiento del Problema
[Describe en 1-2 párrafos el contexto de negocio y el problema técnico a resolver. Incluye los requisitos no funcionales relevantes (latencia, costo, escala).]

## Factores de Decisión
* [Factor 1: e.g. Necesidad de garantizar que no se pierdan eventos si el broker de mensajería se reinicia]
* [Factor 2: e.g. Presupuesto limitado de infraestructura que impide desplegar Kafka]
* [Factor 3: e.g. Familiaridad del equipo actual con PostgreSQL]

## Opciones Consideradas

### Opción 1: [Nombre de la Opción 1, ej. Doble Escritura Directa (BD + RabbitMQ)]
* **Descripción**: Publicar en RabbitMQ en la misma función tras ejecutar el insert en PostgreSQL.
* **Ventajas**: Muy simple de implementar inicialmente; sin tablas adicionales.
* **Desventajas**: Riesgo de inconsistencia severa ante fallas de red; pérdida de eventos o datos huérfanos.
* **Impacto en costo**: Nulo.

### Opción 2: [Nombre de la Opción 2, ej. Outbox Transaccional con Worker Poller]
* **Descripción**: Insertar eventos en una tabla outbox en la misma transacción y un proceso independiente publica con reintentos e idempotencia.
* **Ventajas**: Garantía de entrega at-least-once sin riesgo de pérdida; transacciones ACID locales; alta resiliencia.
* **Desventajas**: Latencia de propagación de 100-300 ms; requiere tabla y worker adicional.
* **Impacto en costo**: Mínimo (aprovecha la base de datos PostgreSQL existente).

### Opción 3: [Nombre de la Opción 3, ej. Clúster Apache Kafka con MirrorMaker]
* **Descripción**: Migrar toda la persistencia de eventos a un clúster dedicado de Kafka.
* **Ventajas**: Rendimiento masivo para millones de mensajes por segundo.
* **Desventajas**: Sobreingeniería masiva para el volumen actual (50 RPS); costo mensual de ~$600 USD innecesario.
* **Impacto en costo**: Alto.

## Resultado de la Decisión
Opción elegida: **Opción 2: Outbox Transaccional con Worker Poller**, porque proporciona la consistencia requerida por el negocio sin incrementar los costos de infraestructura ni la complejidad operacional del equipo.

### Consecuencias Positivas
* Se elimina completamente el riesgo de desincronización entre la base de datos y la cola.
* El equipo puede monitorear eventos pendientes directamente con consultas SQL en la tabla `outbox_events`.

### Consecuencias Negativas
* Los consumidores deben implementar control de idempotencia para tolerar mensajes duplicados en reintentos.
* Debe configurarse un proceso de limpieza periódica (purga) para evitar que la tabla outbox crezca indefinidamente.

## Enlaces y Referencias
* [Link a ticket o tarea de Orquest AI]
* [Link al diagrama C4 relacionado]
```
