# Estilos Arquitectónicos: Cuándo Sí y Cuándo No

Esta referencia analiza los principales patrones y estilos arquitectónicos de software, sus escenarios de aplicación idóneos y sus riesgos operacionales.

---

## 1. Monolito Modular

Todo el código vive en un único repositorio y se despliega como una única unidad o proceso, pero internamente está estructurado en módulos aislados con dependencias unidireccionales estrictas.

- **Cuándo SÍ**:
  - Proyectos nuevos (etapa inicial / MVP) o con equipos pequeños a medianos (< 20 ingenieros).
  - La mayoría de las aplicaciones empresariales estándar con requerimientos de latencia baja y consistencia ACID simple.
- **Cuándo NO**:
  - Equipos gigantes con decenas de squads que sufren bloqueos constantes de release y cuellos de botella en CI/CD.
  - Componentes con requisitos de escalado radicalmente dispares (ej. un módulo requiere GPU pesada y otro solo sirve HTML ligero).
- **Ventajas**: Despliegue trivial, refactorizaciones seguras con el compilador, transacciones atómicas simples, debugging local sin red.
- **Riesgo**: Erosión modular si no se aplican linters de arquitectura (ej. ArchUnit, dependency-cruiser) para evitar acoplamiento cruzado indebido.

---

## 2. Arquitectura Hexagonal (Ports & Adapters) / Clean Architecture

Separa el núcleo de dominio puro de cualquier detalle de infraestructura (bases de datos, frameworks web, colas de mensajería, APIs de terceros). El dominio define interfaces (puertos) y la infraestructura las implementa (adaptadores).

- **Cuándo SÍ**:
  - Aplicaciones con reglas de negocio ricas y cambiantes que deben aislarse de la tecnología subyacente.
  - Sistemas que requieren alta testeabilidad unitaria sin depender de bases de datos o red activas.
- **Cuándo NO**:
  - Aplicaciones CRUD sencillas donde el 90% del trabajo es transferir datos de la BD a una tabla web. En esos casos introduce capas innecesarias y código repetitivo sin beneficio.

---

## 3. Microservicios

Descompone la aplicación en un conjunto de servicios autónomos desplegables de manera independiente, cada uno dueño exclusivo de su propio almacén de datos (Database-per-Service).

- **Cuándo SÍ**:
  - Múltiples equipos autónomos trabajando en dominios desacoplados que necesitan publicar versiones con cadencias independientes.
  - Necesidad real y comprobada de escalar componentes individuales de forma asimétrica.
- **Cuándo NO**:
  - Equipos pequeños (menos de 15 personas).
  - Cuando los límites de dominio no están claros (el resultado será un **monolito distribuido**, el peor de los mundos: todo el costo de la red y nada de la autonomía).
- **Trade-offs**: Alta complejidad operativa (orquestación, service mesh, tracing distribuido, fallas parciales de red, eventual consistency).

---

## 4. CQRS (Command Query Responsibility Segregation)

Separa el modelo de escritura (Comandos: validan reglas y alteran el estado) del modelo de lectura (Consultas: proyecciones optimizadas para visualización rápida).

- **Cuándo SÍ**:
  - Sistemas con asimetría masiva entre lecturas y escrituras (ej. 100 lecturas por cada 1 escritura).
  - Escenarios donde las lecturas requieren uniones complejas que degradan la base de datos transaccional normal.
- **Cuándo NO**:
  - Sistemas transaccionales sencillos donde las consultas leen directamente las mismas tablas que las escrituras.
- **Trade-offs**: Retraso en la propagación de datos hacia las vistas de lectura (consistencia eventual); complejidad de mantener sincronizados dos modelos.

---

## 5. Tabla Comparativa de Estilos

| Criterio | Monolito Modular | Hexagonal (Dentro de Monolito) | Microservicios | CQRS + Event-Driven |
| :--- | :--- | :--- | :--- | :--- |
| **Complejidad de Despliegue** | Muy baja | Muy baja | Muy alta | Alta / Muy alta |
| **Consistencia Transaccional** | Fuerte (ACID) | Fuerte (ACID) | Eventual | Eventual |
| **Facilidad de Pruebas** | Alta | Muy alta | Compleja | Compleja |
| **Escalabilidad Organizacional**| Moderada | Moderada | Muy alta | Alta |
| **Costo de Infraestructura** | Bajo | Bajo | Alto | Medio-Alto |

---

## 6. Anti-patrones Arquitectónicos Letales

1. **Microservicios Prematuros**: Empezar un proyecto nuevo como microservicios antes de comprender las fronteras del negocio.
2. **Monolito Distribuido**: Múltiples servicios que deben desplegarse juntos porque comparten base de datos o contratos fuertemente acoplados por llamadas HTTP síncronas en cadena.
3. **Base de Datos Compartida entre Servicios**: Dos servicios leyendo y escribiendo directamente en las mismas tablas SQL, rompiendo la encapsulación y haciendo imposible cambiar el esquema sin romper ambos.
