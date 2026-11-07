# APIs, Integration Contracts, and Versioning

This reference establishes guidelines for defining, documenting, and governing communication interfaces between components and external services.

---

## 1. Protocol Selection: REST vs gRPC vs GraphQL

| Protocol | Mechanism | Optimal Use Case | Trade-offs |
| :--- | :--- | :--- | :--- |
| **REST (JSON/HTTP)** | Standard HTTP methods, resource-oriented (GET/POST/PUT/DELETE). | Public third-party APIs, web/mobile clients, native HTTP caching. | Larger JSON payloads, text serialization overhead, risk of over/under-fetching. |
| **gRPC (Protobuf/HTTP2)** | Strongly typed binary RPC, multiplexing, bidirectional streaming. | Internal high-throughput service-to-service communication (East-West traffic). | Requires compiled stubs (.proto); difficult to inspect with standard browser dev tools. |
| **GraphQL** | Single POST endpoint with declarative client-driven query language. | Backend-for-Frontend (BFF) layer aggregating multiple complex microservice entities. | Complex CDN caching, risk of expensive nested queries (recursive DoS attacks). |

---

## 2. Contract Governance and Versioning

### Golden Rule: Backward Compatibility
A change to an existing API must never break running clients without an agreed transition path.

- **Non-Breaking Changes (Freely Permitted)**:
  - Adding optional fields to response objects.
  - Adding independent endpoints.
  - Adding optional query parameters with sensible defaults.
- **Breaking Changes (Require a New Major Version)**:
  - Deleting or renaming existing fields.
  - Modifying field data types (e.g., number to string).
  - Making previously optional request parameters mandatory.
  - Altering standard HTTP status codes returned for errors.

### Versioning Strategy
- Prefer explicit URI versioning for public APIs: `/api/v1/orders`.
- Formally document contracts using **OpenAPI 3.1** (Swagger) or `.proto` files in a centralized schema repository.

---

## 3. Contract Design Checklist

- [ ] Formal API specification (OpenAPI / Protobuf) created before implementation begins.
- [ ] REST resource names use plural nouns (`/users`, `/orders`) instead of verbs.
- [ ] Proposed modifications preserve backward compatibility or increment the major version.
- [ ] Rate limits and quotas are documented in HTTP response headers.
