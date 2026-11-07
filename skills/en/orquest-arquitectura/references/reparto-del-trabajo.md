# Work Breakdown and Dependency Graph for the Boss

This reference instructs the architect on transforming a technical design into executable work packages for Orquest AI specialized agents (`dba`, `backend`, `frontend`, `infra`, `qa`), minimizing blocking and enabling true parallel execution.

---

## 1. The Architect's Role Relative to the Boss

The **Boss** (`jefe`) coordinates employees, assigns tasks, and reviews deliverables (`asignar_tarea`, `revisar_entrega`).
The **Architect** designs the technical solution and **hands the boss the roadmap**:
1. What specific tasks must be created.
2. Which role/position should execute each task.
3. What input or contract is required for an agent to work unblocked.
4. The strict dependency ordering (`depende_de`) between tasks.

---

## 2. Parallelism Strategy: Contract-First

The most common workflow bottleneck is leaving frontend engineers waiting days while backend engineers build database schemas and business logic.

### Accelerated Parallelism Workflow:
1. **Step 1 (Immediate)**: Architect or backend defines the **API contract** (OpenAPI JSON/YAML with endpoints, DTOs, and mock response payloads).
2. **Step 2 (Parallel Execution)**:
   - **DBA**: Builds database schemas, tables, indexes, and initial migrations.
   - **Frontend**: Develops UI screens and integrates against a mock of the OpenAPI contract.
   - **Infra**: Configures Dockerfiles, docker-compose, and CI pipelines.
3. **Step 3 (Integration)**:
   - **Backend**: Implements business logic against the database provided by DBA, exposing the agreed OpenAPI contract.
   - **Frontend**: Switches mock URLs to live backend endpoints.
4. **Step 4 (Validation)**:
   - **QA**: Executes end-to-end and integration tests verifying acceptance criteria, issuing a verdict.

---

## 3. Task Graph Template for the Boss

Include this table in your architectural delivery so the boss can directly map values into `asignar_tarea`:

```markdown
### Proposed Task Graph for the Boss

| Task ID | Recommended Role | Title / Goal | Depends On (`depende_de`) | Key Input / Contract |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | `dba` | Database Schema and Accounts Migration | - | ERD diagram and data dictionary in ADR-002 |
| **T-02** | `infra` | Dockerfile and docker-compose (Postgres + Redis) | - | Stack versions specified in architecture |
| **T-03** | `backend` | OpenAPI Contract and Auth DTOs | - | Endpoint specifications in architecture doc |
| **T-04** | `frontend` | Login and Registration UI using Mocks | T-03 | OpenAPI contract generated in T-03 |
| **T-05** | `backend` | REST API Implementation connected to DB | T-01, T-02, T-03 | Schema from T-01 and infra from T-02 |
| **T-06** | `frontend` | Connect UI to Live Backend API | T-04, T-05 | Endpoint URLs and test credentials |
| **T-07** | `qa` | Integration and E2E Test Suite | T-05, T-06 | Acceptance criteria and user flows |
```

---

## 4. Task Breakdown Checklist

- [ ] Each task has a bounded scope and measurable acceptance criteria.
- [ ] Parallel tasks have no artificial cross-dependencies.
- [ ] API contracts or schema specs are provided as input before implementation begins.
- [ ] The QA task depends on all implementation deliverables it must validate.
