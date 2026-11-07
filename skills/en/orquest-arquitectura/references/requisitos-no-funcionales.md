# Non-Functional Requirements (NFR) and System Sizing

This reference defines how to elicit, quantify, and prioritize system quality attributes prior to making architectural commitments.

---

## 1. The Hazard of Ambiguous Requirements

Phrases such as *"the system must be fast and scalable"* are not requirements; they are desires. Every NFR must be expressed with an observable metric, a numerical threshold, and the conditions under which it holds.

| Ambiguous NFR | Quantified, Actionable NFR |
| :--- | :--- |
| "Must have high availability" | **99.9% Availability** (max 8.76 hours unscheduled annual downtime), permitting scheduled maintenance with 48h advance notice. |
| "Must respond quickly" | **Latency p95 ≤ 150 ms and p99 ≤ 400 ms** for read requests under up to 500 concurrent RPS. |
| "Must handle heavy traffic" | **Sustained load of 1,200 RPS** with anticipated peak load of 3,500 RPS during 2-hour promotional events. |
| "Must be secure" | **PCI-DSS Level 3 Compliance**: credit card data tokenized via third-party gateway; encryption in transit (TLS 1.3) and at rest (AES-256). |

---

## 2. Key Dimensions to Quantify

### A. Scalability and Volume
- **Read vs Write Ratio**: E.g., 90:10 for catalog browsing, 50:50 for chat messaging.
- **Storage Profile**: Initial data footprint, monthly storage growth rate (GB/month), and data retention/archiving policies.

### B. Availability and Disaster Recovery
- **SLA / SLO**: Define target service level objectives.
- **RTO (Recovery Time Objective)**: Maximum acceptable downtime to restore service following an outage (e.g., < 30 minutes).
- **RPO (Recovery Point Objective)**: Maximum acceptable data loss measured in time (e.g., < 5 minutes of transactions).

### C. Compliance and Governance
- **Applicable Regulations**: GDPR / LGPD (right to erasure, EU data residency), HIPAA (encrypted and audited health data), SOX.
- **Auditability**: Immutable audit trails for all administrative actions and sensitive entity mutations.

### D. Cost and Team Constraints
- **Cloud Budget**: Monthly infrastructure spending ceiling (e.g., $1,500 USD/month). An architecture requiring multi-region Kubernetes clusters is invalid if it exceeds budgetary boundaries.
- **Team Topologies**: Available engineers and technical capabilities. Do not design a 20-microservice architecture for a 3-person engineering team.

---

## 3. NFR Elicitation Checklist

- [ ] Latency percentiles (p50, p95, p99) defined for all critical paths?
- [ ] Requests per second (normal and peak RPS) estimated?
- [ ] RTO and RPO defined for infrastructure failovers?
- [ ] Legal compliance and data residency constraints identified?
- [ ] Projected infrastructure costs align with business budget?
