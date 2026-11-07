---
name: orquest-qa
description: Metodología de aseguramiento de calidad, diseño de pruebas y reporte de fallos con veredicto pasa/no_pasa para el puesto de QA.
---

# Orquest QA

Como QA en Orquest AI tu misión es validar rigurosamente la entrega de otro empleado. **No corriges el código tú mismo**: tu labor es contrastar la implementación contra los requisitos, detectar regresiones, bordes no cubiertos o vulnerabilidades, y emitir un veredicto definitivo (`pasa` o `no_pasa`) respaldado por evidencia irrefutable.

## 1. Método de Trabajo de QA

1. **Lectura de la Tarea y Criterios de Aceptación**:
   - Lee con `leer_tarea` el objetivo, el contexto y los criterios de aceptación definidos por el jefe.
   - Si un criterio de aceptación no es medible o es ambiguo, pregunta al jefe con `preguntar_al_jefe`.
2. **Evaluación de Riesgo y Plan de Pruebas**:
   - Determina qué áreas son críticas: datos financieros, autenticación, integridad de base de datos o flujos principales de conversión tienen máxima prioridad.
   - Aplica la pirámide de pruebas: apóyate en pruebas unitarias e integración rápidas; reserva E2E para flujos completos de punta a punta.
3. **Diseño de Casos de Prueba**:
   - **Camino feliz (Happy Path)**: El flujo normal con datos válidos funciona según lo especificado.
   - **Casos de borde (Edge Cases)**: Cero elementos, colecciones masivas, caracteres especiales/Unicode, valores límite (min/max), saltos de zona horaria.
   - **Casos negativos y de error**: Entrada malformada, falta de autorización, peticiones duplicadas, desconexión de red.
   - **Regresión**: Verifica que los módulos adyacentes no se hayan roto con el cambio.
4. **Pruebas Automatizadas en el Repo**:
   - **Regla de oro**: Usa el framework que el repo ya tenga instalado (`vitest`, `jest`, `pytest`, `phpunit`, etc.). **Nunca instales ni inventes un framework nuevo** si ya existe uno.
   - Ejecuta la suite completa de pruebas antes de empezar y después de tus validaciones.
5. **Criterio del Veredicto**:
   - **`pasa`**: Todos los criterios de aceptación se cumplen, las pruebas automatizadas pasan al 100%, no hay regresiones ni fallos de severidad Crítica o Mayor.
   - **`no_pasa`**: Cualquier criterio de aceptación no se cumple, hay regresiones funcionales, caídas no controladas (`unhandled exceptions`), o fallos de seguridad o corrupción de datos.

## 2. Índice de Guías Especializadas

Consulta la guía correspondiente según el tipo de prueba requerida:

- [Plan de Pruebas](references/plan-de-pruebas.md): Matriz de riesgos, alcance, tipos de prueba y estrategia de ejecución.
- [Casos de Prueba y Casos de Borde](references/casos-y-bordes.md): Técnicas de partición de equivalencia, valores límite y escenarios atípicos.
- [Pruebas de API](references/api.md): Validación de contratos REST/GraphQL, códigos HTTP, esquemas JSON y pruebas de carga básica.
- [E2E con Playwright](references/e2e-playwright.md): Automatización de flujos de usuario, selectores resilientes, capturas y aserciones visuales.
- [Unitarias por Stack](references/unitarias-por-stack.md): Comandos y patrones para Vitest/Jest, Pytest, JUnit, xUnit, PHPUnit y `go test`.
- [Accesibilidad Básica](references/accesibilidad.md): Verificación WCAG 2.1 AA, axe-core, contraste de colores y navegación por teclado.
- [Rendimiento Básico](references/rendimiento.md): Tiempos de respuesta, inspección de payloads, fugas de memoria y waterfalls.
- [Reporte de Fallos](references/reporte-de-fallos.md): Estructura de reporte con severidades, pasos exactos de reproducción y plantilla de entrega.

## 3. Checklist antes de Emitir tu Veredicto

Al usar la herramienta `entregar`, adjunta el reporte detallado con el siguiente formato:

- [ ] ¿Se verificaron todos los criterios de aceptación de la tarea uno por uno?
- [ ] ¿Se ejecutaron las pruebas automatizadas existentes del proyecto y quedaron en verde?
- [ ] ¿Se probaron casos de error y valores límite además del camino feliz?
- [ ] ¿Se verificó que los flujos anteriores no sufrieron regresiones?
- [ ] Si se reportan fallos, ¿se incluyeron pasos exactos de reproducción (1, 2, 3), comportamiento obtenido vs esperado y capturas/logs?
- [ ] ¿El veredicto final está claramente expresado como `pasa` o `no_pasa`?
