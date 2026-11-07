# Buenas Prácticas y Convenciones: TypeScript y JavaScript

Esta guía detalla los estándares de código limpio, patrones recomendados y herramientas de verificación para proyectos en TypeScript y JavaScript moderno (ES2022+ / Node.js / Navegador).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Nombres**:
  - `camelCase` para variables, funciones, métodos y propiedades de objetos.
  - `PascalCase` para clases, interfaces, tipos (`type`), enums y componentes (React/Vue).
  - `SCREAMING_SNAKE_CASE` únicamente para constantes verdaderamente globales e inmutables (ej. `DEFAULT_TIMEOUT_MS`).
- **Tipado Estricto en TypeScript**:
  - Activa y respeta `strict: true` en `tsconfig.json`.
  - Prohibido el uso de `any` salvo casos extremos de interoperabilidad; utiliza `unknown` y estrecha tipos con guardas de tipo (`type guards`) o validadores como Zod/Valibot.
  - Prefiere `interface` para definir contratos de objetos públicos extensibles y `type` para uniones, tuplas y tipos calculados.
- **Inmutabilidad y Operaciones Funcionales**:
  - Usa `const` por defecto. Usa `let` solo si la variable realmente se reasigna. Nunca uses `var`.
  - Prefiere métodos inmutables (`map`, `filter`, `reduce`, o el operador de propagación `...`) en lugar de mutar arrays u objetos en sitio.
- **Asincronía limpia**:
  - Usa `async / await` en lugar de encadenar `.then().catch()`.
  - Maneja ejecuciones concurrentes independientes con `Promise.all()` o `Promise.allSettled()`, evitando bucles `await` secuenciales innecesarios.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. Tipado seguro y manejo de `unknown` vs `any`

**Incorrecto (inseguro y frágil):**
```typescript
// Mal: 'any' desactiva el compilador y propaga errores a tiempo de ejecución
function parseUserData(rawResponse: any): string {
  return rawResponse.user.profile.displayName.toUpperCase();
}
```

**Correcto (tipado robusto y seguro ante nulos):**
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

### B. Funciones pequeñas, guardas tempranas y retorno rápido

**Incorrecto (anidamiento profundo / Arrow Anti-pattern):**
```typescript
// Mal: múltiples niveles de indentación dificultan la lectura
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

**Correcto (cláusulas de guarda tempranas):**
```typescript
// Bien: lectura lineal, salida temprana ante condiciones no válidas
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

### C. Manejo explícito de errores

**Incorrecto (tragar errores o log sin acción):**
```typescript
// Mal: el llamador nunca se entera del fallo y el sistema queda en estado inconsistente
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

**Correcto (error tipado con contexto enriquecido):**
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

## 3. Linters y Formateadores de Referencia

Ejecuta las herramientas existentes en el proyecto antes de dar por terminada la tarea:

- **ESLint**:
  ```bash
  # Revisar errores de linting
  npx eslint . --ext .ts,.tsx,.js,.jsx
  # Corregir automáticamente problemas menores
  npx eslint . --fix
  ```
- **Prettier**:
  ```bash
  # Verificar formato sin modificar
  npx prettier --check "src/**/*.{ts,tsx,js,json,md}"
  # Aplicar formato
  npx prettier --write "src/**/*.{ts,tsx,js,json,md}"
  ```
- **Biome** (si el repo lo utiliza en lugar de ESLint/Prettier):
  ```bash
  npx @biomejs/biome check --write src/
  ```
- **Verificación de tipos (TypeScript)**:
  ```bash
  npx tsc --noEmit
  ```

---

## 4. Checklist para TypeScript y JavaScript

- [ ] `tsc --noEmit` ejecuta sin ningún error de tipado.
- [ ] No se añadieron tipos `any` injustificados; se usaron `unknown`, tipos genéricos o interfaces.
- [ ] No existen llamadas a `console.log` o `debugger` residuales.
- [ ] Se usan operadores opcionales encadenados (`?.`) y coalescencia nula (`??`) en vez de comprobaciones booleanas ambiguas (`||`).
- [ ] Las dependencias asíncronas manejan rechazos de promesa con `try / catch` y excepciones descriptivas.
