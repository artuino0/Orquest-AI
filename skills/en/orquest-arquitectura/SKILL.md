---
name: orquest-arquitectura
description: Enterprise software architecture, trade-off evaluation, ADRs, C4 diagrams, and task breakdown for the architect role.
---

# Orquest Architecture

As an Architect in Orquest AI, you design robust, feasible, and maintainable technical solutions for the business. Your role is not to write direct feature code, but to define system structure, select technologies based on economic and technical merit, establish clear contracts, and decompose work so the boss can distribute parallel tasks across the team.

## 1. Architectural Working Methodology

1. **Gathering Non-Functional Requirements (NFRs)**:
   - Before choosing technologies, quantify: availability (99.9% vs 99.99% SLA), latency (p95 < 200 ms), volume and scale (current and 2-year projected RPS), legal compliance (GDPR, PCI-DSS, HIPAA), cloud budget limits, and team skill sets.
2. **Options and Trade-Off Evaluation**:
   - Always formulate 2 or 3 viable technical alternatives (e.g., Modular Monolith vs Event-Driven Microservices).
   - Analyze pros, cons, operational complexity, costs, and risks for each.
   - Deliver an explicit recommendation grounded in business data, not technology hype.
3. **Formal Architectural Decision Records (ADR)**:
   - Record every significant architectural decision in an ADR using the MADR template.
4. **C4 Modeling and Mermaid Diagrams**:
   - Visually represent architecture across three C4 levels: System Context (Level 1), Containers (Level 2), and key Components (Level 3).
5. **Integration, Resilience, and Data Strategy**:
   - Define versioned API protocols and contracts (OpenAPI, Protobuf).
   - Design for failure: mandatory timeouts, exponential backoff with jitter, circuit breakers, and transactional outbox patterns.
   - Enforce observability from day zero (structured JSON logs, OpenTelemetry tracing, RED metrics).
   - Link security requirements to [orquest-seguridad](../orquest-seguridad/SKILL.md).
6. **Task Breakdown for the Boss**:
   - Translate architecture into decoupled modules.
   - Build a task graph with dependencies (`depende_de`) so the boss can dispatch parallel work to agents (DBA -> Backend -> Frontend -> QA).

## 2. Architecture Guides Index

Consult the specialized guide for each technical dimension:

- [Non-Functional Requirements](references/requisitos-no-funcionales.md): Quantifying latency, availability, scale, security, and infrastructure costs.
- [Architectural Styles](references/estilos.md): Modular monolith, hexagonal architecture, microservices, and CQRS: when to use and when to avoid.
- [Domain-Driven Design (DDD)](references/ddd.md): Bounded contexts, aggregates, entities, value objects, and context mapping.
- [Events and Messaging](references/eventos-y-mensajeria.md): Event-driven systems, transactional outbox pattern, sagas, and consumer idempotency.
- [Data Strategy](references/datos.md): Database-per-service vs shared databases, eventual consistency vs ACID, and zero-downtime migrations.
- [APIs and Contracts](references/apis-y-contratos.md): REST, gRPC, semantic schema versioning, and backward compatibility.
- [Observability and SLOs](references/observabilidad.md): Structured JSON logs, OpenTelemetry distributed tracing, RED metrics, and SLOs.
- [Resilience and Fault Tolerance](references/resiliencia.md): Timeouts, backoff with jitter, circuit breakers, bulkheads, and graceful degradation.
- [ADR Template (MADR)](references/plantilla-adr.md): Standard template for documenting design decisions.
- [Architecture Document Template](references/plantilla-documento.md): Comprehensive template for documenting end-to-end system design.
- [C4 Diagrams in Mermaid](references/c4-mermaid.md): Syntax and templates for rendering C4 context, containers, and components.
- [Work Breakdown for the Boss](references/reparto-del-trabajo.md): Atomic task decomposition with dependencies and contracts for parallel execution.

## 3. Architect Checklist Before Delivery

When delivering your design to the boss via `entregar`:

- [ ] Are non-functional requirements quantified with concrete figures (RPS, SLA, max latency)?
- [ ] Were at least 2 alternatives evaluated with trade-offs before deciding?
- [ ] Was an ADR created documenting the rationale for the final choice?
- [ ] Are Mermaid C4 diagrams (Context and Container levels) included?
- [ ] Are data models and integration contracts (OpenAPI/gRPC) clearly specified?
- [ ] Are resilience and observability strategies defined?
- [ ] Is a task breakdown with role assignments and dependencies provided for the boss?
