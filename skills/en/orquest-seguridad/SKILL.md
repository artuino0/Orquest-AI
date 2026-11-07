---
name: orquest-seguridad
description: Application security guidelines, vulnerability auditing (OWASP/STRIDE), static scanning, and secure remediation.
---

# Orquest Security

This skill establishes defensive security guidelines, auditing workflows, and secure coding practices for the security auditor role, and serves as an implementation guide for backend, frontend, dba, infra, and architect roles.

## 1. Strict Operational Security Rules

1. **Local environment only**: It is strictly forbidden to fire attack payloads, port scans, or exploit attempts against external hosts, remote APIs, or domains outside the local development environment.
2. **Zero secrets exfiltration**: If you discover credentials, API keys, tokens, or private certificates in the codebase or git history, **report only the file, line number, and secret type**. Never print, copy, or expose the secret value itself in your reports, logs, or handovers.

## 2. Methodology: STRIDE, OWASP, and ASVS

- **Threat Modeling (STRIDE)**:
  - **S (Spoofing)**: Identity spoofing (weak authentication, missing signatures).
  - **T (Tampering)**: Data tampering in transit or at rest (integrity failures, CSRF).
  - **R (Repudiation)**: Deniability of user actions (missing signed audit logs).
  - **I (Information Disclosure)**: Information leaks (PII exposure, verbose stack traces).
  - **D (Denial of Service)**: Service exhaustion (event loop blocking, catastrophic ReDoS).
  - **E (Elevation of Privilege)**: Privilege escalation (IDOR, flawed RBAC/ABAC).
- **Baselines**: OWASP Top 10 (A01:2021 Broken Access Control to A10:2021 SSRF) and OWASP ASVS (Application Security Verification Standard) verification levels.

## 3. How to Report a Security Finding

Every identified vulnerability must be documented using the following structure:

- **Title**: `[Category] - Finding Summary (e.g., [A01:Broken Access Control] - IDOR in invoice endpoint)`
- **Severity**: Critical (CVSS 9.0-10.0), High (7.0-8.9), Medium (4.0-6.9), or Low (0.1-3.9).
- **Exact Location**: `path/to/file.ext:line`.
- **Impact and Exploitation Vector**: How an attacker exploits the flaw and resulting business impact.
- **Recommended Remediation**: Secure drop-in code fix that resolves the vulnerability at the root.
- **Verification**: Command or automated test demonstrating that the flaw is remediated.

## 4. Static Analysis Tools and When to Run Them

- **Secrets Scanning**: `gitleaks detect --source . -v` or `trufflehog filesystem .` (run before delivery).
- **Code SAST**: `semgrep --config auto .` (multilingual semantic security analysis).
- **Python SAST**: `bandit -r src/` (static security analysis for Python).
- **Dependency Auditing (SCA)**:
  - Node.js: `npm audit` or `pnpm audit`.
  - Python: `pip-audit` or `uv run pip-audit`.
  - Multilingual: `osv-scanner -r .`.
- **Container Scanning**: `trivy image <image>` or `trivy fs .`.

## 5. Security Reference Guides by Technology

### JavaScript / TypeScript
- [Node.js](references/node.md): Event loop blocking, safe path resolution, command injection, and permissions.
- [Express](references/express.md): Helmet headers, CORS policies, rate limiting, and secure error middleware.
- [NestJS](references/nestjs.md): Global ValidationPipe, Guards, interceptors, and injection prevention.
- [React](references/react.md): XSS prevention (`dangerouslySetInnerHTML`), secure URL bindings, and DOMPurify.
- [Next.js](references/nextjs.md): Server Components vs Client Components, Server Actions authorization, and SSR security.
- [Vue](references/vue.md): Directive `v-html` sanitization, dynamic binding safety, and XSS prevention.
- [Electron](references/electron.md): ContextIsolation, NodeIntegration, sandboxing, and safe IPC communication.

### Python
- [Django](references/django.md): Security settings (SECRET_KEY, DEBUG=False), CSRF, ORM queries, and Clickjacking.
- [FastAPI](references/fastapi.md): Pydantic validation, authorization dependencies, and restrictive CORS.
- [Flask](references/flask.md): Signed session cookies, Jinja2 template injection (SSTI), and CSRF protection.

### JVM, .NET, and PHP
- [Spring Boot](references/spring-boot.md): Spring Security, Actuator hardening, CSRF, and SpEL injection prevention.
- [ASP.NET Core](references/aspnet-core.md): Antiforgery tokens, Identity, policy authorization, and SQL injection prevention.
- [Laravel](references/laravel.md): Eloquent ORM, mass assignment prevention, Blade escaping, and Sanctum.

### Data and Infrastructure
- [SQL (PostgreSQL / MySQL)](references/sql.md): Parameterized queries, least-privilege users, RLS, and data encryption.
- [MongoDB](references/mongodb.md): NoSQL operator injection prevention (`$where`/`$ne`), auth, and role-based access.
- [Docker](references/docker.md): Non-root users, multi-stage minimal builds, and secrets in build layers.
- [Kubernetes](references/kubernetes.md): SecurityContext, RBAC, NetworkPolicies, and secret handling.
- [CI/CD](references/ci-cd.md): Least-privilege tokens (`GITHUB_TOKEN`), action SHA pinning, and supply chain.
- [Cloud and Secrets](references/cloud-secretos.md): Least privilege IAM in AWS/GCP/Azure and centralized secret managers.

### Cross-Cutting Security
- [Authentication and Sessions](references/auth-sesiones.md): OAuth2/OIDC, JWT best practices, Argon2/BCrypt hashing, and MFA.
- [API Security](references/api.md): OWASP API Security Top 10, rate limiting, schema validation, and CORS.
- [Dependency Management](references/dependencias.md): Lockfile integrity, SCA scanning, hash verification, and typosquatting prevention.
