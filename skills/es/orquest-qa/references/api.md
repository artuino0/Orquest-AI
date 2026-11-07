# Pruebas de API (REST / GraphQL)

Esta referencia guía la verificación sistemática de endpoints HTTP: contratos, códigos de estado, esquemas y escenarios de error.

---

## 1. Verificación de Códigos de Estado HTTP

Asegúrate de que la API responde con la semántica HTTP apropiada:

- **200 OK**: Petición GET, PUT o PATCH exitosa con contenido en la respuesta.
- **201 Created**: Creación exitosa de recurso (POST), usualmente con cabecera `Location` y el recurso creado en el cuerpo.
- **204 No Content**: Operación exitosa sin cuerpo de retorno (común en DELETE).
- **400 Bad Request**: Formato JSON malformado o violación estructural de esquema.
- **401 Unauthorized**: Falta de token de autenticación o token inválido/expirado.
- **403 Forbidden**: Token válido pero el usuario carece de permisos (ej. usuario regular intentando acceder a ruta de administrador).
- **404 Not Found**: Identificador de recurso inexistente en la ruta (`/api/orders/999999`).
- **409 Conflict**: Conflicto de estado (ej. email ya registrado, versión obsoleta en concurrencia optimista).
- **422 Unprocessable Content**: JSON sintácticamente correcto pero con violación de reglas de validación de negocio.
- **500 Internal Server Error**: **Nunca debe recibirse en un flujo controlado de pruebas**. Indica una excepción no manejada y debe considerarse un fallo para el veredicto `no_pasa`.

---

## 2. Comandos y Herramientas de Verificación con `curl`

Usa comandos `curl` concretos para validar endpoints localmente:

### A. Prueba de creación y cabeceras
```bash
# Validar creación de recurso, headers y código 201
curl -s -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{"email": "qa.test@example.com", "name": "QA Tester"}'
```

### B. Prueba de validación de esquema (espera 422 o 400)
```bash
# Enviar payload inválido y verificar código y estructura del error
curl -s -i -X POST http://localhost:3000/api/v1/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_token" \
  -d '{"email": "not-an-email"}'
```

### C. Prueba de idempotencia en DELETE
```bash
# Primera llamada debe retornar 200 o 204
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/api/v1/users/usr_123 \
  -H "Authorization: Bearer test_token"

# Segunda llamada inmediata sobre el mismo ID debe retornar 404
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/api/v1/users/usr_123 \
  -H "Authorization: Bearer test_token"
```

---

## 3. Pruebas de Contrato y Estructura JSON

Comprueba que la respuesta respete el contrato de API documentado por el backend:

- Tipos de datos correctos: campos numéricos no deben llegar como strings (`{"id": 12, "amount": 99.5}`, no `{"amount": "99.5"}`).
- Campos booleanos como `true`/`false`, no `1`/`0`.
- Formato de fechas consistente en ISO-8601 (`"2026-11-06T19:00:00Z"`).
- Estructura uniforme de errores:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "The payload contains invalid fields",
      "details": [
        { "field": "email", "issue": "Invalid email address format" }
      ]
    }
  }
  ```

---

## 4. Checklist para Pruebas de API

- [ ] ¿Los endpoints responden con los códigos de estado HTTP correctos para éxito y error?
- [ ] ¿Las cabeceras `Content-Type: application/json` están presentes en peticiones y respuestas?
- [ ] ¿Se validó el comportamiento al omitir el header de autorización (debe retornar 401)?
- [ ] ¿Se validó el acceso de un usuario no autorizado a recursos ajenos (debe retornar 403 o 404)?
- [ ] ¿Ningún escenario de prueba produjo un código 500 no controlado?
