# Risk-Based Test Planning

This reference outlines how to design a concise, actionable, and risk-prioritized test plan.

---

## 1. Risk Assessment and Prioritization

Not everything can be tested with equal depth in every iteration. Allocate effort using an impact and probability matrix:

| Risk Level | Criteria | Testing Strategy |
| :--- | :--- | :--- |
| **Critical (P0)** | Authentication, payment processing, database integrity, data loss prevention. | Comprehensive unit tests, integration tests with realistic mocks, exhaustive negative tests, and automated E2E. |
| **High (P1)** | Primary business flows (checkout, core resource management, search filters). | API integration testing, business rule validation, and boundary testing. |
| **Medium (P2)** | Secondary exports, non-blocking notifications, configuration panels. | Basic integration tests and exploratory review. |
| **Low (P3)** | Minor cosmetic tweaks, informational labels, tooltips. | Visual inspection and layout verification. |

---

## 2. Structure of a Rapid Test Plan

Before executing complex tests, document:

1. **Delivery Goal**: What problem does the reviewed change solve?
2. **In-Scope Areas**: Modified features and directly impacted services.
3. **Out-of-Scope**: Unaffected system components not requiring deep validation.
4. **Test Case Matrix**:
   - Functional (Positive) Cases.
   - Boundary / Negative Cases.
   - Regression Checks.
5. **Required Test Data**: Fixtures and user accounts with specific roles (admin, customer, guest).

---

## 3. Practical Example: Invoicing Discount Feature

```markdown
### Test Plan: Invoice Discount Application
- **Risk**: High (Financial calculations).
- **Scenarios**:
  1. [P0] Invoice with 10% coupon calculates correct deduction on subtotal prior to taxes.
  2. [P0] Invoice with fixed amount ($50) exceeding total clamps to $0 total, never a negative amount.
  3. [P1] Applying expired coupon returns HTTP 422 with clear message.
  4. [P1] Concurrent reapplication of single-use coupon prevents double redemption.
  5. [Regression] Standard invoicing without coupon calculates tax and totals identically.
```

---

## 4. Test Plan Checklist

- [ ] Critical components affected by the change are identified.
- [ ] P0 and P1 cases cover both success and expected failure modes.
- [ ] Test fixtures and credentials exist without touching live production data.
- [ ] Clear pass/fail criteria are defined for each test scenario.
