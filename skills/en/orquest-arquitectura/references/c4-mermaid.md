# C4 Architecture Diagrams in Mermaid

This reference provides Mermaid diagram templates compatible with GitHub and Markdown viewers for rendering C4 model levels (Context, Containers, and Components).

---

## 1. Level 1: System Context Diagram

Shows the system in the center, interacting human users, and external software systems.

```mermaid
flowchart TD
    classDef person fill:#08427b,stroke:#052e56,color:#fff;
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff;
    classDef external fill:#999999,stroke:#666666,color:#fff;

    Customer["👤 Bank Customer<br>[Person]<br>Checks balance and transfers money"]:::person
    Staff["👤 Operations Officer<br>[Person]<br>Internal bank audit staff"]:::person

    CoreSystem["🏦 Digital Banking System<br>[Software System]<br>Manages bank accounts, payments, and ledger"]:::system

    PaymentGateway["💳 External Payment Gateway<br>[External System]<br>Processes Visa/Mastercard transactions"]:::external
    NotificationService["✉️ SMS / Email Gateway<br>[External System]<br>Dispatches OTP codes and alerts"]:::external

    Customer -->|"Checks balance and transfers funds [HTTPS]"| CoreSystem
    Staff -->|"Audits suspicious transfers [HTTPS]"| CoreSystem
    CoreSystem -->|"Processes card payments [REST/TLS]"| PaymentGateway
    CoreSystem -->|"Sends security alerts [API HTTPS]"| NotificationService
```

---

## 2. Level 2: Containers Diagram

Decomposes the system into independently deployable software units (frontends, backend services, datastores).

```mermaid
flowchart TD
    classDef person fill:#08427b,stroke:#052e56,color:#fff;
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff;
    classDef db fill:#235789,stroke:#173b5c,color:#fff;
    classDef external fill:#999999,stroke:#666666,color:#fff;

    Customer["👤 Bank Customer"]:::person

    subgraph CoreSystemBoundary["Digital Banking System [System Boundary]"]
        SPA["🌐 Single-Page Application<br>[React / TypeScript]<br>Browser client application"]:::container
        APIGateway["🚪 API Gateway & Auth<br>[Node.js / Express]<br>Routing, rate limiting, and JWT validation"]:::container
        BackendAPI["⚙️ Core Banking API<br>[Go / Gin]<br>Business logic for accounts and transfers"]:::container
        EventBroker["📨 Message Broker<br>[RabbitMQ]<br>Asynchronous event queues"]:::container
        WorkerService["🔄 Background Worker<br>[Go]<br>Reconciliation and delayed processing"]:::container
        MainDB[("🗄️ Primary Database<br>[PostgreSQL 16]<br>Accounts, balances, and ledger")]:::db
        Cache[("⚡ Session Cache<br>[Redis 7]<br>Tokens and blacklist")]:::db
    end

    ExternalGateway["💳 External Gateway"]:::external

    Customer -->|"Interacts with [HTTPS]"| SPA
    SPA -->|"API calls [JSON/HTTPS]"| APIGateway
    APIGateway -->|"Verifies token [TCP]"| Cache
    APIGateway -->|"Forwards authorized requests [gRPC]"| BackendAPI
    BackendAPI -->|"Reads and writes transactions [SQL/TCP]"| MainDB
    BackendAPI -->|"Publishes outbox events [AMQP]"| EventBroker
    EventBroker -->|"Consumes events [AMQP]"| WorkerService
    WorkerService -->|"Updates ledger state [SQL/TCP]"| MainDB
    WorkerService -->|"Reconciles payments [REST/TLS]"| ExternalGateway
```

---

## 3. Level 3: Components Diagram (Core Banking Module)

Shows how a specific container is organized internally using hexagonal architecture.

```mermaid
flowchart TD
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000;
    classDef port fill:#f4a261,stroke:#e76f51,color:#000;
    classDef infra fill:#2a9d8f,stroke:#264653,color:#fff;

    subgraph Container["Core Banking API Container"]
        Controller["TransferController<br>[REST Component]<br>Handles HTTP requests and maps DTOs"]:::component
        Service["TransferService<br>[Domain Component]<br>Applies business rules and limits"]:::component
        AccountRepoPort["AccountRepository<br>[Port / Interface]"]:::port
        EventPublisherPort["EventPublisher<br>[Port / Interface]"]:::port

        SQLRepo["PostgresAccountRepository<br>[Infrastructure Adapter]"]:::infra
        RabbitPublisher["RabbitMQEventPublisher<br>[Infrastructure Adapter]"]:::infra
    end

    Database[("PostgreSQL")]:::infra
    Queue[("RabbitMQ")]:::infra

    Controller --> Service
    Service --> AccountRepoPort
    Service --> EventPublisherPort
    SQLRepo -.->|"Implements"| AccountRepoPort
    RabbitPublisher -.->|"Implements"| EventPublisherPort
    SQLRepo --> Database
    RabbitPublisher --> Queue
```

---

## 4. Mermaid Diagram Checklist

- [ ] Container and system nodes specify primary technology in brackets (e.g., `[Go / Gin]`).
- [ ] Connecting arrows describe communication protocol in brackets (e.g., `[gRPC]`, `[JSON/HTTPS]`).
- [ ] Context diagram includes human actors and external systems.
- [ ] Diagrams stay within 12-15 nodes for visual clarity and readability.
