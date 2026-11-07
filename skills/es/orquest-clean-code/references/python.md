# Buenas Prácticas y Convenciones: Python

Esta guía define las normas de código limpio, convenciones idiomáticas (PEP 8, PEP 484) y herramientas estándar para proyectos en Python moderno (3.10+).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Nombres (PEP 8)**:
  - `snake_case` para nombres de variables, funciones, métodos y módulos.
  - `PascalCase` para nombres de clases y tipos de excepciones.
  - `SCREAMING_SNAKE_CASE` para constantes a nivel de módulo.
  - Prefijo con guion bajo simple `_protected_member` para métodos y atributos de uso interno del módulo o clase.
- **Anotaciones de Tipo (Type Hints)**:
  - Todas las firmas de funciones públicas deben incluir tipos de argumentos y tipo de retorno (`def get_user(user_id: int) -> User | None:`).
  - Usa la sintaxis moderna de tipos nativos: `list[str]`, `dict[str, int]`, `int | None` (en lugar de importar `List`, `Dict`, `Optional` de `typing`).
- **Gestión de Recursos e Idiomas Pythonicos**:
  - Usa siempre administradores de contexto (`with open(...) as f:`) para archivos, conexiones y bloqueos.
  - Usa comprensiones de listas/diccionarios solo si son legibles (máximo una línea y una condición). Para lógica compleja, usa bucles tradicionales.
  - Usa `dataclasses` o `Pydantic` para objetos de transferencia de datos en vez de diccionarios planos sin tipar.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. Tipado, modelos estructurados y argumentos por defecto mutables

**Incorrecto (argumento mutable por defecto y uso de dict plano):**
```python
# Mal: mutable default argument retiene estado entre llamadas
# Mal: diccionarios sin esquema generan errores de clave a tiempo de ejecución
def register_student(name: str, grades: list = []):
    grades.append(0)
    return {"name": name, "grades": grades}
```

**Correcto (None como centinela y dataclass inmutable o tipada):**
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

### B. Manejo de excepciones específico vs atrapar todo

**Incorrecto (atrapar Exception o BaseException sin discriminar):**
```python
# Mal: enmascara errores tipográficos (NameError), KeyboardInterrupt y bugs de sintaxis
def parse_numeric_setting(config_map: dict, key: str):
    try:
        val = config_map[key]
        return int(val)
    except:
        return 0
```

**Correcto (excepciones específicas y encadenamiento con `from`):**
```python
class ConfigurationParsingError(ValueError):
    """Excepción cuando una clave de configuración no tiene formato numérico válido."""

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

### C. Funciones generadoras vs acumulación innecesaria en memoria

**Incorrecto (cargar millones de registros en memoria):**
```python
# Mal: desperdicia gigabytes de memoria RAM
def load_all_events(filepath: str) -> list[str]:
    lines = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("EVENT:"):
                lines.append(line.strip())
    return lines
```

**Correcto (evaluación perezosa con generadores `yield`):**
```python
from collections.abc import Iterator

def stream_events(filepath: str) -> Iterator[str]:
    with open(filepath, "r", encoding="utf-8") as file_handle:
        for line in file_handle:
            if line.startswith("EVENT:"):
                yield line.strip()
```

---

## 3. Linters y Formateadores de Referencia

Ejecuta las herramientas configuradas en el entorno antes de la entrega:

- **Ruff** (recomendado para proyectos modernos, reemplaza flake8, isort y black):
  ```bash
  # Verificación de linter
  ruff check .
  # Aplicar correcciones automáticas
  ruff check --fix .
  # Formato de código
  ruff format .
  ```
- **Black y Flake8 / isort** (si el repo los usa por separado):
  ```bash
  black --check .
  isort --check-only .
  flake8 .
  ```
- **Verificación estricta de tipos con Mypy**:
  ```bash
  mypy src/ tests/
  ```
- **Ejecutar pruebas con Pytest**:
  ```bash
  pytest -v --tb=short
  ```

---

## 4. Checklist para Python

- [ ] Las firmas de funciones públicas incluyen `type hints` explícitos.
- [ ] No existen argumentos por defecto mutables (`def fn(x=[])` o `def fn(x={})`).
- [ ] Todo bloque `except` captura excepciones precisas (`ValueError`, `KeyError`), nunca `except:` vacío.
- [ ] Los recursos de archivos y conexiones se abren dentro de bloques `with`.
- [ ] No hay código huérfano ni sentencias `print()` de depuración.
- [ ] `ruff check .` o `flake8 .` y `mypy` ejecutan sin errores.
