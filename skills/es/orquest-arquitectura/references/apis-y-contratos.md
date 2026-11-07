# APIs, Contratos de Integración y Versionado

Esta referencia establece las directrices para definir, documentar y gobernar interfaces de comunicación entre componentes y servicios externos.

---

## 1. Selección de Protocolo: REST vs gRPC vs GraphQL

| Protocolo | Mecanismo | Caso de Uso Óptimo | Trade-offs |
| :--- | :--- | :--- | :--- |
| **REST (JSON/HTTP)** | Semántica HTTP, recursos, verbos estándar (GET/POST/PUT/DELETE). | APIs públicas de cara a terceros, clientes web/móvil estándar, facilidad de inspección y caché HTTP. | Payload voluminoso en JSON, sobrecarga de texto, riesgo de sobre/sub-fetching. |
| **gRPC (Protobuf/HTTP2)** | RPC binario fuertemente tipado, multiplexación, streaming bidireccional. | Comunicación interna de alta velocidad servicio a servicio (East-West traffic). | Requiere compilación de stubs (.proto); difícil de inspeccionar con herramientas estándar de navegador. |
| **GraphQL** | Lenguaje de consulta declarativo en un único endpoint POST. | Agregadores de frontend (BFF) con vistas complejas que consumen múltiples entidades heterogéneas. | Complejidad de caché en CDN, riesgo de consultas anidadas costosas (denegación de servicio por recursión). |

---

## 2. Gobierno de Contratos y Versionado

### Regla de Oro: Compatibilidad Hacia Atrás (Backward Compatibility)
Un cambio en una API jamás debe romper clientes existentes sin una transición planificada.

- **Cambios No Disruptivos (Permitidos libremente)**:
  - Añadir nuevos campos opcionales a un objeto de respuesta.
  - Añadir nuevos endpoints independientes.
  - Añadir parámetros de consulta (*query parameters*) opcionales con valores por defecto razonables.
- **Cambios Disruptivos (Breaking Changes - Requieren nueva versión mayor)**:
  - Eliminar o renombrar un campo existente.
  - Cambiar el tipo de dato de un campo (ej. de número a string).
  - Volver obligatorio un parámetro que antes era opcional.
  - Modificar los códigos de estado HTTP estándar retornados ante errores.

### Estrategia de Versionado
- Prefiere versionado explícito en la ruta URI para APIs públicas: `/api/v1/orders`.
- Documenta el contrato rigurosamente utilizando especificaciones formales como **OpenAPI 3.1** (Swagger) o archivos `.proto` en un repositorio central de esquemas.

---

## 3. Checklist de Diseño de Contratos

- [ ] ¿Existe una especificación formal de la API (OpenAPI / Protobuf) antes de iniciar la implementación?
- [ ] ¿Los nombres de recursos en REST son sustantivos en plural (`/users`, `/orders`) y no verbos?
- [ ] ¿Los cambios propuestos son compatibles hacia atrás o incrementan la versión mayor de la API?
- [ ] ¿Se cuenta con límites de tasa de peticiones (*rate limiting*) documentados en las cabeceras?
