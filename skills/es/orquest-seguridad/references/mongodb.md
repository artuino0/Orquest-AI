# Seguridad en MongoDB

Esta referencia define las pautas de seguridad para bases de datos NoSQL basadas en MongoDB y Mongoose.

---

## 1. Errores Típicos y Vulnerabilidades NoSQL

- **Inyección NoSQL por Objeto de Consulta**: Pasar objetos JSON directos desde `req.body` o `req.query` a consultas de MongoDB. Si el atacante envía `{"username": {"$ne": null}, "password": {"$ne": null}}`, la consulta retorna el primer usuario sin necesidad de conocer la contraseña.
- **Inyección de Código en `$where` o `mapReduce`**: Usar JavaScript evaluado del lado del servidor en cláusulas `$where` concatenando entradas de usuario.
- **Instancias expuestas sin autenticación**: Instalar MongoDB sin activar `authorization: enabled`, dejando el puerto 27017 abierto a internet.

---

## 2. Configuración Segura de MongoDB

En `mongod.conf`:
```yaml
net:
  port: 27017
  bindIp: 127.0.0.1 # Escuchar solo en localhost o red interna privada
  tls:
    mode: requireTLS
    certificateKeyFile: /etc/ssl/mongodb.pem
    CAFile: /etc/ssl/ca.pem

security:
  authorization: enabled # Autenticación obligatoria
  javascriptEnabled: false # Desactiva ejecución de scripts del lado del servidor ($where)
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Prevención de Inyección NoSQL con Mongoose / Sanitización

**Inseguro:**
```javascript
// INSEGURO: Si req.body.password es {"$gt": ""}, autentica sin password válida
app.post('/api/login', async (req, res) => {
  const user = await db.collection('users').findOne({
    username: req.body.username,
    password: req.body.password
  });
  if (user) res.json({ success: true });
});
```

**Seguro (Uso de express-mongo-sanitize y tipado estricto):**
```javascript
const mongoSanitize = require('express-mongo-sanitize');

// 1. Middleware que elimina cualquier clave que comience con '$' o contenga '.'
app.use(mongoSanitize());

// 2. Validación explícita de tipos primitivos (string) con esquema estricto (Zod)
const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(100)
});

app.post('/api/login', async (req, res) => {
  const result = LoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  // 3. Consulta estricta y comparación criptográfica de hash
  const user = await User.findOne({ username: result.data.username }).exec();
  if (!user || !(await verifyPassword(result.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ success: true });
});
```

---

## 4. Checklist para MongoDB

- [ ] `security.authorization: enabled` está activo en la configuración del clúster.
- [ ] La opción `security.javascriptEnabled: false` desactiva `$where` y `mapReduce`.
- [ ] Se usa `express-mongo-sanitize` o validadores de esquema que bloquean operadores `$` en entradas de usuario.
- [ ] Se aplican esquemas estrictos de Mongoose (`strict: 'throw'`).
- [ ] La conexión utiliza TLS (`tls=true`) y credenciales con roles de base de datos mínimos (`readWrite`).
