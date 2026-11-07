# Pruebas End-to-End (E2E) con Playwright

Esta referencia detalla cómo escribir y ejecutar pruebas E2E robustas, evitando selectores frágiles y condiciones de carrera en interfaces de usuario.

---

## 1. Principios para E2E Resilientes

1. **Selectores accesibles orientados al usuario**:
   - Usa `page.getByRole()`, `page.getByLabel()`, `page.getByText()` o `page.getByTestId()`.
   - **Prohibido**: Selectores CSS frágiles atados a clases visuales (`.btn-primary-v2`, `div > span:nth-child(3)`).
2. **Auto-espera nativa (Auto-waiting)**:
   - Playwright espera automáticamente a que los elementos sean visibles, interactuables y estables.
   - **Prohibido**: Usar `page.waitForTimeout(3000)` ("sleeps" fijos). Si necesitas esperar red, usa `page.waitForResponse(...)` o espera el estado visible del selector objetivo.
3. **Aislamiento de pruebas**:
   - Cada prueba debe ser independiente y crear sus propios datos o estado. No encadenes pruebas donde el paso B dependa de que el paso A haya dejado una cookie o sesión previa.

---

## 2. Ejemplo de Prueba E2E Profesional

```typescript
import { test, expect } from '@playwright/test';

test.describe('Flujo de Inicio de Sesión y Creación de Proyecto', () => {
  test.beforeEach(async ({ page }) => {
    // Navegación a la página de login
    await page.goto('/login');
  });

  test('Permite autenticarse y crear un nuevo proyecto exitosamente', async ({ page }) => {
    // 1. Llenar formulario usando localizadores accesibles
    await page.getByLabel('Correo electrónico').fill('tester@example.com');
    await page.getByLabel('Contraseña').fill('CorrectPassword123!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // 2. Verificar redirección al panel principal
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Mis Proyectos' })).toBeVisible();

    // 3. Crear proyecto
    await page.getByRole('button', { name: 'Nuevo Proyecto' }).click();
    await page.getByPlaceholder('Nombre del proyecto').fill('Proyecto Alpha QA');
    await page.getByRole('button', { name: 'Guardar' }).click();

    // 4. Aserción de éxito
    const toast = page.getByRole('status');
    await expect(toast).toContainText('Proyecto creado exitosamente');
    await expect(page.getByText('Proyecto Alpha QA')).toBeVisible();
  });

  test('Muestra error accesible ante credenciales inválidas', async ({ page }) => {
    await page.getByLabel('Correo electrónico').fill('tester@example.com');
    await page.getByLabel('Contraseña').fill('WrongPassword!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    const alertMessage = page.getByRole('alert');
    await expect(alertMessage).toBeVisible();
    await expect(alertMessage).toContainText('Credenciales incorrectas');
    // Asegurarse de que no navegó
    await expect(page).toHaveURL(/\/login/);
  });
});
```

---

## 3. Comandos de Ejecución y Diagnóstico

Si el repositorio ya cuenta con Playwright instalado:

```bash
# Ejecutar todas las pruebas E2E en modo headless
npx playwright test

# Ejecutar un archivo específico
npx playwright test tests/e2e/login.spec.ts

# Ejecutar con navegador visible para depuración
npx playwright test --headed

# Ver informe interactivo en HTML con trazas y capturas
npx playwright show-report
```

Para generar capturas de pantalla de evidencia durante una prueba exploratoria:
```bash
# Captura con Playwright CLI
npx playwright screenshot http://localhost:3000/dashboard dashboard-evidencia.png
```

---

## 4. Checklist para Pruebas E2E

- [ ] ¿Los localizadores usan roles accesibles (`getByRole`, `getByLabel`) en lugar de clases CSS?
- [ ] ¿No existen llamadas a `page.waitForTimeout` con retardos artificiales fijos?
- [ ] ¿Las pruebas son independientes y pueden ejecutarse en orden aleatorio?
- [ ] ¿Se limpian los datos de prueba creados o se aíslan por contexto de navegador?
- [ ] ¿Las aserciones verifican cambios reales de estado en el DOM y la URL?
