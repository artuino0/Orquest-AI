# End-to-End (E2E) Testing with Playwright

This reference details how to write and run reliable E2E tests, avoiding flaky selectors and race conditions in UI testing.

---

## 1. Principles for Resilient E2E Tests

1. **User-facing accessible locators**:
   - Use `page.getByRole()`, `page.getByLabel()`, `page.getByText()`, or `page.getByTestId()`.
   - **Forbidden**: Brittle CSS selectors tied to styling (`.btn-primary-v2`, `div > span:nth-child(3)`).
2. **Native Auto-waiting**:
   - Playwright automatically awaits element visibility, actionable state, and stability.
   - **Forbidden**: `page.waitForTimeout(3000)` (fixed sleep timers). If waiting for network calls, use `page.waitForResponse(...)` or wait for target element visibility.
3. **Test Isolation**:
   - Every test must run independently and manage its own state or fixtures. Never chain tests where test B depends on cookies or state left by test A.

---

## 2. Professional E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login and Project Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('Allows user to authenticate and create a new project successfully', async ({ page }) => {
    // 1. Fill login form using accessible locators
    await page.getByLabel('Email address').fill('tester@example.com');
    await page.getByLabel('Password').fill('CorrectPassword123!');
    await page.getByRole('button', { name: 'Log in' }).click();

    // 2. Validate redirection to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'My Projects' })).toBeVisible();

    // 3. Create a project
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByPlaceholder('Project name').fill('Project Alpha QA');
    await page.getByRole('button', { name: 'Save' }).click();

    // 4. Assert success feedback
    const toast = page.getByRole('status');
    await expect(toast).toContainText('Project created successfully');
    await expect(page.getByText('Project Alpha QA')).toBeVisible();
  });

  test('Displays accessible error on invalid credentials', async ({ page }) => {
    await page.getByLabel('Email address').fill('tester@example.com');
    await page.getByLabel('Password').fill('WrongPassword!');
    await page.getByRole('button', { name: 'Log in' }).click();

    const alertMessage = page.getByRole('alert');
    await expect(alertMessage).toBeVisible();
    await expect(alertMessage).toContainText('Invalid credentials');
    await expect(page).toHaveURL(/\/login/);
  });
});
```

---

## 3. Test Execution and Diagnostics

If Playwright is installed in the repository:

```bash
# Run all E2E tests headless
npx playwright test

# Run a specific test file
npx playwright test tests/e2e/login.spec.ts

# Run with browser window visible for debugging
npx playwright test --headed

# View interactive HTML report with traces and screenshots
npx playwright show-report
```

Capture screenshots for exploratory testing evidence:
```bash
npx playwright screenshot http://localhost:3000/dashboard dashboard-evidence.png
```

---

## 4. E2E Testing Checklist

- [ ] Locators rely on accessible roles (`getByRole`, `getByLabel`) rather than CSS classes.
- [ ] No arbitrary `page.waitForTimeout` delays are present.
- [ ] Tests are self-contained and pass in randomized execution order.
- [ ] Test fixtures and generated state are cleaned up or scoped to fresh browser contexts.
- [ ] Assertions verify real DOM state changes and expected URL paths.
