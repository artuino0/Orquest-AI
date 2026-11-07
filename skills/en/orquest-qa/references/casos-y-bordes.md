# Test Cases and Edge Cases

This reference provides techniques for boundary value analysis and equivalence partitioning to uncover bugs that escape simple happy path testing.

---

## 1. Core Test Design Techniques

### A. Equivalence Partitioning
Divide inputs into classes expected to exhibit uniform behavior:
- **Example (Registration age between 18 and 65)**:
  - Invalid underage class: `17` or lower.
  - Valid class: `18` to `65`.
  - Invalid overage class: `66` or higher.
Test one representative value from each partition to avoid redundant tests.

### B. Boundary Value Analysis (BVA)
Most software errors occur at the boundary conditions (`<` vs `<=`).
For a valid range `[min, max]`, test:
- `min - 1`, `min`, `min + 1`
- `max - 1`, `max`, `max + 1`

---

## 2. Common Edge Case Catalog by Data Type

### String Data (`strings`)
- Empty string `""`.
- Whitespace-only string `"   "`.
- Very large strings (10,000+ characters to test buffer overflows or denial of service).
- Special characters and Unicode: emojis (`🚀`), accented characters (`año`, `straße`), non-Latin scripts (`日本語`, `العربية`).
- Injection probes: `"' OR 1=1 --"`, `<script>alert(1)</script>`, `../../etc/passwd`.
- Leading and trailing spaces: `"  test@example.com  "` (is input properly trimmed?).

### Numbers and Currency (`numbers`)
- Zero (`0`, `0.00`).
- Negative numbers (`-1`, `-0.01`).
- Integer bounds: `2^31 - 1` (2,147,483,647) and `2^63 - 1`.
- Floating point inaccuracies: `0.1 + 0.2 !== 0.3`. Ensure proper decimal rounding for currency.
- Division by zero.

### Collections and Lists (`arrays` / `lists`)
- Empty collection `[]`.
- Collection with exactly 1 element (tests off-by-one errors in fold/reduce operations or trailing commas).
- Collection with identical duplicates.
- Pagination: requesting page `0`, page `-1`, or page exceeding total records (page `99999`).

### Dates and Times (`datetime`)
- Leap year dates (`February 29`).
- Year transitions (`December 31 to January 01`).
- Timezone offsets (UTC vs local zones with positive and negative offsets).
- Daylight Saving Time transitions (repeated or skipped hours).

---

## 3. Edge Case Checklist

- [ ] What happens if required fields are sent as `null` or omitted in JSON?
- [ ] What happens with strings containing leading or trailing whitespace?
- [ ] Was behavior tested for both empty arrays and arrays containing thousands of items?
- [ ] How does the system handle negative numbers where only positive quantities are allowed?
- [ ] Are dates with offsets outside the server's local timezone handled consistently?
