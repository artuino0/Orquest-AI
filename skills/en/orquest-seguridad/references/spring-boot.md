# Spring Boot Security

This reference outlines security practices for applications developed with Spring Boot and Spring Security (Java 17 / 21).

---

## 1. Common Pitfalls and Vulnerabilities

- **Unauthenticated Actuator Endpoints**: Exposing sensitive paths such as `/actuator/env`, `/actuator/heapdump`, or `/actuator/beans` to the public internet, leaking environment secrets and heap memory contents.
- **Spring Expression Language (SpEL) Injection**: Evaluating dynamic SpEL expressions containing untrusted user inputs, resulting in Remote Code Execution.
- **Disabling CSRF on Cookie-Based Sessions**: Calling `http.csrf().disable()` in stateful cookie-based architectures without alternative anti-forgery protections.
- **SQL Injection in Native JPA Queries (`nativeQuery = true`)**: Concatenating parameters into raw SQL query strings.

---

## 2. Secure Spring Security Configuration

Standard idiomatic `SecurityFilterChain` setup for Spring Boot 3+:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 1. Security response headers
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
                .frameOptions(frame -> frame.deny())
            )
            // 2. Stateless REST API protected by Bearer Tokens: disabling CSRF is safe
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // 3. Explicit access control
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/public/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers("/actuator/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));

        return http.build();
    }
}
```

In `application.properties`:
```properties
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never
```

---

## 3. Code Patterns: Insecure vs Secure

### Safe JPA Queries vs SQL Injection

**Insecure (`nativeQuery = true` with string concatenation):**
```java
// INSECURE: vulnerable to SQL injection
@Query(value = "SELECT * FROM users WHERE email = '" + email + "'", nativeQuery = true)
User findByEmailUnsafe(String email);
```

**Secure (Bound parameters or JPQL):**
```java
// SECURE: Named parameter binding
@Query("SELECT u FROM User u WHERE u.email = :email")
Optional<User> findByEmailSafe(@Param("email") String email);

// If nativeQuery is strictly necessary, always bind parameters:
@Query(value = "SELECT * FROM users WHERE email = :email", nativeQuery = true)
Optional<User> findByEmailNativeSafe(@Param("email") String email);
```

---

## 4. Spring Boot Security Checklist

- [ ] `/actuator/**` endpoints are restricted and do not expose `env` or `heapdump` publicly.
- [ ] Queries with `nativeQuery = true` use bound parameters (`:param`) exclusively.
- [ ] No untrusted inputs are passed into `SpelExpressionParser`.
- [ ] If using cookie sessions, CSRF is active via `CookieCsrfTokenRepository.withHttpOnlyFalse()`.
- [ ] BCrypt or Argon2 is configured as the `PasswordEncoder`.
