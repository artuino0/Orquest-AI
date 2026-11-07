# MongoDB Security

This reference defines security standards for NoSQL databases running on MongoDB and Mongoose.

---

## 1. Common Pitfalls and Vulnerabilities

- **NoSQL Operator Injection**: Passing raw JSON objects from `req.body` or `req.query` into database queries. If an attacker submits `{"username": {"$ne": null}, "password": {"$ne": null}}`, MongoDB matches the first user record without requiring a valid password.
- **JavaScript Code Injection in `$where` or `mapReduce`**: Executing dynamic server-side JavaScript using unvalidated inputs.
- **Unauthenticated Instances**: Running MongoDB without `authorization: enabled`, exposing port 27017 to the public internet.

---

## 2. Secure MongoDB Configuration

In `mongod.conf`:
```yaml
net:
  port: 27017
  bindIp: 127.0.0.1 # Bind strictly to localhost or private internal VPC
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem
    CAFile: /etc/ssl/ca.pem

security:
  authorization: enabled # Require authentication
  javascriptEnabled: false # Disable server-side JavaScript execution ($where)
```

---

## 3. Code Patterns: Insecure vs Secure

### Preventing NoSQL Injection with Mongoose and Schema Sanitization

**Insecure:**
```javascript
// INSECURE: If req.body.password is {"$gt": ""}, logs in without valid credentials
app.post('/api/login', async (req, res) => {
  const user = await db.collection('users').findOne({
    username: req.body.username,
    password: req.body.password
  });
  if (user) res.json({ success: true });
});
```

**Secure (Sanitizing operators and validating schemas with Zod):**
```javascript
const mongoSanitize = require('express-mongo-sanitize');

// 1. Strip keys starting with '$' or containing '.'
app.use(mongoSanitize());

// 2. Explicit primitive typing
const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100)
});

app.post('/api/login', async (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // 3. Strict query and cryptographic hash comparison
  const user = await User.findOne({ username: result.data.username }).exec();
  if (!user || !(await verifyPassword(result.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ success: true });
});
```

---

## 4. MongoDB Security Checklist

- [ ] `security.authorization: enabled` active in cluster configuration.
- [ ] `security.javascriptEnabled: false` disables `$where` and `mapReduce`.
- [ ] `express-mongo-sanitize` strips `$` query operators from inputs.
- [ ] Strict Mongoose schema typing enforced (`strict: 'throw'`).
- [ ] TLS connections enforced (`tls=true`) with minimal database roles (`readWrite`).
