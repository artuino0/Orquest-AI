# SQL Database Security (PostgreSQL and MySQL)

This reference defines standards for preventing SQL injection, enforcing least privilege, configuring Row-Level Security (RLS), and implementing database encryption.

---

## 1. SQL Injection Prevention (Absolute Rule)

**All dynamic SQL queries involving external parameters must use Prepared Statements**. Sanitizing inputs by escaping quotes via regular expressions or string replacement is vulnerable to bypass.

### Insecure vs Secure in Node.js (PostgreSQL `pg`)

**Insecure:**
```javascript
// INSECURE: SQL injection via string concatenation
const query = `SELECT * FROM accounts WHERE owner_id = '${req.query.id}'`;
const result = await client.query(query);
```

**Secure:**
```javascript
// SECURE: Bound parameters ($1, $2) handled by the database engine
const query = 'SELECT id, balance, status FROM accounts WHERE owner_id = $1';
const result = await client.query(query, [req.query.id]);
```

---

## 2. Least Privilege Application Database Accounts

Applications must **never** connect as `postgres`, `root`, or the database schema owner:

1. **Migration User (DDL)**: Permissions for `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`. Executes exclusively during deployments in a CI/CD runner.
2. **Application User (DML)**: Permissions restricted to data manipulation:
   ```sql
   CREATE USER app_user WITH PASSWORD 'strong_random_password';
   GRANT CONNECT ON DATABASE production_db TO app_user;
   GRANT USAGE ON SCHEMA public TO app_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
   REVOKE TRUNCATE, DROP, REFERENCES ON ALL TABLES IN SCHEMA public FROM app_user;
   ```

---

## 3. Row-Level Security (RLS in PostgreSQL)

RLS ensures that queries can only access rows belonging to the active tenant/user, protecting against IDOR vulnerabilities at the database engine level:

```sql
-- 1. Enable RLS on target table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 2. Create tenant isolation policy
CREATE POLICY tenant_isolation_policy ON documents
    FOR ALL
    TO app_user
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 3. At start of backend transaction:
-- SET LOCAL app.current_tenant_id = 'c7e8a91b-4f12-...';
```

---

## 4. Encryption in Transit and at Rest

- **In Transit**: Enforce TLS connections (`sslmode=verify-full` in PostgreSQL or `ssl-mode=VERIFY_IDENTITY` in MySQL). Reject plaintext connections.
- **At Rest**:
  - Cloud storage volume encryption (AWS EBS KMS, GCP Customer-Managed Encryption, Azure Storage Encryption).
  - Column-level encryption for ultra-sensitive fields (payment details, government IDs) using `pgcrypto` with keys managed outside the database.

---

## 5. SQL Security Checklist

- [ ] All dynamic queries use prepared statements with parameter binding.
- [ ] Application connects via a least-privilege DML user (no DDL or `SUPERUSER` privileges).
- [ ] Database connection enforces `sslmode=require` or `verify-full`.
- [ ] RLS or strict `tenant_id` query scoping is enforced in multi-tenant schemas.
- [ ] Sensitive fields are encrypted at rest; passwords hashed with Argon2id/BCrypt.
