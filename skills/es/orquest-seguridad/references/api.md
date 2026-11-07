# Seguridad en APIs (OWASP API Security Top 10)

Esta referencia establece las directrices de seguridad para proteger interfaces de programación de aplicaciones (APIs REST / GraphQL).

---

## 1. El OWASP API Security Top 10 (2023)

1. **API1:2023 Broken Object Level Authorization (BOLA / IDOR)**: El cliente manipula el ID del objeto en la URI (`GET /api/documents/999`) y accede a datos de otro usuario. **Solución**: Validar siempre que el objeto pertenezca al usuario autenticado.
2. **API2:2023 Broken Authentication**: Debilidades en el flujo de autenticación, contraseñas débiles, tokens no revocables o falta de rate limiting en endpoints de login.
3. **API3:2023 Broken Object Property Level Authorization (BOPLA)**: Exposición excesiva de datos o asignación masiva. El endpoint retorna el objeto completo de base de datos incluyendo campos privados (`password_hash`, `ssn`). **Solución**: Usar DTOs de salida explícitos.
4. **API4:2023 Unrestricted Resource Consumption**: Falta de límites en peticiones (Rate Limiting), timeouts o tamaños de payloads, facilitando ataques de denegación de servicio.
5. **API5:2023 Broken Function Level Authorization (BFLA)**: Usuarios regulares accediendo a endpoints administrativos modificando el verbo HTTP o la URL (`POST /api/admin/users`).
6. **API6:2023 Unrestricted Access to Sensitive Business Flows**: Abuso automatizado de flujos de negocio legítimos (compra masiva de boletos por bots, creación indiscriminada de cuentas de prueba).
7. **API7:2023 Server Side Request Forgery (SSRF)**: La API consume una URL provista por el usuario y realiza una petición interna hacia la red privada.
8. **API8:2023 Security Misconfiguration**: Encabezados CORS abiertos, mensajes de error verbosos, métodos HTTP innecesarios habilitados (TRACE, OPTIONS abiertos).
9. **API9:2023 Improper Inventory Management**: Endpoints o versiones antiguas de la API no documentadas (`/api/v1/debug`) sin parches de seguridad que siguen activas.
10. **API10:2023 Unsafe Consumption of APIs**: Confiar ciegamente en datos devueltos por APIs de terceros integradas sin validar esquemas ni sanitizar.

---

## 2. Limitación de Tasa (Rate Limiting) y Cuotas

Implementa limitación de tasa basada en token bucket o ventana deslizante (usando Redis):

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1730920000
Content-Type: application/json

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry in 60 seconds."
  }
}
```

---

## 3. Política de CORS Restrictiva

- **Nunca uses `Access-Control-Allow-Origin: *`** si la API maneja cookies o cabeceras `Authorization: Bearer`.
- Valida el encabezado `Origin` contra una lista blanca explícita de dominios autorizados:
  ```http
  Access-Control-Allow-Origin: https://app.example.com
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Authorization, Content-Type
  ```

---

## 4. Checklist para Seguridad en APIs

- [ ] Todas las consultas a recursos verifican la propiedad del objeto contra el usuario autenticado (prevenir BOLA/IDOR).
- [ ] Los endpoints de salida usan DTOs explícitos para no fugar campos internos de base de datos.
- [ ] Se implementó Rate Limiting global y estricto en rutas de autenticación.
- [ ] La configuración de CORS rechaza orígenes no autorizados y no utiliza comodines `*` con credenciales.
- [ ] Las peticiones que involucran URLs externas validan la IP para evitar SSRF hacia rangos privados (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254).
