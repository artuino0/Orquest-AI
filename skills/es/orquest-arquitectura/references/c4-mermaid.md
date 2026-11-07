# Diagramas C4 con Mermaid

Esta referencia proporciona plantillas y sintaxis Mermaid compatibles con GitHub y herramientas estándar para renderizar los niveles del modelo C4 (Contexto, Contenedores y Componentes).

---

## 1. Nivel 1: Diagrama de Contexto del Sistema

Muestra el sistema en el centro, los usuarios que interactúan con él y los sistemas externos con los que se conecta.

```mermaid
flowchart TD
    classDef person fill:#08427b,stroke:#052e56,color:#fff;
    classDef system fill:#1168bd,stroke:#0b4884,color:#fff;
    classDef external fill:#999999,stroke:#666666,color:#fff;

    Customer["👤 Cliente Bancario<br>[Persona]<br>Cliente que consulta su saldo y transfiere dinero"]:::person
    Staff["👤 Oficial de Operaciones<br>[Persona]<br>Personal interno que audita movimientos"]:::person

    CoreSystem["🏦 Sistema de Banca Digital<br>[Sistema Software]<br>Permite gestionar cuentas, transferencias y pagos"]:::system

    PaymentGateway["💳 Pasarela de Pagos Externa<br>[Sistema Externo]<br>Procesa cargos de tarjetas Visa/Mastercard"]:::external
    NotificationService["✉️ Proveedor SMS / Email<br>[Sistema Externo]<br>Envío de códigos OTP y alertas"]:::external

    Customer -->|"Consulta saldos y transfiere vía web/móvil [HTTPS]"| CoreSystem
    Staff -->|"Revisa transacciones sospechosas [HTTPS]"| CoreSystem
    CoreSystem -->|"Procesa pagos [REST/TLS]"| PaymentGateway
    CoreSystem -->|"Envía notificaciones de alerta [API HTTPS]"| NotificationService
```

---

## 2. Nivel 2: Diagrama de Contenedores

Desglosa el sistema en sus unidades de software desplegables independientemente (aplicaciones web, servicios backend, almacenes de datos).

```mermaid
flowchart TD
    classDef person fill:#08427b,stroke:#052e56,color:#fff;
    classDef container fill:#438dd5,stroke:#2e6295,color:#fff;
    classDef db fill:#235789,stroke:#173b5c,color:#fff;
    classDef external fill:#999999,stroke:#666666,color:#fff;

    Customer["👤 Cliente Bancario"]:::person

    subgraph CoreSystemBoundary["Sistema de Banca Digital [Frontera del Sistema]"]
        SPA["🌐 Single-Page Application<br>[React / TypeScript]<br>Interfaz en el navegador del cliente"]:::container
        APIGateway["🚪 API Gateway & Auth<br>[Node.js / Express]<br>Ruteo, rate limiting y validación JWT"]:::container
        BackendAPI["⚙️ Core Banking API<br>[Go / Gin]<br>Lógica de negocio de cuentas y transferencias"]:::container
        EventBroker["📨 Message Broker<br>[RabbitMQ]<br>Colas y eventos asíncronos"]:::container
        WorkerService["🔄 Background Worker<br>[Go]<br>Conciliación y procesamiento diferido"]:::container
        MainDB[("🗄️ Base de Datos Principal<br>[PostgreSQL 16]<br>Cuentas, balances y ledger inmutable")]:::db
        Cache[("⚡ Caché de Sesiones<br>[Redis 7]<br>Tokens y blacklist")]:::db
    end

    ExternalGateway["💳 Pasarela Externa"]:::external

    Customer -->|"Usa [HTTPS]"| SPA
    SPA -->|"Llamadas API [JSON/HTTPS]"| APIGateway
    APIGateway -->|"Verifica sesión [TCP]"| Cache
    APIGateway -->|"Reenvía peticiones autorizadas [gRPC]"| BackendAPI
    BackendAPI -->|"Lee y escribe transacciones [SQL/TCP]"| MainDB
    BackendAPI -->|"Publica eventos outbox [AMQP]"| EventBroker
    EventBroker -->|"Consume eventos [AMQP]"| WorkerService
    WorkerService -->|"Actualiza estados [SQL/TCP]"| MainDB
    WorkerService -->|"Concilia pagos [REST/TLS]"| ExternalGateway
```

---

## 3. Nivel 3: Diagrama de Componentes (Módulo Core Banking)

Muestra cómo está estructurado un contenedor internamente (controladores, servicios, repositorios según arquitectura hexagonal).

```mermaid
flowchart TD
    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000;
    classDef port fill:#f4a261,stroke:#e76f51,color:#000;
    classDef infra fill:#2a9d8f,stroke:#264653,color:#fff;

    subgraph Container["Core Banking API Container"]
        Controller["TransferController<br>[Componente REST]<br>Maneja peticiones HTTP y mapea DTOs"]:::component
        Service["TransferService<br>[Componente Dominio]<br>Aplica reglas de negocio y límites"]:::component
        AccountRepoPort["AccountRepository<br>[Puerto / Interfaz]"]:::port
        EventPublisherPort["EventPublisher<br>[Puerto / Interfaz]"]:::port

        SQLRepo["PostgresAccountRepository<br>[Adaptador Infraestructura]"]:::infra
        RabbitPublisher["RabbitMQEventPublisher<br>[Adaptador Infraestructura]"]:::infra
    end

    Database[("PostgreSQL")]:::infra
    Queue[("RabbitMQ")]:::infra

    Controller --> Service
    Service --> AccountRepoPort
    Service --> EventPublisherPort
    SQLRepo -.->|"Implementa"| AccountRepoPort
    RabbitPublisher -.->|"Implementa"| EventPublisherPort
    SQLRepo --> Database
    RabbitPublisher --> Queue
```

---

## 4. Checklist para Diagramas Mermaid

- [ ] ¿Los nombres de contenedores y sistemas indican su tecnología principal entre corchetes (ej. `[Go / Gin]`)?
- [ ] ¿Las flechas describen el protocolo o tipo de comunicación entre corchetes (ej. `[gRPC]`, `[JSON/HTTPS]`)?
- [ ] ¿El diagrama de contexto incluye a los actores humanos y a los sistemas externos?
- [ ] ¿No se sobrecargan los diagramas con más de 12-15 cajas para mantener legibilidad?
