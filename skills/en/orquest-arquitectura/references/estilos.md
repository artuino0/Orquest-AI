# Architectural Styles: When to Use and When to Avoid

This reference analyzes primary software architectural styles, their ideal application domains, and their operational risks.

---

## 1. Modular Monolith

All application code resides in a single repository and deploys as a single executable or container, but internal structure enforces strict, unidirectional module boundaries.

- **When to Use**:
  - Greenfields projects, MVPs, and small-to-medium teams (< 20 engineers).
  - Standard enterprise systems requiring low latency and simple ACID transactional consistency.
- **When to Avoid**:
  - Massive organizations where dozens of independent squads encounter deployment bottlenecks and release train lockups.
  - Subsystems with radically divergent scaling requirements (e.g., heavy GPU machine learning vs lightweight static HTML delivery).
- **Pros**: Straightforward deployment, refactoring safety via compiler, atomic database transactions, trivial local debugging.
- **Risks**: Module boundary erosion if architecture fitness functions (e.g., ArchUnit, dependency-cruiser) are not enforced in CI.

---

## 2. Hexagonal Architecture (Ports & Adapters) / Clean Architecture

Isolates core domain business logic from infrastructure details (databases, web frameworks, message brokers, external APIs). The domain defines ports (interfaces) and infrastructure provides adapters.

- **When to Use**:
  - Applications with rich, evolving domain rules that must remain independent of external libraries.
  - Systems requiring high unit testability without running live databases or network dependencies.
- **When to Avoid**:
  - Simple CRUD applications where 90% of requests simply map database rows to JSON responses. In such cases, ports and adapters introduce unnecessary overhead without practical benefit.

---

## 3. Microservices

Decomposes the system into a collection of autonomous, independently deployable services, each holding exclusive ownership over its own datastore (Database-per-Service).

- **When to Use**:
  - Multiple autonomous teams working on decoupled domain contexts requiring independent release cadences.
  - Real, proven requirements to scale distinct services asymmetrically.
- **When to Avoid**:
  - Small teams (< 15 engineers).
  - Unclear domain boundaries (results in a **distributed monolith**: network overhead with none of the autonomy).
- **Trade-offs**: Extreme operational overhead (service meshes, distributed tracing, network partitions, eventual consistency).

---

## 4. CQRS (Command Query Responsibility Segregation)

Separates the write model (Commands: validate rules, mutate state) from the read model (Queries: optimized projections for high-speed retrieval).

- **When to Use**:
  - Systems with massive read/write asymmetry (e.g., 100 reads per write).
  - Complex reporting requirements where OLTP tables cannot support fast aggregate queries.
- **When to Avoid**:
  - Typical transactional systems where queries read from the same tables updated by commands.
- **Trade-offs**: Propagation delays to read views (eventual consistency); maintaining dual models and sync pipelines.

---

## 5. Architectural Style Comparison

| Criteria | Modular Monolith | Hexagonal (in Monolith) | Microservices | CQRS + Event-Driven |
| :--- | :--- | :--- | :--- | :--- |
| **Deployment Complexity** | Very Low | Very Low | Very High | High / Very High |
| **Transactional Consistency**| Strong (ACID) | Strong (ACID) | Eventual | Eventual |
| **Testability** | High | Very High | Complex | Complex |
| **Organizational Scale** | Moderate | Moderate | Very High | High |
| **Infrastructure Cost** | Low | Low | High | Medium-High |

---

## 6. Critical Architectural Anti-Patterns

1. **Premature Microservices**: Starting a new greenfield project as microservices before domain boundaries are understood.
2. **Distributed Monolith**: Multiple services that must deploy together because they share a database or rely on tightly coupled synchronous HTTP cascades.
3. **Shared Database Across Services**: Multiple services reading and writing to the same SQL tables directly, breaking encapsulation and preventing schema evolution.
