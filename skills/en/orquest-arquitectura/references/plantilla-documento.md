# Software Architecture Document Template

Use this comprehensive template to prepare the master architectural specification for a system or project in Orquest AI.

---

```markdown
# Software Architecture Document: [System Name]

- **Version**: 1.0.0
- **Date**: [YYYY-MM-DD]
- **Lead Architect**: [Name]
- **Status**: [Draft / In Review / Approved]

---

## 1. Introduction and Business Goals
- **1.1 System Purpose**: [Executive summary of what the system does and who it serves].
- **1.2 Strategic Goals**: [Key business metrics, e.g., support 50,000 active users].
- **1.3 Scope and Boundaries**: [What is explicitly in-scope and out-of-scope].

---

## 2. Non-Functional Requirements (NFR) and Constraints
- **Availability**: 99.9% SLA (max 43 minutes monthly unscheduled downtime).
- **Performance**: Latency p95 < 200 ms under sustained 800 RPS peak load.
- **Security**: JWT / OIDC authentication, RBAC authorization, AES-256 data encryption at rest.
- **Compliance**: GDPR compliance (EU data residency, right to erasure).
- **Cost Constraints**: Maximum monthly infrastructure budget: $1,200 USD.

---

## 3. Key Architectural Decisions (ADR Summary)
- **ADR-001**: Adoption of Modular Monolith with internal Clean Architecture.
- **ADR-002**: Relational persistence in PostgreSQL 16 with monthly range partitioning.
- **ADR-003**: Asynchronous task queue backed by Redis Streams.

---

## 4. Architectural Views (C4 Model with Mermaid)
### 4.1 System Context View (C4 Level 1)
[Mermaid diagram illustrating users, central software system, and external third-party systems].

### 4.2 Containers View (C4 Level 2)
[Mermaid diagram detailing Web Frontend, API Backend, Primary Database, Queue Broker, and S3 Storage].

### 4.3 Components View (C4 Level 3)
[Mermaid diagram showing internal module structure and hex ports/adapters].

---

## 5. Integration Design and Data Contracts
- **API Protocol**: REST over HTTPS specified via OpenAPI 3.1.
- **Event Contracts**: Versioned JSON schemas published to the message broker.
- **Error Handling**: Standardized RFC 7807 (Problem Details for HTTP APIs).

---

## 6. Data Strategy and Persistence
- **Entity-Relationship Model**: [Core ERD diagram and table definitions].
- **Migrations**: Zero-downtime expand-and-contract migrations with reversible rollback scripts.
- **Backups and Retention**: Daily automated snapshots, 30-day retention, RTO < 1h, RPO < 15 min.

---

## 7. Resilience and Security Strategy
- **Timeouts**: 2-second timeout for third-party HTTP calls, 5 seconds for database queries.
- **Retries**: Up to 3 retries with exponential backoff and full jitter for transient network failures.
- **Circuit Breakers**: Trip open upon 50% failures across a 30-second window.
- **Threat Modeling**: STRIDE evaluated and verified against `orquest-seguridad`.

---

## 8. Observability and Operations
- **Logs**: Structured JSON logs written to stdout with distributed `trace_id` correlation.
- **Metrics**: RED metrics exposed via `/metrics` in Prometheus format.
- **Tracing**: OpenTelemetry instrumentation reporting to Jaeger/Tempo.

---

## 9. Implementation Breakdown for the Boss
[Work package matrix categorized by role: DBA, Backend, Frontend, Infra, QA with dependency graph].
```
