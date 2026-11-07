# Defect Reporting and QA Verdict Structure

This reference defines the standard for documenting defects and incidents, ensuring developers can reproduce and resolve issues without ambiguity.

---

## 1. Severity Classification

- **Critical (P0)**:
  - Causes total service downtime, irrecoverable data loss, or high-severity security breaches.
  - Immediate verdict: `no_pasa`.
- **Major (P1)**:
  - A primary feature is non-functional with no viable workaround.
  - Immediate verdict: `no_pasa`.
- **Medium (P2)**:
  - A secondary flow fails or exhibits erroneous behavior, but a functional workaround exists.
  - If violating agreed acceptance criteria: `no_pasa`.
- **Minor (P3)**:
  - Cosmetic issues, minor typos, slight visual misalignments.
  - May yield `pasa` with noted observations if core acceptance criteria are satisfied.

---

## 2. Anatomy of a Defect Report

Every reported defect must include these 5 essential elements:

1. **Descriptive Title**: Format `[Module/Component] - Anomaly under specific condition`.
2. **Severity and Environment**: Criticality level, tested branch/commit, OS, browser, or runtime version.
3. **Exact Reproduction Steps (Numbered)**: Reproducible steps starting from a clean initial state.
4. **Expected vs Actual Behavior**: Contrast the requirement specification with observed reality.
5. **Evidence and Logs**: Screenshots, exact error logs with stack traces, or terminal outputs.

---

## 3. Real-World Defect Example

```markdown
### [Checkout] - HTTP 500 error on credit card payment without postal code
- **Severity**: Major (P1)
- **Environment**: Branch `feature/checkout-v2` (commit `a81b2c`), Node v20.10.0, PostgreSQL 16

#### Steps to Reproduce:
1. Log in with test user `test.qa@example.com`.
2. Add "Pro License" ($99) to cart.
3. Proceed to checkout and select "Credit Card" payment method.
4. Enter valid card number but leave "Postal Code" field empty.
5. Click "Confirm and Pay".

#### Expected Behavior:
Form highlights the "Postal Code" field with "Postal code is required" and returns HTTP 422.

#### Actual Behavior:
Screen freezes in loading state. Server logs display:
`Unhandled rejection: TypeError: Cannot read properties of undefined (reading 'postalCode') at PaymentGateway.charge (payment.js:45)`
API responds with HTTP 500 Internal Server Error.

#### Evidence:
- Screenshot attached: `capturas/error_500_checkout.png`
- Server log:
  ```
  [ERROR] 2026-11-06 19:15:22 - POST /api/v1/payments 500 in 142ms
  ```
```

---

## 4. QA Delivery Template (`entregar`)

When delivering your final review to the boss, use this structure:

```markdown
## Verdict: [pasa | no_pasa]

### Summary of Executed Tests:
- [x] Automated test suite execution (`npm test` or `pytest`): 42 tests passing.
- [x] Verification of task acceptance criteria.
- [x] Exploratory testing covering boundary conditions and error scenarios.

### Acceptance Criteria:
1. "User can register with email and password": MET.
2. "Confirmation email sent with signed token": MET.
3. "Prevents duplicate emails": MET.

### Findings / Detected Defects:
(If verdict is no_pasa, detail defects here following the structure in Section 2. If verdict is pasa and no issues found, state "None").

### Conclusion:
(Two-line summary explaining why the delivery is ready to merge or why it must return to the employee for rework).
```
