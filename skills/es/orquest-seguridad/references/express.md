# Seguridad en Express.js

Esta referencia detalla cómo blindar servidores web y APIs desarrollados con Express.js.

---

## 1. Errores Típicos y Vulnerabilidades

- **Encabezados HTTP inseguros por omisión**: Revelación del encabezado `X-Powered-By: Express` y ausencia de CSP, HSTS o X-Frame-Options.
- **Falta de Limitación de Tasa (Rate Limiting)**: Exposición de endpoints de login y registro a ataques de fuerza bruta.
- **Manejo inseguro de errores**: Middleware de error por defecto que envía el stack trace completo con rutas locales en JSON al cliente.
- **CORS permisivo (`origin: '*'`) con credenciales habilitadas**: Permite que sitios maliciosos roben sesiones activas vía el navegador.

---

## 2. Configuración Segura de Express

```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Eliminar cabecera de fingerprinting
app.disable('x-powered-by');

// 2. Encabezados de seguridad con Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 3. CORS con lista blanca explícita
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://app.example.com').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 4. Rate Limiting en endpoints sensibles (Auth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});
app.use('/api/v1/auth/login', authLimiter);

// 5. Límites de tamaño de payload en JSON para prevenir DoS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Manejo Global de Errores

**Inseguro (Fuga de información interna):**
```javascript
// Inseguro: expone secretos y rutas internas del servidor
app.use((err, req, res, next) => {
  res.status(500).json({
    message: err.message,
    stack: err.stack,
    internalQuery: err.sql
  });
});
```

**Seguro (Error genérico para el cliente y log estructurado interno):**
```javascript
app.use((err, req, res, next) => {
  // Registrar detalle completo internamente
  console.error(JSON.stringify({
    level: 'error',
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  }));

  // Responder al cliente con mensaje genérico y código adecuado
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: statusCode === 500 ? 'An unexpected error occurred. Please try again.' : err.message
    }
  });
});
```

---

## 4. Checklist para Express.js

- [ ] ¿`helmet()` está configurado con directivas CSP y HSTS?
- [ ] ¿`app.disable('x-powered-by')` está activo?
- [ ] ¿El middleware `cors()` restringe los orígenes permitidos sin usar `*`?
- [ ] ¿Los endpoints de autenticación cuentan con `express-rate-limit`?
- [ ] ¿Los middlewares de `express.json()` tienen un límite estricto (`limit: '100kb'`)?
- [ ] ¿El middleware de error oculta el stack trace y detalles internos de la base de datos?
