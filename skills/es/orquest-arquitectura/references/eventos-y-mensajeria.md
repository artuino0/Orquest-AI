# Eventos, Mensajería y Coordinación Asíncrona

Esta referencia explica cómo diseñar sistemas reactivos y desacoplados basados en eventos (Event-Driven Architecture), garantizando entrega confiable y consistencia.

---

## 1. El Peligro de la Doble Escritura (Dual-Write Problem)

Cuando un servicio intenta actualizar su base de datos local y publicar un mensaje en un broker (RabbitMQ, Kafka, SQS) en la misma operación:
- Si la BD confirma pero la red hacia el broker falla, el evento se pierde para siempre.
- Si el broker confirma pero la BD hace rollback, el sistema genera datos fantasma.

### Solución: Patrón Outbox Transaccional (Transactional Outbox)

1. En la **misma transacción atómica de base de datos** donde guardas la entidad de negocio, inserta el evento serializado en una tabla `outbox_events`.
2. Un proceso relay asíncrono (o lector de Change Data Capture / Debezium) lee los eventos no procesados de la tabla `outbox_events` y los publica en el broker.
3. Una vez confirmado por el broker (ACK), marca el evento como publicado o bórralo.

```sql
-- Tabla Outbox en la misma BD relacional
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE NULL
);
```

---

## 2. Garantía de Entrega e Idempotencia en Consumidores

En sistemas distribuidos reales solo existen dos garantías de transporte: **A lo sumo una vez (At-most-once)** o **Al menos una vez (At-least-once)**. El concepto "exactamente una vez" (*exactly-once*) a nivel de red no existe; la duplicidad de mensajes ocurrirá ante reinicios o desconexiones.

**Regla de Oro**: Todo consumidor de mensajes DEBE ser idempotente.
- El consumidor debe registrar el `message_id` en una tabla de mensajes procesados (`processed_messages`) dentro de una transacción local.
- Si llega un mensaje duplicado, se detecta la clave existente, se ignora el procesamiento de negocio y se envía el ACK al broker.

---

## 3. Coordinación de Transacciones Distribuidas: Patrón Saga

Cuando un proceso abarca múltiples microservicios o agregados, una transacción distribuida de dos fases (2PC / XA) no escala y bloquea recursos. Se utiliza una **Saga**: una secuencia de transacciones locales donde cada paso emite un evento y desencadena el siguiente. Si un paso falla, se ejecutan **transacciones compensatorias** hacia atrás.

### Sagas Coreografiadas vs Sagas Orquestadas

- **Coreografía**: Cada servicio escucha eventos y decide autónomamente qué hacer sin un coordinador central.
  - *Ideal para*: Procesos cortos con 2 o 3 participantes simples.
  - *Riesgo*: Difícil de rastrear el flujo completo; riesgo de dependencias circulares invisibles.
- **Orquestación**: Un servicio central orquestador (State Machine) envía comandos explícitos a los participantes, evalúa las respuestas y coordina las compensaciones.
  - *Ideal para*: Procesos de negocio complejos (ej. checkout de comercio electrónico con reserva de stock, cobro con tarjeta y envío logístico).

---

## 4. Checklist de Arquitectura de Eventos

- [ ] ¿Se previene el problema de doble escritura implementando el patrón Outbox?
- [ ] ¿Todos los consumidores implementan control de idempotencia con IDs únicos de mensaje?
- [ ] ¿Los eventos son inmutables y contienen suficiente contexto (`event_id`, `timestamp`, `version`, `payload`)?
- [ ] ¿Se cuenta con una cola de mensajes no procesables (*Dead Letter Queue* - DLQ) para mensajes que fallan repetidamente tras reintentos?
