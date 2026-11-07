---
name: orquest-seguridad
description: Guía de seguridad de aplicaciones, auditoría de vulnerabilidades (OWASP/STRIDE), escaneo estático y remediación segura.
---

# Orquest Seguridad

Esta skill establece las directrices de seguridad defensiva, auditoría y desarrollo seguro para el puesto de seguridad y como guía de referencia para backend, frontend, dba, infra y arquitecto.

## 1. Reglas Estrictas de Seguridad Operacional

1. **Entorno local exclusivamente**: Queda estrictamente prohibido lanzar cargas útiles de ataque (*payloads*), escaneos o intentos de explotación contra hosts, APIs o dominios fuera del entorno de desarrollo local.
2. **Cero exfiltración de secretos**: Si encuentras credenciales, llaves API, tokens o certificados en el código o historial, **reporta únicamente el archivo, la línea y el tipo de secreto**. Jamás imprimas, expongas ni copies el valor del secreto en tus reportes, logs ni bitácora.

## 2. Método de Trabajo: STRIDE, OWASP y ASVS

- **Modelo de Amenazas (STRIDE)**:
  - **S (Spoofing)**: Suplantación de identidad (autenticación débil, falta de firmas).
  - **T (Tampering)**: Manipulación de datos en tránsito o en reposo (falta de integridad, CSRF).
  - **R (Repudiation)**: Capacidad de negar una acción (ausencia de logs de auditoría firmados).
  - **I (Information Disclosure)**: Exposición de datos confidenciales (fugas de PII, stack traces).
  - **D (Denial of Service)**: Denegación de servicio (bloqueo de hilos, regex lentas ReDoS).
  - **E (Elevation of Privilege)**: Escalada de privilegios (IDOR, fallos en RBAC/ABAC).
- **Líneas Base**: OWASP Top 10 (A01:2021 Broken Access Control a A10:2021 SSRF) y niveles de verificación OWASP ASVS (Application Security Verification Standard).

## 3. Cómo Reportar un Hallazgo de Seguridad

Cada vulnerabilidad descubierta debe documentarse obligatoriamente con la siguiente estructura:

- **Título**: `[Categoría] - Resumen del fallo (ej. [A01:Broken Access Control] - IDOR en endpoint de facturas)`
- **Severidad**: Crítica (CVSS 9.0-10.0), Alta (7.0-8.9), Media (4.0-6.9) o Baja (0.1-3.9).
- **Ubicación exacta**: `ruta/al/archivo.ext:línea`.
- **Impacto y vector de explotación**: Cómo un atacante aprovecha el fallo y qué daño ocasiona en el negocio.
- **Remediación recomendada**: Código seguro que resuelve el problema en la raíz.
- **Verificación**: Comando o prueba automatizada que demuestra que el fallo quedó corregido.

## 4. Herramientas de Análisis Estático y Cuándo Correrlas

- **Secretos**: `gitleaks detect --source . -v` o `trufflehog filesystem .` (antes de entregar).
- **Código SAST**: `semgrep --config auto .` (análisis semántico multilingüe).
- **Python SAST**: `bandit -r src/` (análisis estático de seguridad en Python).
- **Dependencias (SCA)**:
  - Node.js: `npm audit` o `pnpm audit`.
  - Python: `pip-audit` o `uv run pip-audit`.
  - Multilenguaje: `osv-scanner -r .`.
- **Contenedores Docker**: `trivy image <imagen>` o `trivy fs .`.

## 5. Índice de Guías de Seguridad por Tecnología

### JavaScript / TypeScript
- [Node.js](references/node.md): Event loop blocking, desreferenciación segura, path traversal y permisos.
- [Express](references/express.md): Helmet, CORS, limitación de tasa y middleware de errores seguro.
- [NestJS](references/nestjs.md): ValidationPipe global, Guards, interceptores y prevención de inyecciones.
- [React](references/react.md): Prevención de XSS (`dangerouslySetInnerHTML`), hooks seguros y saneamiento.
- [Next.js](references/nextjs.md): Server Components vs Client Components, Server Actions y SSR security.
- [Vue](references/vue.md): Directiva `v-html`, bindings dinámicos y protección XSS.
- [Electron](references/electron.md): ContextIsolation, NodeIntegration, sandbox y validación de navegación.

### Python
- [Django](references/django.md): Configuración de settings (SECRET_KEY, DEBUG=False), CSRF, ORM seguro y Clickjacking.
- [FastAPI](references/fastapi.md): Validación Pydantic, dependencias de autorización y CORS restrictivo.
- [Flask](references/flask.md): Sesiones firmadas con cookies seguras, plantillas Jinja2 y protección CSRF.

### JVM, .NET y PHP
- [Spring Boot](references/spring-boot.md): Spring Security, Actuator seguro, CSRF y prevención SpEL injection.
- [ASP.NET Core](references/aspnet-core.md): Antiforgery tokens, Identity, autorización basada en políticas y protección XSS.
- [Laravel](references/laravel.md): Eloquent ORM, protección de asignación masiva, Blade escaping y Sanctum.

### Datos e Infraestructura
- [SQL (PostgreSQL / MySQL)](references/sql.md): Consultas parametrizadas, privilegios mínimos, RLS y cifrado en reposo.
- [MongoDB](references/mongodb.md): Prevención de inyección NoSQL `$where`/`$ne`, autenticación y roles.
- [Docker](references/docker.md): Usuarios no-root, escaneo de imágenes base mínimas y secretos en build.
- [Kubernetes](references/kubernetes.md): SecurityContext, RBAC, NetworkPolicies y gestión de secretos.
- [CI/CD](references/ci-cd.md): Permisos mínimos en tokens (`GITHUB_TOKEN`), pinning de hashes y supply chain.
- [Cloud y Secretos](references/cloud-secretos.md): IAM de mínimo privilegio en AWS/GCP/Azure y gestores de secretos.

### Transversal
- [Autenticación y Sesiones](references/auth-sesiones.md): OAuth2/OIDC, manejo seguro de JWT, hashing con Argon2/bcrypt y MFA.
- [Seguridad en APIs](references/api.md): OWASP API Security Top 10, rate limiting, validación de esquemas y CORS.
- [Gestión de Dependencias](references/dependencias.md): Archivos lock, verificación de hashes, auditoría SCA y prevención de typosquatting.
