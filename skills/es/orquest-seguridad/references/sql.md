# Seguridad en Bases de Datos SQL (PostgreSQL y MySQL)

Esta referencia define las normas para prevenir inyección SQL, gestionar privilegios mínimos, implementar seguridad a nivel de fila (RLS) y garantizar el cifrado de datos.

---

## 1. Prevención de Inyección SQL (Regla Absoluta)

**Toda consulta SQL que involucre datos externos debe ser parametrizada mediante Prepared Statements**. La sanitización basada en escapar comillas con expresiones regulares o funciones como `addslashes` es falible y propensa a bypass.

### Inseguro vs Seguro en Node.js (PostgreSQL `pg`)

**Inseguro:**
```javascript
// INSEGURO: Inyección SQL mediante concatenación de strings
const query = `SELECT * FROM accounts WHERE owner_id = '${req.query.id}'`;
const result = await client.query(query);
```

**Seguro:**
```javascript
// SEGURO: Parámetros vinculados ($1, $2) manejados por el motor de BD
const query = 'SELECT id, balance, status FROM accounts WHERE owner_id = $1';
const result = await client.query(query, [req.query.id]);
```

---

## 2. Privilegios Mínimos de Conexión de la Aplicación

La aplicación web **nunca** debe conectarse con el usuario `postgres`, `root` o propietario del esquema (*schema owner*):

1. **Usuario de Migraciones (DDL)**: Permisos para `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`. Se ejecuta únicamente durante el despliegue en un runner de CI/CD.
2. **Usuario de Aplicación (DML)**: Solo permisos de lectura y modificación de datos:
   ```sql
   -- Crear usuario de aplicación con permisos limitados
   CREATE USER app_user WITH PASSWORD 'strong_random_password';
   GRANT CONNECT ON DATABASE production_db TO app_user;
   GRANT USAGE ON SCHEMA public TO app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   -- Revocar permisos destructivos
   REVOKE TRUNCATE, DROP, REFERENCES ON ALL TABLES IN SCHEMA public FROM app_user;
   ```

---

## 3. Seguridad a Nivel de Fila (Row-Level Security - RLS en PostgreSQL)

RLS asegura que una sesión solo pueda consultar y modificar las filas que le pertenecen, protegiendo contra vulnerabilidades de IDOR a nivel del propio motor de base de datos:

```sql
-- 1. Habilitar RLS en la tabla sensible
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 2. Crear política: solo ver documentos donde tenant_id coincide con el contexto de sesión
CREATE POLICY tenant_isolation_policy ON documents
    FOR ALL
    TO app_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 3. Al inicio de cada conexión o transacción en el backend:
-- SET LOCAL app.current_tenant_id = 'c7e8a91b-4f12-...';
```

---

## 4. Cifrado en Reposo y en Tránsito

- **En Tránsito**: Forzar TLS en las conexiones de la base de datos (`sslmode=verify-full` en PostgreSQL o `ssl-mode=VERIFY_IDENTITY` en MySQL). Rechazar conexiones sin cifrado.
- **En Reposo**:
  - Almacenamiento cifrado en el proveedor de nube (AWS EBS con KMS, Google Cloud Encryption, Azure TDE).
  - Cifrado a nivel de columna para campos ultra-sensibles (números de tarjeta, tokens bancarios) usando `pgcrypto` (`pgp_sym_encrypt`) con llaves gestionadas fuera de la base de datos.

---

## 5. Checklist para SQL

- [ ] Todas las consultas dinámicas usan consultas preparadas y parámetros vinculados.
- [ ] La aplicación se conecta con un usuario de privilegios DML mínimos (sin permisos DDL ni `SUPERUSER`).
- [ ] La conexión fuerza `sslmode=require` o `verify-full`.
- [ ] Se implementó RLS o filtrado estricto por `tenant_id` en todas las consultas multinquilino.
- [ ] Los campos sensibles están cifrados en reposo y las contraseñas se almacenan con Argon2id/BCrypt.
