---
name: orquest-clean-code
description: Clean code standards, safe refactoring, and delivery checklist for all roles that write code.
---

# Orquest Clean Code

This skill defines the software engineering standard for writing maintainable, readable, and secure code in any development task. Your goal is not to demonstrate theoretical virtuosity, but to leave the repository in better shape than you found it, with minimal, understandable, and verified changes.

## 1. Core Working Principles

1. **The existing repository rules**: Respect the architecture, naming conventions, directory structure, and formatting style already used by the project. Do not reformat entire files if your change only touches five lines.
2. **Intentional and precise names**:
   - Variables and properties must reveal intent and content (`activeUserCount`, not `n` or `data`).
   - Functions must start with verbs describing their action and side effect (`calculateInvoiceTotal`, `fetchUserProfile`).
   - Avoid cryptic abbreviations and redundant suffixes (`userList` or `users`, not `userArrayListData`).
3. **Small single-responsibility functions (SRP)**:
   - A function should do one thing and do it well.
   - If a function exceeds 25-30 lines or mixes abstraction levels (e.g., HTTP parsing + domain validation + SQL query), extract it into helper functions or dedicated services.
4. **SOLID with pragmatic judgment (avoid overengineering)**:
   - **S (Single Responsibility)**: Separate business logic from infrastructure and presentation.
   - **O (Open/Closed)**: Use polymorphism or composition when frequent variations are expected, but do not create speculative interfaces for classes that only have one implementation today.
   - **L (Liskov)**: Subclasses or implementations must not break preexisting contracts or throw unexpected exceptions.
   - **I (Interface Segregation)**: Prefer small, client-specific interfaces over bloated monolithic interfaces.
   - **D (Dependency Inversion)**: Inject dependencies to facilitate testing, but avoid unnecessary factories-of-factories (YAGNI).
5. **Explicit error handling**:
   - Never catch exceptions silently (`catch (e) {}` or `except: pass`).
   - If you catch an error, handle it, enrich it with useful context, or rethrow it.
   - Never expose internal error traces (`stack traces`) to the end client.
6. **Zero dead code and clean comments**:
   - Delete commented-out code, unused functions, and orphaned imports.
   - Comments must explain the **why** (business rationale, non-obvious technical constraint), never the **what** that the code already shows.
7. **Tests alongside the change**:
   - Every change in business logic or bug fix must include its corresponding test before delivery.
   - When fixing a bug, first write the test reproducing the failure, then write the fix that makes it pass.

## 2. Code Smell Detection and Safe Refactoring

- **God function / God class**: Extract private methods and group related behavior into independent classes or modules.
- **Primitive obsession**: If a group of primitives always travels together (e.g., `lat, lon`, `currency, amount`), create a dedicated Value Object or type.
- **Boolean flags**: If a function behaves completely differently based on a boolean parameter (`process(true)` vs `process(false)`), split it into two explicit functions (`processImmediately()` and `scheduleProcess()`).
- **Safe refactoring workflow**:
  1. Ensure existing tests pass.
  2. Make small, atomic changes (rename, extract method, move file).
  3. Run the test suite after each step. Never mix formatting refactors with behavioral changes in the same commit.

## 3. Reference Guides by Language

Consult the specific reference before editing code in the corresponding stack:

- [TypeScript and JavaScript](references/typescript-javascript.md): Strict typing, immutability, promises, and linters (ESLint, Prettier, Biome).
- [Python](references/python.md): PEP 8, type hints, exception handling, and tools (Ruff, Black, Mypy, Flake8).
- [Java](references/java.md): Java conventions, streams vs loops, Records, and linters (Checkstyle, Spotless).
- [C# (.NET)](references/csharp.md): C# conventions, nullable reference types, async/await, and tools (dotnet format, CSharpier).
- [PHP](references/php.md): PSR-12/PER, strict typing `declare(strict_types=1)`, error handling, and linters (PHP-CS-Fixer, Pint).
- [Go](references/go.md): Go idioms, error handling, implicit interfaces, and linters (gofmt, golangci-lint).

## 4. Final Checklist Before Delivery

Before calling the `entregar` tool, verify each point:

- [ ] Does the change solve the exact task without introducing out-of-scope modifications?
- [ ] Were preexisting project conventions and code formatting respected?
- [ ] Are there zero unused variables, commented-out code, console.logs, or debug prints?
- [ ] Are function and variable names descriptive and clear in English or the repo language?
- [ ] Are errors handled properly and safely without swallowed exceptions?
- [ ] Did project linters and formatters pass without warnings or errors?
- [ ] Were unit or integration tests added or updated to cover the changes?
- [ ] Do all project tests pass cleanly in the local environment?
