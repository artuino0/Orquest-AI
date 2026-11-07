# Plantilla de Documento de Arquitectura de Software

Utiliza esta estructura integral para elaborar el documento maestro de arquitectura de un proyecto o sistema en Orquest AI.

---

```markdown
# Documento de Arquitectura de Software: [Nombre del Sistema]

- **Versión**: 1.0.0
- **Fecha**: [AAAA-MM-DD]
- **Arquitecto Responsable**: [Nombre]
- **Estado**: [Borrador / En Revisión / Aprobado]

---

## 1. Introducción y Objetivos de Negocio
- **1.1 Propósito del Sistema**: [Resumen ejecutivo de qué hace el sistema y para quién].
- **1.2 Objetivos Estratégicos**: [Métricas clave de negocio, ej. soportar 50,000 usuarios activos].
- **1.3 Alcance y Limitaciones**: [Qué está explícitamente dentro y fuera del proyecto].

---

## 2. Requisitos No Funcionales (RNF) y Restricciones
- **Disponibilidad**: SLA 99.9% (máximo 43 minutos de indisponibilidad mensual).
- **Rendimiento**: Latencia p95 < 200 ms con carga máxima de 800 RPS.
- **Seguridad**: Autenticación vía JWT / OIDC, RBAC para autorización, cifrado AES-256 en reposo.
- **Cumplimiento**: Cumplimiento GDPR (residencia de datos en UE, derecho de supresión).
- **Restricciones de Costo**: Presupuesto mensual máximo de infraestructura: $1,200 USD.

---

## 3. Decisiones Arquitectónicas Clave (Resumen de ADRs)
- **ADR-001**: Adopción de Monolito Modular con arquitectura limpia interna.
- **ADR-002**: Persistencia relacional en PostgreSQL 16 con particionado mensual.
- **ADR-003**: Cola asíncrona respaldada en Redis Streams para procesamiento en background.

---

## 4. Vistas de Arquitectura (Modelo C4 con Mermaid)
### 4.1 Vista de Contexto del Sistema (C4 Nivel 1)
[Diagrama Mermaid mostrando usuarios, sistema central y sistemas externos].

### 4.2 Vista de Contenedores (C4 Nivel 2)
[Diagrama Mermaid mostrando Frontend Web, API Backend, Base de Datos, Cola y Almacenamiento S3].

### 4.3 Vista de Componentes (C4 Nivel 3)
[Diagrama Mermaid mostrando la descomposición interna de módulos clave].

---

## 5. Diseño de Integración y Contratos de Datos
- **Protocolo de API**: REST sobre HTTPS con especificación OpenAPI 3.1.
- **Contratos de Eventos**: Esquemas JSON versionados publicados en el broker.
- **Manejo de Errores**: Formato RFC 7807 (Problem Details for HTTP APIs).

---

## 6. Estrategia de Datos y Persistencia
- **Modelo de Entidad-Relación**: [Diagrama ERD o descripción de tablas core].
- **Migraciones**: Migraciones versionadas hacia adelante/atrás sin downtime (Expand & Contract).
- **Respaldos y Retención**: Snapshots automáticos diarios con retención de 30 días, RTO < 1h, RPO < 15 min.

---

## 7. Estrategia de Resiliencia y Seguridad
- **Timeouts**: 2 segundos para llamadas a servicios externos, 5 segundos para BD.
- **Reintentos**: Hasta 3 reintentos con backoff exponencial y jitter para errores de red transitorios.
- **Circuit Breakers**: Activación tras 50% de fallos en ventana de 30 segundos.
- **Modelo de Amenazas**: STRIDE aplicado y verificado contra skill `orquest-seguridad`.

---

## 8. Observabilidad y Operaciones
- **Logs**: JSON estructurado emitido a stdout con correlación por `trace_id`.
- **Métricas**: Métricas RED expuestas en `/metrics` en formato Prometheus.
- **Tracing**: Instrumentación OpenTelemetry hacia Jaeger/Tempo.

---

## 9. Desglose de Implementación para el Jefe
[Matriz de paquetes de trabajo distribuidos por rol: DBA, Backend, Frontend, Infra, QA con grafo de dependencias].
```
