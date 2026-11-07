# Reparto del Trabajo y Grafo de Dependencias para el Jefe

Esta referencia enseña al arquitecto cómo transformar una arquitectura técnica en paquetes de trabajo ejecutables por los agentes especializados de Orquest AI (`dba`, `backend`, `frontend`, `infra`, `qa`), minimizando bloqueos y permitiendo paralelismo real.

---

## 1. El Rol del Arquitecto frente al Jefe

El **Jefe** coordina personas, asigna tareas y aprueba entregas (`asignar_tarea`, `revisar_entrega`).
El **Arquitecto** diseña la solución técnica y **le entrega al jefe la hoja de ruta**:
1. Qué tareas específicas deben crearse.
2. A qué puesto / rol corresponde cada tarea.
3. Qué contrato o especificación debe entregarse como insumo para que un agente trabaje sin bloquearse.
4. Cuáles son las dependencias estrictas (`depende_de`) entre tareas.

---

## 2. Estrategia de Paralelismo: Contratos Primero (Contract-First)

El mayor error de coordinación es poner al desarrollador de frontend a esperar días hasta que el backend termine de implementar su lógica y base de datos.

### El Flujo de Paralelismo Acelerado:
1. **Paso 1 (Inmediato)**: El arquitecto o backend define el **contrato de API** (OpenAPI JSON/YAML con endpoints, DTOs y payloads de ejemplo).
2. **Paso 2 (Paralelo)**:
   - **DBA**: Crea el esquema, tablas, índices y migración inicial.
   - **Frontend**: Comienza a construir las pantallas e integra contra un mock del contrato OpenAPI definido en el Paso 1.
   - **Infra**: Configura el contenedor Docker, variables de entorno y pipeline de CI.
3. **Paso 3 (Integración)**:
   - **Backend**: Implementa la lógica de negocio conectando la base de datos (entregada por DBA) y exponiendo el contrato real acordado.
   - **Frontend**: Conmuta del mock a la URL real del backend.
4. **Paso 4 (Validación)**:
   - **QA**: Valida la integración de punta a punta según los criterios de aceptación y emite su veredicto.

---

## 3. Plantilla de Grafo de Tareas para el Jefe

Incluye esta sección en tu entrega final para que el jefe pueda copiar directamente la configuración en `asignar_tarea`:

```markdown
### Grafo de Tareas Propuesto para el Jefe

| ID Tarea | Puesto Recomendado | Título / Objetivo | Depende De (`depende_de`) | Insumo / Contrato Clave |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | `dba` | Esquema de BD y Migración de Cuentas | - | Diagrama ERD y diccionario de datos en ADR-002 |
| **T-02** | `infra` | Dockerfile y docker-compose con PostgreSQL y Redis | - | Versiones de stack definidas en arquitectura |
| **T-03** | `backend` | Contrato OpenAPI y DTOs de autenticación | - | Especificación de endpoints en arquitectura |
| **T-04** | `frontend` | Pantallas de login y registro usando mocks | T-03 | Contrato OpenAPI generado en T-03 |
| **T-05** | `backend` | Implementación de API REST conectada a BD | T-01, T-02, T-03 | Esquema de T-01 e infra de T-02 |
| **T-06** | `frontend` | Conexión de UI con API real de backend | T-04, T-05 | Endpoint y credenciales de prueba |
| **T-07** | `qa` | Suite de pruebas de integración y E2E | T-05, T-06 | Criterios de aceptación y flujos de usuario |
```

---

## 4. Checklist de Reparto de Tareas

- [ ] ¿Cada tarea tiene un alcance acotado y un objetivo medible?
- [ ] ¿Las tareas que pueden ejecutarse en paralelo no tienen dependencias artificiales entre sí?
- [ ] ¿Los contratos de API o esquemas de datos se especificaron como insumo antes de iniciar el código?
- [ ] ¿La tarea de QA tiene como dependencias todas las tareas de implementación que debe certificar?
