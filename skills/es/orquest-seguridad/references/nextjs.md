# Seguridad en Next.js (App Router y Pages Router)

Esta referencia establece las prácticas de seguridad para aplicaciones Next.js modernas (versión 13/14/15 con App Router y React Server Components).

---

## 1. Errores Típicos y Vulnerabilidades

- **Fuga de Secretos en el Cliente**: Usar variables sin prefijo dentro de componentes de cliente o pasar objetos de configuración completos de Node al navegador.
- **Falta de Autorización en Server Actions**: Asumir que una `Server Action` ("use server") es privada o interna; cualquier usuario puede invocar un Server Action enviando una petición HTTP directa con su ID.
- **Server-Side Request Forgery (SSRF) en Route Handlers**: Consumir URLs proporcionadas por el usuario en `fetch()` desde el servidor Next.js sin validación de IP privada (ej. `http://169.254.169.254`).
- **Encabezados de seguridad ausentes en `next.config.js`**: Desplegar Next.js sin configurar cabeceras CSP, HSTS y X-Frame-Options.

---

## 2. Configuración Segura de `next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // Desactiva 'X-Powered-By: Next.js'
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline';",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### Autorización y Validación Estricta en Server Actions

**Inseguro (Confianza ciega en la invocación del Server Action):**
```typescript
'use server';

import { db } from '@/lib/db';

// INSEGURO: Cualquiera con el nombre de la función puede enviar una petición POST y borrar datos
export async function deleteInvoiceAction(invoiceId: string) {
  await db.invoice.delete({ where: { id: invoiceId } });
  return { success: true };
}
```

**Seguro (Autenticación de sesión, validación de esquema y comprobación de permisos):**
```typescript
'use server';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';

const DeleteInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function deleteInvoiceAction(rawInput: unknown) {
  // 1. Verificar sesión activa
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 2. Validar entrada con Zod
  const parsed = DeleteInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error('Invalid input payload');
  }

  // 3. Comprobar autorización a nivel de recurso (prevenir IDOR)
  const invoice = await db.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
  });

  if (!invoice || invoice.tenantId !== user.tenantId) {
    throw new Error('Forbidden: invoice does not belong to your organization');
  }

  // 4. Ejecutar acción segura
  await db.invoice.delete({ where: { id: parsed.data.invoiceId } });
  return { success: true };
}
```

---

## 4. Checklist para Next.js

- [ ] `poweredByHeader: false` configurado en `next.config.js`.
- [ ] Todas las Server Actions (`'use server'`) validan sesión, esquema de entrada y permisos IDOR.
- [ ] No se importan variables privadas ni secretos dentro de componentes con `'use client'`.
- [ ] Las peticiones `fetch()` en el servidor validan URLs de destino para prevenir SSRF.
- [ ] Se implementaron encabezados de seguridad (CSP, HSTS, X-Frame-Options) en `next.config.js` o middleware.
