# Authentication, Sessions, and Cryptography

This reference defines security standards for implementing authentication flows, JWT token lifecycle management, password hashing, and multi-factor authentication (MFA).

---

## 1. Secure Password Storage

**Fast cryptographic hashes (MD5, SHA-1, SHA-256, SHA-512) are strictly forbidden** for password storage, even when salted. Modern GPUs can calculate billions of SHA-256 hashes per second, making brute-force dictionary attacks trivial.

### Approved Password Hashing Algorithms:
1. **Argon2id (OWASP Recommended)**: Optimal resistance against GPU and ASIC cracking attacks. Recommended parameters: time: 2-3 iterations, memory: 64 MB (65536 KiB), parallelism: 1-2 threads.
2. **BCrypt**: Battle-tested and widely supported. Minimum work factor / salt rounds: **12**.
3. **PBKDF2**: HMAC-SHA256 with at least 600,000 iterations (only when Argon2/BCrypt are unavailable).

---

## 2. Secure JSON Web Token (JWT) Handling

- **Explicit Algorithm Verification**: Always enforce the expected algorithm on the backend. **Explicitly reject the `"none"` algorithm** and prevent symmetric key confusion (HS256 vs RS256/ES256).
- **Short-Lived Access Tokens**: Access tokens (`access_token`) must have a short lifespan (5 to 15 minutes max).
- **Refresh Token Rotation**:
  - Store refresh tokens in the database linked to a token family identifier.
  - Upon use, issue a new refresh token and invalidate the old one.
  - If a previously consumed refresh token is presented again, immediately invalidate the entire token family (detects token theft).
- **Client Storage**: Transmit tokens in cookies configured with:
  `Set-Cookie: token=...; Secure; HttpOnly; SameSite=Strict; Path=/`

---

## 3. OAuth 2.0 and OpenID Connect (OIDC)

- For SPAs and mobile applications, always enforce the Authorization Code Flow with **PKCE** (`code_challenge_method=S256`).
- Validate the `state` parameter to prevent Cross-Site Request Forgery (CSRF) in social login redirects.
- Validate the `nonce` claim in OpenID Connect ID tokens to prevent replay attacks.

---

## 4. Authentication and Sessions Checklist

- [ ] Passwords hashed with Argon2id or BCrypt (work factor ≥ 12).
- [ ] JWT verification explicitly enforces expected algorithms and rejects `"none"`.
- [ ] Access token lifespan does not exceed 15 minutes.
- [ ] Session cookies enforce `HttpOnly`, `Secure`, and `SameSite=Lax/Strict`.
- [ ] OAuth2 flows implement PKCE and validate the `state` parameter.
- [ ] Sensitive actions (password change, email update) require step-up reauthentication.
