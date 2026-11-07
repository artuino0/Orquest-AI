# Architecture Decision Record Template (ADR - MADR v3)

Use this template based on MADR (Markdown Architectural Decision Records) to formally document significant technical design choices.

---

```markdown
# ADR-[NUMBER]: [Short imperative title, e.g., Use Outbox Pattern for Notifications]

- **Status**: [proposed | accepted | rejected | deprecated | superseded by ADR-XXX]
- **Date**: [YYYY-MM-DD]
- **Author(s)**: [Architect Name / Role]
- **Deciders**: [Boss, Architect, User]

## Context and Problem Statement
[Describe in 1-2 paragraphs the business context and technical problem. Include relevant non-functional requirements (latency, cost, scale).]

## Decision Drivers
* [Driver 1: e.g., Guarantee no event loss if message broker restarts]
* [Driver 2: e.g., Cloud budget limits preventing standalone Kafka deployment]
* [Driver 3: e.g., Team familiarity with PostgreSQL]

## Considered Options

### Option 1: [Option 1 Name, e.g., Direct Dual-Write (DB + RabbitMQ)]
* **Description**: Publish to RabbitMQ inside the application handler right after inserting into PostgreSQL.
* **Pros**: Simple initial implementation; no auxiliary tables required.
* **Cons**: High risk of data inconsistency during network faults; lost events or orphaned rows.
* **Cost Impact**: None.

### Option 2: [Option 2 Name, e.g., Transactional Outbox with Background Worker]
* **Description**: Write events to an outbox table in the same DB transaction; an async poller publishes with retries.
* **Pros**: Guaranteed at-least-once delivery; local ACID transactions; high fault resilience.
* **Cons**: 100-300 ms propagation delay; requires dedicated poller table and worker.
* **Cost Impact**: Minimal (uses existing PostgreSQL database).

### Option 3: [Option 3 Name, e.g., Apache Kafka Cluster with MirrorMaker]
* **Description**: Migrate all event publishing and storage to a managed Kafka cluster.
* **Pros**: Massive throughput supporting millions of messages per second.
* **Cons**: Extreme overengineering for current load (50 RPS); ~$600 USD/month unnecessary cost.
* **Cost Impact**: High.

## Decision Outcome
Chosen option: **Option 2: Transactional Outbox with Background Worker**, because it delivers the required delivery guarantees without increasing cloud infrastructure costs or team operational complexity.

### Positive Consequences
* Completely removes risk of desynchronization between database state and message broker.
* Team can inspect pending events directly with SQL queries against `outbox_events`.

### Negative Consequences
* Downstream consumers must implement idempotency controls to tolerate duplicate delivery during retries.
* Requires a periodic retention cleanup job to prevent unbounded outbox table growth.

## Links and References
* [Link to Orquest AI ticket or task]
* [Link to related C4 diagram]
```
