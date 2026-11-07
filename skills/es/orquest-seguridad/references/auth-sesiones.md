# Autenticación, Sesiones y Criptografía

Esta referencia detalla los estándares de seguridad para implementar flujos de autenticación, gestión de tokens JWT, almacenamiento seguro de contraseñas y autenticación multifactor (MFA).

---

## 1. Almacenamiento Seguro de Contraseñas

**Queda estrictamente prohibido usar algoritmos de hash rápidos** (MD5, SHA-1, SHA-256 o SHA-512) para contraseñas, incluso con salt. Estos algoritmos están optimizados para rendimiento e integridad de archivos, permitiendo que GPUs modernas calculen miles de millones de intentos por segundo.

### Algoritmos Aprobados para Contraseñas:
1. **Argon2id (Recomendado por OWASP)**: Máxima resistencia contra ataques basados en memoria y GPUs. Parámetros recomendados: tiempo: 2-3 iteraciones, memoria: 64 MB (65536 KiB), paralelismo: 1 o 2 hilos.
2. **BCrypt**: Ampliamente soportado y maduro. Factor de coste mínimo (*work factor / salt rounds*): **12**.
3. **PBKDF2**: Con HMAC-SHA256 y mínimo 600,000 iteraciones (solo si Argon2/BCrypt no están disponibles en el entorno).

---

## 2. Uso Seguro de JSON Web Tokens (JWT)

- **Algoritmo Explícito**: Valida siempre el algoritmo de firma en el backend. **Rechaza explícitamente el algoritmo `"none"`** y algoritmos simétricos (HS256) si la clave pública esperada es asimétrica (RS256/ES256) para evitar ataques de confusión de algoritmo (*Key Confusion Attack*).
- **Tiempo de Expiración Corto**: El token de acceso (`access_token`) debe tener una vida útil corta (máximo 5 a 15 minutos).
- **Renovación con Refresh Tokens**:
  - Los refresh tokens deben almacenarse en base de datos junto a un identificador único de familia de tokens para implementar **rotación automática de refresh token**.
  - Si un refresh token ya utilizado intenta reusarse, invalida inmediatamente toda la familia de tokens (detección de robo de token).
- **Almacenamiento en el Cliente**: Envía los tokens en cookies con banderas:
  `Set-Cookie: token=...; Secure; HttpOnly; SameSite=Strict; Path=/`

---

## 3. Flujo OAuth 2.0 y OpenID Connect (OIDC)

- Para aplicaciones de página única (SPA) y móviles, utiliza obligatoriamente el flujo de código de autorización con **PKCE** (Proof Key for Code Exchange con `code_challenge_method=S256`).
- Valida estrictamente el parámetro `state` para prevenir ataques de Cross-Site Request Forgery (CSRF) durante el flujo de login social.
- Valida el parámetro `nonce` en el token ID de OpenID Connect para prevenir ataques de repetición (*replay attacks*).

---

## 4. Checklist de Autenticación y Sesiones

- [ ] Las contraseñas se hashean con Argon2id o BCrypt (coste ≥ 12).
- [ ] La verificación de JWT valida explícitamente `algorithms: ['RS256']` y rechaza `"none"`.
- [ ] La expiración de tokens (`exp`) es obligatoria y no excede 15 minutos para tokens de acceso.
- [ ] Las cookies de sesión/token tienen las banderas `HttpOnly`, `Secure` y `SameSite=Lax/Strict`.
- [ ] Los flujos OAuth2 implementan PKCE y validan el parámetro `state`.
- [ ] Los endpoints sensibles (cambio de contraseña, cambio de email) solicitan reautenticación o confirmación MFA.
