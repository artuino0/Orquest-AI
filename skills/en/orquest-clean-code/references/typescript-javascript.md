# Best Practices and Conventions: TypeScript and JavaScript

This guide details clean code standards, recommended patterns, and verification tools for modern TypeScript and JavaScript (ES2022+ / Node.js / Browser).

---

## 1. Language Conventions and Idioms

- **Naming**:
  - `camelCase` for variables, functions, methods, and object properties.
  - `PascalCase` for classes, interfaces, types (`type`), enums, and components (React/Vue).
  - `SCREAMING_SNAKE_CASE` strictly for truly global immutable constants (e.g., `DEFAULT_TIMEOUT_MS`).
- **Strict Typing in TypeScript**:
  - Enable and adhere to `strict: true` in `tsconfig.json`.
  - Forbid `any` except in extreme interoperability cases; use `unknown` and narrow types using type guards or runtime validators like Zod/Valibot.
  - Prefer `interface` for public extensible object contracts and `type` for unions, tuples, and computed types.
- **Immutability and Functional Operations**:
  - Use `const` by default. Use `let` only if the variable is truly reassigned. Never use `var`.
  - Prefer immutable methods (`map`, `filter`, `reduce`, or object/array spread `...`) instead of in-place mutation.
- **Clean Asynchrony**:
  - Use `async / await` instead of chaining `.then().catch()`.
  - Run independent concurrent tasks with `Promise.all()` or `Promise.allSettled()`, avoiding unnecessary sequential `await` loops.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Safe Typing and Handling `unknown` vs `any`

**Incorrect (unsafe and fragile):**
```typescript
// Bad: 'any' disables compiler checks and causes runtime errors
function parseUserData(rawResponse: any): string {
  return rawResponse.user.profile.displayName.toUpperCase();
}
```

**Correct (robust typing and null-safe):**
```typescript
interface UserProfile {
  displayName: string;
}

interface UserPayload {
  user?: {
    profile?: UserProfile;
  };
}

function parseUserData(rawResponse: unknown): string {
  if (typeof rawResponse !== 'object' || rawResponse === null) {
    throw new TypeError('Invalid response format: expected an object');
  }

  const payload = rawResponse as UserPayload;
  const displayName = payload.user?.profile?.displayName;

  if (!displayName) {
    return 'Anonymous';
  }

  return displayName.toUpperCase();
}
```

---

### B. Small Functions, Early Guards, and Fast Return

**Incorrect (deep nesting / Arrow Anti-pattern):**
```typescript
// Bad: multiple indentation levels make logic hard to follow
function processOrder(order: Order | null, user: User | null): boolean {
  if (order !== null) {
    if (user !== null) {
      if (user.isActive) {
        if (order.totalAmount > 0) {
          order.markAsProcessed();
          return true;
        } else {
          return false;
        }
      } else {
        return false;
      }
    } else {
      return false;
    }
  } else {
    return false;
  }
}
```

**Correct (early return clauses):**
```typescript
// Good: linear readability, fast exit on invalid state
function processOrder(order: Order | null, user: User | null): boolean {
  if (!order || !user) {
    return false;
  }

  if (!user.isActive || order.totalAmount <= 0) {
    return false;
  }

  order.markAsProcessed();
  return true;
}
```

---

### C. Explicit Error Handling

**Incorrect (swallowing errors or logging without action):**
```typescript
// Bad: caller never learns about failure and state becomes inconsistent
async function fetchConfig(url: string) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.log('Error fetching config');
    return null;
  }
}
```

**Correct (typed error with enriched context):**
```typescript
class ConfigurationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

async function fetchConfig(url: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new ConfigurationError(`HTTP Error fetching configuration: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to fetch config from ${url}`, error);
  }
}
```

---

## 3. Reference Linters and Formatters

Run project tools before completing the task:

- **ESLint**:
  ```bash
  # Check for linting issues
  npx eslint . --ext .ts,.tsx,.js,.jsx
  # Auto-fix minor issues
  npx eslint . --fix
  ```
- **Prettier**:
  ```bash
  # Verify formatting
  npx prettier --check "src/**/*.{ts,tsx,js,json,md}"
  # Apply formatting
  npx prettier --write "src/**/*.{ts,tsx,js,json,md}"
  ```
- **Biome** (if used by the project):
  ```bash
  npx @biomejs/biome check --write src/
  ```
- **Type Check (TypeScript)**:
  ```bash
  npx tsc --noEmit
  ```

---

## 4. Checklist for TypeScript and JavaScript

- [ ] `tsc --noEmit` runs with zero type errors.
- [ ] No unjustified `any` types were added; `unknown`, generics, or interfaces are used.
- [ ] No leftover `console.log` or `debugger` statements.
- [ ] Optional chaining (`?.`) and nullish coalescing (`??`) used instead of ambiguous truthiness (`||`).
- [ ] Async functions handle promise rejections with `try / catch` and clear exceptions.
