---
name: orquest-clean-code
description: Estándares de código limpio, refactorización segura y checklist de entrega para todos los roles que escriben código.
---

# Orquest Clean Code

Esta skill define el estándar de ingeniería de software para escribir código mantenible, legible y seguro en cualquier tarea de desarrollo. Tu objetivo no es demostrar virtuosismo teórico, sino dejar el repositorio en mejor estado del que lo encontraste, con cambios mínimos, comprensibles y verificados.

## 1. Principios fundamentales de trabajo

1. **El repositorio existente manda**: Respeta la arquitectura, convenciones de nombres, estructura de carpetas y estilo de formato que ya utiliza el proyecto. No reformatees archivos enteros si tu cambio solo toca cinco líneas.
2. **Nombres intencionales y precisos**:
   - Variables y propiedades deben revelar intención y contenido (`activeUserCount`, no `n` o `data`).
   - Funciones deben comenzar con verbos que describan su acción y efecto colateral (`calculateInvoiceTotal`, `fetchUserProfile`).
   - Evita abreviaturas crípticas y sufijos redundantes (`userList` o `users`, no `userArrayListData`).
3. **Funciones pequeñas y de una sola responsabilidad (SRP)**:
   - Una función debe hacer una sola cosa y hacerla bien.
   - Si una función supera 25-30 líneas o mezcla niveles de abstracción (p. ej., parseo HTTP + validación de dominio + consulta SQL), extráela en funciones auxiliares o servicios específicos.
4. **SOLID con criterio práctico (evita la sobreingeniería)**:
   - **S (Single Responsibility)**: Separa lógica de negocio de infraestructura y presentación.
   - **O (Open/Closed)**: Usa polimorfismo o composición cuando haya variaciones frecuentes esperadas, pero no crees interfaces especulativas para clases que solo tienen una implementación hoy.
   - **L (Liskov)**: Las subclases o implementaciones no deben alterar contratos preexistentes ni lanzar excepciones inesperadas.
   - **I (Interface Segregation)**: Prefiere interfaces pequeñas y específicas antes que interfaces monolíticas.
   - **D (Dependency Inversion)**: Inyecta dependencias para facilitar testing, pero evita fábricas de fábricas innecesarias (YAGNI).
5. **Manejo explícito de errores**:
   - Nunca captures excepciones en silencio (`catch (e) {}` o `except: pass`).
   - Si capturas un error, manéjalo, enriquécelo con contexto útil o relánzalo.
   - No expongas trazas de error internas (`stack traces`) al cliente final.
6. **Cero código muerto y comentarios limpios**:
   - Elimina código comentado, funciones no invocadas e imports huérfanos.
   - Los comentarios deben explicar el **por qué** (razón de negocio, restricción técnica no obvia), nunca el **qué** que el código ya dice.
7. **Pruebas junto al cambio**:
   - Todo cambio en lógica de negocio o corrección de bugs debe incluir su prueba correspondiente antes de entregarse.
   - Si corriges un bug, escribe primero la prueba que reproduce el fallo y luego la solución que la hace pasar.

## 2. Detección de olores (Code Smells) y refactor seguro

- **Función gigante / Clase dios**: Extrae métodos privados y agrupa comportamiento afín en clases o módulos independientes.
- **Obsesión primitiva**: Si un grupo de primitivos viaja siempre junto (p. ej. `lat, lon`, `currency, amount`), crea un objeto de valor (Value Object) o tipo dedicado.
- **Parámetros bandera (Boolean Flags)**: Si una función hace dos cosas distintas según un booleano (`process(true)` vs `process(false)`), divídela en dos funciones explícitas (`processImmediately()` y `scheduleProcess()`).
- **Refactor seguro**:
  1. Asegura que las pruebas existentes pasen.
  2. Haz cambios pequeños y atómicos (renombrar, extraer método, mover archivo).
  3. Ejecuta la suite de pruebas tras cada paso. Nunca mezcles refactorización estética con cambio de comportamiento en el mismo commit.

## 3. Índice de guías por lenguaje

Consulta la referencia específica antes de editar código en el stack correspondiente:

- [TypeScript y JavaScript](references/typescript-javascript.md): Tipado estricto, inmutabilidad, promesas y linters (ESLint, Prettier, Biome).
- [Python](references/python.md): PEP 8, type hints, manejo de excepciones y herramientas (Ruff, Black, Mypy, Flake8).
- [Java](references/java.md): Convenciones Java, streams vs bucles, Records, Lombok y linters (Checkstyle, Spotless).
- [C# (.NET)](references/csharp.md): Convenciones C#, nullable reference types, async/await y herramientas (dotnet format, CSharpier).
- [PHP](references/php.md): PSR-12/PER, tipado estricto `declare(strict_types=1)`, manejo de errores y linters (PHP-CS-Fixer, Pint).
- [Go](references/go.md): Idiomas de Go, gestión de errores idiomática, interfaces implícitas y linters (gofmt, golangci-lint).

## 4. Checklist final antes de entregar

Antes de invocar la herramienta `entregar`, valida cada punto:

- [ ] ¿El cambio resuelve exactamente la tarea sin agregar modificaciones fuera de alcance?
- [ ] ¿Se respetaron las convenciones y el formato de código preexistente en el proyecto?
- [ ] ¿No hay variables no usadas, código comentado, console.log o prints de depuración?
- [ ] ¿Los nombres de funciones y variables son descriptivos y claros en inglés o en el idioma del repo?
- [ ] ¿Los errores se manejan de forma adecuada y segura sin tragarse excepciones?
- [ ] ¿Se ejecutó el linter y formateador del proyecto sin advertencias ni errores?
- [ ] ¿Se añadieron o actualizaron pruebas para cubrir los cambios realizados?
- [ ] ¿Todas las pruebas del proyecto pasan exitosamente en el entorno local?
