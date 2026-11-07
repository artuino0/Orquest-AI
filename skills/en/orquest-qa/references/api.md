# API Testing (REST / GraphQL)

This reference guides systematic HTTP endpoint verification: contracts, status codes, schemas, and error scenarios.

---

## 1. HTTP Status Code Validation

Ensure the API adheres to standard HTTP semantics:

- **200 OK**: Successful GET, PUT, or PATCH request returning content.
- **201 Created**: Successful resource creation (POST), with created entity in body and optional `Location` header.
- **204 No Content**: Successful operation returning no body (common for DELETE).
- **400 Bad Request**: Malformed JSON syntax or structural schema violations.
- **401 Unauthorized**: Missing, expired, or invalid authentication token.
- **403 Forbidden**: Valid token, but user lacks authorization for the resource.
- **404 Not Found**: Target resource identifier does not exist (`/api/orders/999999`).
- **409 Conflict**: State conflict (e.g., duplicate email address, optimistic locking clash).
- **422 Unprocessable Content**: Syntactically valid JSON failing business validation rules.
- **500 Internal Server Error**: **Should never occur in controlled test flows**. Indicates an unhandled exception and must trigger a `no_pasa` verdict.

---

## 2. Command-Line Verification with `curl`

### A. Resource Creation and Header Checks
```bash
curl -s -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{"email": "qa.test@example.com", "name": "QA Tester"}'
```

### B. Schema Validation Test (Expects 400 or 422)
```bash
curl -s -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{"email": "not-an-email"}'
```

### C. DELETE Idempotency Test
```bash
# First call should yield 200 or 204
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/api/v1/users/usr_123 \
  -H "Authorization: Bearer test_token"

# Immediate second call should yield 404
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/api/v1/users/usr_123 \
  -H "Authorization: Bearer test_token"
```

---

## 3. Contract and JSON Schema Integrity

Verify that API responses conform to backend contract documentation:

- Accurate data types: numeric values must not arrive as strings (`{"id": 12, "amount": 99.5}`, not `{"amount": "99.5"}`).
- Booleans as `true`/`false`, not `1`/`0`.
- ISO-8601 standardized date formats (`"2026-11-06T19:00:00Z"`).
- Consistent error payloads:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "The payload contains invalid fields",
      "details": [
        { "field": "email", "issue": "Invalid email address format" }
      ]
    }
  }
  ```

---

## 4. API Testing Checklist

- [ ] Endpoints return accurate HTTP status codes for success and error conditions.
- [ ] `Content-Type: application/json` headers are present in requests and responses.
- [ ] Omitting authorization headers returns 401 Unauthorized.
- [ ] Accessing another user's private resources returns 403 Forbidden or 404 Not Found.
- [ ] Zero unhandled 500 Internal Server Errors were triggered across all tests.
