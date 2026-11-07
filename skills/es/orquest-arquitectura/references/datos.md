# Estrategia de Datos, Consistencia y Migraciones

Esta referencia describe los principios de gestión de datos a nivel arquitectónico: topología de persistencia, particionamiento, consistencia y migraciones sin interrupción del servicio (*zero-downtime*).

---

## 1. Topología de Bases de Datos: ¿Compartida o por Servicio?

- **Base de Datos por Servicio (Database-per-Service)**:
  - Cada servicio tiene su propio esquema o motor de persistencia.
  - Ningún otro servicio tiene permisos de red ni credenciales para conectarse directamente; toda interacción ocurre a través de APIs o eventos.
  - **Obligatorio en arquitecturas de microservicios genuinas** para permitir cambios independientes de esquema.
- **Base de Datos Compartida**:
  - Múltiples servicios o módulos leen y escriben en las mismas tablas.
  - **Aceptable únicamente en monolitos modulares** donde el código vive en el mismo repositorio y el esquema evoluciona en un solo commit. En sistemas distribuidos es un anti-patrón severo.

---

## 2. Consistencia Fuerte vs Consistencia Eventual

- **Consistencia Fuerte (ACID)**:
  - Garantiza que cualquier lectura inmediatamente posterior a una confirmación (*commit*) reflejará el dato actualizado.
  - Indispensable dentro de un mismo agregado y operaciones de saldo bancario / reservas críticas inmediatas.
  - Requiere transacciones locales en motores relacionales (PostgreSQL, MySQL).
- **Consistencia Eventual (BASE)**:
  - Los datos se propagan asíncronamente; durante una ventana de milisegundos o segundos, diferentes réplicas o proyecciones de lectura pueden tener datos desactualizados.
  - Permite altísima disponibilidad y desacoplamiento en lecturas (vistas CQRS, motores de búsqueda Elasticsearch).

---

## 3. Migraciones sin Downtime: El Patrón Expandir y Contraer (Expand and Contract)

Nunca modifiques o renombres una columna en producción de forma destructiva en un solo paso mientras la aplicación antigua sigue recibiendo tráfico. Aplica la estrategia en 3 fases:

1. **Fase 1 (Expandir)**:
   - Agrega la nueva columna o tabla sin eliminar la anterior (ej. agregar `phone_number_e164` manteniendo `phone`).
   - El código nuevo comienza a escribir en ambas columnas, pero sigue leyendo de la antigua si la nueva está vacía.
2. **Fase 2 (Migración de Datos en Segundo Plano)**:
   - Un script de migración por lotes copia los registros históricos de la columna antigua a la nueva sin bloquear la tabla.
   - El código se actualiza para leer y escribir exclusivamente en la nueva columna.
3. **Fase 3 (Contraer)**:
   - Una vez verificado que ninguna instancia de la aplicación lee la columna antigua, se elimina la columna antigua en una migración de limpieza final.

---

## 4. Checklist de Estrategia de Datos

- [ ] ¿Los servicios no comparten tablas de base de datos directamente entre sí?
- [ ] ¿Las consultas frecuentes tienen índices compuestos apropiados que evitan `Seq Scan` masivos?
- [ ] ¿Las migraciones de esquema siguen el patrón expandir y contraer para evitar bloqueos de tabla (*table locks*) en producción?
- [ ] ¿Todas las migraciones cuentan con un script de reversión (`down` migration) probado?
