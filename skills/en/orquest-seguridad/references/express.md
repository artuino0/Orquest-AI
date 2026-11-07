# Express.js Security

This reference outlines standards for hardening web servers and APIs built with Express.js.

---

## 1. Common Pitfalls and Vulnerabilities

- **Default Insecure Headers**: Exposing `X-Powered-By: Express` and lacking CSP, HSTS, or X-Frame-Options headers.
- **Missing Rate Limiting**: Leaving login and registration routes exposed to automated credential stuffing.
- **Insecure Error Handling**: Default error handlers returning complete stack traces with internal server paths to API clients.
- **Permissive CORS (`origin: '*'`) with Credentials**: Allowing arbitrary external domains to hijack authenticated sessions.

---

## 2. Secure Express Configuration

```javascript
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// 1. Disable technology fingerprinting
app.disable('x-powered-by');

// 2. Harden HTTP headers with Helmet
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

// 3. Restrictive CORS with explicit whitelist
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

// 4. Rate Limiting on sensitive endpoints (Auth)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});
app.use('/api/v1/auth/login', authLimiter);

// 5. Enforce body size limits to prevent memory exhaustion DoS
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
```

---

## 3. Code Patterns: Insecure vs Secure

### Global Error Handling

**Insecure (Leaking internal database queries and stack traces):**
```javascript
// Insecure: exposes internal secrets and system paths to clients
app.use((err, req, res, next) => {
  res.status(500).json({
    message: err.message,
    stack: err.stack,
    internalQuery: err.sql
  });
});
```

**Secure (Sanitized client error and structured internal log):**
```javascript
app.use((err, req, res, next) => {
  // Log full internal details on the server side
  console.error(JSON.stringify({
    level: 'error',
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  }));

  // Return generic error payload to client
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

## 4. Express.js Security Checklist

- [ ] `helmet()` is configured with CSP and HSTS directives.
- [ ] `app.disable('x-powered-by')` is active.
- [ ] CORS middleware restricts origins without using `*`.
- [ ] Authentication endpoints are protected by `express-rate-limit`.
- [ ] `express.json()` includes a strict body size limit (`limit: '100kb'`).
- [ ] Error handler conceals internal stack traces and database queries from clients.
