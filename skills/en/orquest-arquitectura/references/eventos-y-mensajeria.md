# Events, Messaging, and Asynchronous Coordination

This reference details how to design resilient event-driven systems (EDA), guaranteeing reliable delivery and distributed consistency.

---

## 1. The Dual-Write Problem

When a service updates its local database and publishes an event to a message broker (RabbitMQ, Kafka, SQS) in the same handler:
- If the database commits but the network to the broker fails, the event is permanently lost.
- If the broker accepts the event but the database transaction rolls back, phantom events are emitted.

### Solution: Transactional Outbox Pattern

1. In the **same atomic database transaction** that updates business state, write the serialized event into an `outbox_events` table.
2. An asynchronous background process (or Change Data Capture stream like Debezium) polls unprocessed outbox records and publishes them to the broker.
3. Upon broker acknowledgment (ACK), mark the event as published or purge it.

```sql
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

## 2. Delivery Guarantees and Consumer Idempotency

In distributed networks, only two transport guarantees exist: **At-most-once** or **At-least-once**. True end-to-end "exactly-once" network delivery is impossible; duplicates inevitably occur during network hiccups and service restarts.

**Golden Rule**: Every event consumer MUST be idempotent.
- The consumer must store the incoming `message_id` in a `processed_messages` table within its local transaction.
- If a duplicate message arrives, detect the existing key, bypass business execution, and ACK the message to the broker.

---

## 3. Distributed Transaction Coordination: Saga Pattern

When business transactions span multiple microservices, two-phase commits (2PC / XA) do not scale and hold locks. A **Saga** organizes a sequence of local transactions where each step publishes an event triggering the next step. If a step fails, **compensating transactions** are executed in reverse order.

### Choreographed vs Orchestrated Sagas

- **Choreography**: Each service listens for events and independently decides actions without a central coordinator.
  - *Best for*: Simple flows with 2-3 participating services.
  - *Risk*: Difficult to trace end-to-end workflows; risk of invisible circular dependencies.
- **Orchestration**: A centralized orchestrator (State Machine) dispatches explicit commands to participants, processes replies, and coordinates rollbacks.
  - *Best for*: Complex multi-step business transactions (e.g., e-commerce checkout with stock reservation, payment charging, and shipping dispatch).

---

## 4. Event Architecture Checklist

- [ ] Dual-write hazards prevented by using the Transactional Outbox pattern.
- [ ] All message consumers implement idempotency checks with unique message IDs.
- [ ] Events are immutable and include metadata (`event_id`, `timestamp`, `version`, `payload`).
- [ ] Dead Letter Queues (DLQ) are configured for messages that fail after exhausted retries.
