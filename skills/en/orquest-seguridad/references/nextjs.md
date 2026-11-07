# Next.js Security (App Router and Pages Router)

This reference defines security best practices for modern Next.js applications (Next.js 13/14/15 with App Router and React Server Components).

---

## 1. Common Pitfalls and Vulnerabilities

- **Client-Side Secret Leaks**: Importing server configurations or secrets into Client Components (`'use client'`).
- **Missing Authorization in Server Actions**: Assuming Server Actions are protected by default; any Server Action can be invoked directly via HTTP POST requests if its action ID is known.
- **Server-Side Request Forgery (SSRF) in Route Handlers**: Calling `fetch()` on user-supplied URLs without restricting internal network access (`169.254.169.254`, private subnets).
- **Missing Security Headers**: Deploying Next.js without setting CSP, HSTS, and X-Frame-Options headers in `next.config.js`.

---

## 2. Secure `next.config.js` Configuration

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // Disables 'X-Powered-By: Next.js'
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

## 3. Code Patterns: Insecure vs Secure

### Server Actions Authorization and Validation

**Insecure (Implicit trust in Server Action caller):**
```typescript
'use server';

import { db } from '@/lib/db';

// INSECURE: Anyone can execute this action directly and delete invoices
export async function deleteInvoiceAction(invoiceId: string) {
  await db.invoice.delete({ where: { id: invoiceId } });
  return { success: true };
}
```

**Secure (Session authentication, input validation, and ownership check):**
```typescript
'use server';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { z } from 'zod';

const DeleteInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function deleteInvoiceAction(rawInput: unknown) {
  // 1. Verify authenticated session
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 2. Validate input schema with Zod
  const parsed = DeleteInvoiceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error('Invalid input payload');
  }

  // 3. Resource-level authorization check (prevent IDOR)
  const invoice = await db.invoice.findUnique({
    where: { id: parsed.data.invoiceId },
  });

  if (!invoice || invoice.tenantId !== user.tenantId) {
    throw new Error('Forbidden: invoice does not belong to your organization');
  }

  // 4. Perform operation securely
  await db.invoice.delete({ where: { id: parsed.data.invoiceId } });
  return { success: true };
}
```

---

## 4. Next.js Security Checklist

- [ ] `poweredByHeader: false` set in `next.config.js`.
- [ ] All Server Actions validate session identity, input schemas, and resource-level permissions.
- [ ] No private environment variables or server keys are imported into `'use client'` files.
- [ ] Server-side `fetch()` calls sanitize URLs and block private IP ranges.
- [ ] HTTP security headers (CSP, HSTS, X-Frame-Options) are configured.
