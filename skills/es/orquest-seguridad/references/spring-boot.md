# Seguridad en Spring Boot

Esta referencia detalla las normas de seguridad para aplicaciones basadas en Spring Boot y Spring Security (Java 17 / 21).

---

## 1. Errores Típicos y Vulnerabilidades

- **Endpoints de Actuator expuestos sin autenticación**: Exponer `/actuator/env`, `/actuator/heapdump` o `/actuator/beans` a internet público, lo que filtra secretos, variables de entorno y tokens de memoria.
- **Inyección en Expresiones SpEL (Spring Expression Language)**: Evaluar expresiones SpEL construidas dinámicamente con entradas de usuario, provocando RCE inmediato.
- **CSRF deshabilitado en APIs con sesiones basadas en cookies**: Invocar `http.csrf().disable()` en aplicaciones que utilizan autenticación por sesión/cookies sin protecciones alternativas.
- **Inyección SQL en consultas JPA nativas (`nativeQuery = true`)**: Concatenar parámetros dentro de cadenas de consultas SQL nativas.

---

## 2. Configuración Segura de Spring Security

Configuración idiomática con `SecurityFilterChain` en Spring Boot 3+:

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 1. Cabeceras HTTP de seguridad
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
                .frameOptions(frame -> frame.deny())
            )
            // 2. Si es una API REST stateless protegida por Bearer Tokens, deshabilitar CSRF es seguro
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // 3. Control de acceso explícito
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**", "/public/**").permitAll()
                // Solo exponer health en actuator públicamente
                .requestMatchers("/actuator/health").permitAll()
                // Cualquier otro endpoint de actuator requiere rol ADMIN
                .requestMatchers("/actuator/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));

        return http.build();
    }
}
```

En `application.properties`:
```properties
# Limitar rigurosamente los endpoints expuestos de actuator
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Consultas JPA seguras vs Inyección SQL

**Inseguro (nativeQuery con concatenación):**
```java
// INSEGURO: vulnerabilidad de inyección SQL
@Query(value = "SELECT * FROM users WHERE email = '" + email + "'", nativeQuery = true)
User findByEmailUnsafe(String email);
```

**Seguro (Parámetros vinculados o JPQL):**
```java
// SEGURO: Parámetro vinculado por nombre
@Query("SELECT u FROM User u WHERE u.email = :email")
Optional<User> findByEmailSafe(@Param("email") String email);

// Si se usa nativeQuery, usar siempre parámetros posicionales o con nombre:
@Query(value = "SELECT * FROM users WHERE email = :email", nativeQuery = true)
Optional<User> findByEmailNativeSafe(@Param("email") String email);
```

---

## 4. Checklist para Spring Boot

- [ ] `/actuator/**` está restringido y no expone `env`, `heapdump` ni `beans` a internet.
- [ ] Las consultas con `nativeQuery = true` utilizan exclusivamente parámetros vinculados (`:param`).
- [ ] No se evalúan cadenas de usuario dentro de `SpelExpressionParser`.
- [ ] Si la aplicación usa sesiones de cookies, CSRF está habilitado con `CookieCsrfTokenRepository.withHttpOnlyFalse()`.
- [ ] Se utiliza BCrypt o Argon2 como `PasswordEncoder` (nunca MD5 o SHA-256 plano).
