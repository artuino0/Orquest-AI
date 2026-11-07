# API Security (OWASP API Security Top 10)

This reference outlines security practices to protect Application Programming Interfaces (REST / GraphQL).

---

## 1. OWASP API Security Top 10 (2023)

1. **API1:2023 Broken Object Level Authorization (BOLA / IDOR)**: Manipulating object IDs in request URIs (`GET /api/documents/999`) to access other tenants' data. **Mitigation**: Validate that target entities belong to the authenticated caller.
2. **API2:2023 Broken Authentication**: Credential stuffing, weak token expiration, or missing rate limits on login routes.
3. **API3:2023 Broken Object Property Level Authorization (BOPLA)**: Mass assignment and excessive data exposure where database entities are returned without filtering private properties. **Mitigation**: Use strict output DTOs.
4. **API4:2023 Unrestricted Resource Consumption**: Missing rate limits, unbounded payload sizes, or missing query limits leading to DoS.
5. **API5:2023 Broken Function Level Authorization (BFLA)**: Standard users invoking administrative actions by changing the HTTP method or path (`POST /api/admin/users`).
6. **API6:2023 Unrestricted Access to Sensitive Business Flows**: Automated bot abuse of business operations (ticket scalping, spam account creation).
7. **API7:2023 Server Side Request Forgery (SSRF)**: APIs fetching user-supplied URLs without restricting requests to private subnets.
8. **API8:2023 Security Misconfiguration**: Overly permissive CORS policies, unhandled debug endpoints, or legacy HTTP methods enabled.
9. **API9:2023 Improper Inventory Management**: Unpatched, undocumented shadow APIs or legacy versions (`/api/v1/legacy`) still reachable.
10. **API10:2023 Unsafe Consumption of APIs**: Trusting data returned by third-party integrations without strict validation and sanitization.

---

## 2. Rate Limiting and Quotas

Implement sliding window or token bucket rate limiting (via Redis):

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1730920000
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry in 60 seconds."
  }
}
```

---

## 3. Restrictive CORS Configuration

- **Never configure `Access-Control-Allow-Origin: *`** when APIs support cookies or `Authorization: Bearer` headers.
- Validate `Origin` headers against an explicit domain whitelist:
  ```http
  Access-Control-Allow-Origin: https://app.example.com
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Authorization, Content-Type
  ```

---

## 4. API Security Checklist

- [ ] All resource lookups verify ownership against the authenticated caller (BOLA/IDOR).
- [ ] Response payloads use explicit DTOs to avoid leaking internal database columns.
- [ ] Rate limiting is enforced globally and tightened on authentication routes.
- [ ] CORS policies reject unauthorized origins and avoid wildcards with credentials.
- [ ] Outbound URLs validate IP addresses to prevent SSRF against private subnets (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254).
