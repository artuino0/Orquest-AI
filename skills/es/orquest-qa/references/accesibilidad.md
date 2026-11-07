# Pruebas de Accesibilidad Básica (A11y / WCAG 2.1 AA)

Esta referencia establece las directrices para auditar y verificar la accesibilidad digital básica en aplicaciones web, garantizando que el software sea utilizable por personas con diversas discapacidades.

---

## 1. Reglas Esenciales de WCAG 2.1 Nivel AA

1. **Navegación completa por teclado**:
   - Todo elemento interactivo (botones, enlaces, campos de formulario, modales) debe alcanzarse mediante la tecla `Tab` y accionarse con `Enter` o `Space`.
   - **Indicador de foco visible**: El contorno de enfoque (`focus outline`) nunca debe eliminarse (`outline: none` sin sustituto accesible es un fallo de QA).
   - **Trampas de foco (Focus Traps)**: En ventanas modales, el foco debe quedar atrapado dentro del modal mientras esté abierto y regresar al elemento que lo abrió al cerrarse con `Esc`.
2. **Semántica HTML y ARIA**:
   - Usa etiquetas semánticas nativas: `<button>` para acciones, `<a>` para navegación, `<nav>`, `<main>`, `<header>`.
   - Si se usa un componente personalizado, debe llevar roles y atributos ARIA adecuados (`role="dialog"`, `aria-expanded`, `aria-label`).
3. **Contraste de color**:
   - Texto normal: Contraste mínimo de **4.5:1** contra el fondo.
   - Texto grande (≥ 18pt o 14pt negrita) o componentes visuales de interfaz: Mínimo **3:1**.
4. **Formularios e imágenes**:
   - Todo campo `<input>` debe tener un `<label>` asociado mediante `for="id"` o estar envuelto directamente.
   - Toda imagen informativa debe poseer un atributo `alt` descriptivo; imágenes puramente decorativas deben llevar `alt=""` o `aria-hidden="true"`.

---

## 2. Automatización con `@axe-core/playwright`

Si el proyecto cuenta con Playwright, la auditoría automática con axe-core detecta hasta el 50% de las violaciones de accesibilidad comunes:

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Auditoría de Accesibilidad', () => {
  test('La página principal no debe contener violaciones críticas o serias de WCAG', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
```

---

## 3. Comprobación Manual Rápida de QA (3 Minutos)

1. Desconecta el ratón o no lo toques.
2. Presiona `Tab` repetidamente desde la parte superior de la página:
   - ¿Se ve claramente en qué botón o enlace estás posicionado?
   - ¿El orden de tabulación es lógico de arriba abajo e izquierda a derecha?
   - Si abres un menú desplegable o diálogo, ¿puedes cerrarlo con la tecla `Escape`?
3. Revisa en el inspector de elementos si los campos de formulario tienen etiquetas legibles por lectores de pantalla.

---

## 4. Checklist de Accesibilidad

- [ ] Todos los elementos interactivos se pueden accionar exclusivamente con teclado.
- [ ] No se eliminó el foco visual (`outline: none`) sin un reemplazo contrastado.
- [ ] Las imágenes tienen texto alternativo (`alt`) apropiado.
- [ ] Los mensajes de error en formularios se vinculan con `aria-describedby` o son anunciados por lectores de pantalla.
- [ ] No hay violaciones detectadas por axe-core en las rutas modificadas.
