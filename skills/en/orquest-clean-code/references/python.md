# Best Practices and Conventions: Python

This guide defines clean code standards, idiomatic conventions (PEP 8, PEP 484), and standard tools for modern Python (3.10+).

---

## 1. Language Conventions and Idioms

- **Naming (PEP 8)**:
  - `snake_case` for variables, functions, methods, and modules.
  - `PascalCase` for classes and exception types.
  - `SCREAMING_SNAKE_CASE` for module-level constants.
  - Single leading underscore `_protected_member` for internal module/class members.
- **Type Annotations (Type Hints)**:
  - All public function signatures must include parameter and return types (`def get_user(user_id: int) -> User | None:`).
  - Use modern built-in type syntax: `list[str]`, `dict[str, int]`, `int | None` (avoid importing `List`, `Dict`, `Optional` from `typing`).
- **Resource Management and Pythonic Idioms**:
  - Always use context managers (`with open(...) as f:`) for files, connections, and locks.
  - Use list/dict comprehensions only when readable (single line and condition). For complex logic, use standard loops.
  - Use `dataclasses` or `Pydantic` for data transfer objects instead of untyped raw dicts.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Typing, Structured Models, and Mutable Default Arguments

**Incorrect (mutable default argument and raw untyped dict):**
```python
# Bad: mutable default argument retains state between calls
# Bad: schemaless dicts cause runtime KeyError exceptions
def register_student(name: str, grades: list = []):
    grades.append(0)
    return {"name": name, "grades": grades}
```

**Correct (None as sentinel and immutable or typed dataclass):**
```python
from dataclasses import dataclass, field

@dataclass(frozen=True)
class StudentRecord:
    name: str
    grades: list[int] = field(default_factory=list)

def register_student(name: str, grades: list[int] | None = None) -> StudentRecord:
    initial_grades = list(grades) if grades is not None else [0]
    return StudentRecord(name=name, grades=initial_grades)
```

---

### B. Specific Exception Handling vs Catch-All

**Incorrect (catching Exception or BaseException indiscriminately):**
```python
# Bad: masks typos (NameError), KeyboardInterrupt, and syntax bugs
def parse_numeric_setting(config_map: dict, key: str):
    try:
        val = config_map[key]
        return int(val)
    except:
        return 0
```

**Correct (specific exceptions and chaining with `from`):**
```python
class ConfigurationParsingError(ValueError):
    """Exception raised when a configuration key lacks valid integer format."""

def parse_numeric_setting(config_map: dict[str, str], key: str, default: int = 0) -> int:
    if key not in config_map:
        return default
    
    raw_val = config_map[key]
    try:
        return int(raw_val)
    except ValueError as exc:
        raise ConfigurationParsingError(
            f"Config key '{key}' has invalid integer value '{raw_val}'"
        ) from exc
```

---

### C. Generator Functions vs Unnecessary In-Memory Accumulation

**Incorrect (loading millions of records into RAM):**
```python
# Bad: wastes gigabytes of memory
def load_all_events(filepath: str) -> list[str]:
    lines = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("EVENT:"):
                lines.append(line.strip())
    return lines
```

**Correct (lazy evaluation with `yield` generators):**
```python
from collections.abc import Iterator

def stream_events(filepath: str) -> Iterator[str]:
    with open(filepath, "r", encoding="utf-8") as file_handle:
        for line in file_handle:
            if line.startswith("EVENT:"):
                yield line.strip()
```

---

## 3. Reference Linters and Formatters

Run project tools before submitting code:

- **Ruff** (recommended for modern Python, replaces flake8, isort, and black):
  ```bash
  # Check for linter issues
  ruff check .
  # Auto-fix issues
  ruff check --fix .
  # Format code
  ruff format .
  ```
- **Black and Flake8 / isort** (if used separately):
  ```bash
  black --check .
  isort --check-only .
  flake8 .
  ```
- **Type Checking with Mypy**:
  ```bash
  mypy src/ tests/
  ```
- **Run Tests with Pytest**:
  ```bash
  pytest -v --tb=short
  ```

---

## 4. Checklist for Python

- [ ] Public function signatures include explicit `type hints`.
- [ ] No mutable default arguments (`def fn(x=[])` or `def fn(x={})`).
- [ ] Every `except` block catches specific exceptions (`ValueError`, `KeyError`), never bare `except:`.
- [ ] File and connection resources are managed in `with` blocks.
- [ ] Zero orphaned code or debugging `print()` statements.
- [ ] `ruff check .` or `flake8 .` and `mypy` pass without errors.
