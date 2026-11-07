# Basic Accessibility Testing (A11y / WCAG 2.1 AA)

This reference outlines standards for auditing and verifying basic digital accessibility in web applications to ensure usability for people with disabilities.

---

## 1. Essential WCAG 2.1 Level AA Rules

1. **Complete Keyboard Navigation**:
   - Every interactive element (buttons, links, form inputs, modals) must be reachable via `Tab` and activated via `Enter` or `Space`.
   - **Visible Focus Indicator**: Focus outlines must never be stripped (`outline: none` without an accessible visual replacement is an immediate QA failure).
   - **Focus Trapping**: In modal dialogs, focus must be trapped within the modal while open and return to the triggering element upon closing with `Esc`.
2. **Semantic HTML and ARIA**:
   - Use native semantic tags: `<button>` for actions, `<a>` for navigation, `<nav>`, `<main>`, `<header>`.
   - Custom interactive components must carry appropriate ARIA roles and attributes (`role="dialog"`, `aria-expanded`, `aria-label`).
3. **Color Contrast**:
   - Standard text: Minimum contrast ratio of **4.5:1** against background.
   - Large text (≥ 18pt or 14pt bold) and active UI components: Minimum **3:1**.
4. **Forms and Media**:
   - Form inputs require an associated `<label>` via `for="id"` or direct nesting.
   - Informative images require a descriptive `alt` attribute; decorative images must use `alt=""` or `aria-hidden="true"`.

---

## 2. Automated Auditing with `@axe-core/playwright`

In projects with Playwright, automated axe-core scans catch up to 50% of common accessibility violations:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Audit', () => {
  test('Main landing page must not contain critical or serious WCAG violations', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
```

---

## 3. Quick 3-Minute Manual QA Check

1. Do not touch the mouse.
2. Press `Tab` repeatedly from the top of the page:
   - Is it clearly obvious which element currently holds focus?
   - Is tab order logical (top-to-bottom, left-to-right)?
   - If a modal or dropdown opens, does `Escape` close it cleanly?
3. Inspect form elements to confirm labels are announced by screen readers.

---

## 4. Accessibility Checklist

- [ ] All interactive elements are operable exclusively via keyboard.
- [ ] Visual focus indicators were not stripped without a high-contrast replacement.
- [ ] Informational images have meaningful `alt` text.
- [ ] Form error messages are linked with `aria-describedby` or announced by screen readers.
- [ ] No critical violations detected by axe-core on updated routes.
