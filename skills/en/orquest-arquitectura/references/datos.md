# Data Strategy, Consistency, and Migrations

This reference covers architectural data management: persistence topology, consistency models, and zero-downtime database migrations.

---

## 1. Database Topology: Shared vs Database-per-Service

- **Database-per-Service**:
  - Each service exclusively owns its datastore or isolated schema.
  - No other service has network permissions or credentials to query tables directly; all access is mediated via APIs or events.
  - **Mandatory in microservice architectures** to enable independent schema changes.
- **Shared Database**:
  - Multiple services read and write to the same SQL tables directly.
  - **Acceptable only in modular monoliths** where code lives in a single repository and evolves within a single commit. In distributed systems, this is a severe anti-pattern.

---

## 2. Strong Consistency vs Eventual Consistency

- **Strong Consistency (ACID)**:
  - Guarantees immediate read visibility following commit.
  - Indispensable within individual aggregates and immediate balance/inventory deduction operations.
  - Relies on local relational transactions (PostgreSQL, MySQL).
- **Eventual Consistency (BASE)**:
  - Data synchronizes asynchronously; read projections may exhibit short replication lag (milliseconds to seconds).
  - Enables massive horizontal scaling and high read availability (CQRS projections, Elasticsearch indexes).

---

## 3. Zero-Downtime Migrations: Expand and Contract Pattern

Never apply destructive column renames or deletions in a single step while legacy application instances are serving live traffic. Execute across 3 phases:

1. **Phase 1 (Expand)**:
   - Add new columns or tables without modifying existing ones (e.g., add `phone_number_e164` while keeping `phone`).
   - New code writes to both columns, reading from the old column if the new one is null.
2. **Phase 2 (Background Backfill)**:
   - A batch migration script backfills historical data from old to new columns without table locks.
   - Code is updated to read and write exclusively from the new column.
3. **Phase 3 (Contract)**:
   - Once verified that zero application instances access the legacy column, drop the old column in a final cleanup migration.

---

## 4. Data Strategy Checklist

- [ ] Services do not share direct access to database tables.
- [ ] High-frequency queries leverage composite indexes to avoid sequential table scans.
- [ ] Schema changes follow the expand-and-contract pattern to avoid production table locks.
- [ ] Every forward migration has a tested rollback (`down`) migration.
