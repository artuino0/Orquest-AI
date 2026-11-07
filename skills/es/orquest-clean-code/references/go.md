# Buenas Prácticas y Convenciones: Go

Esta guía describe los estándares de código limpio, convenciones idiomáticas y herramientas de verificación para proyectos en Go (1.21+).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Simplicidad e Idiomas de Go**:
  - Sigue las guías canónicas de *Effective Go* y *Go Code Review Comments*.
  - En Go, menos es más: evita abstracciones innecesarias, jerarquías complejas y patrones de diseño ajenos (no traslades patrones de Java a Go).
  - Acepta interfaces, retorna structs (`Accept interfaces, return structs`). Las interfaces deben ser pequeñas (de 1 a 3 métodos) y declararse en el paquete consumidor, no en el productor.
- **Nombres**:
  - Nombres concisos: si una variable tiene un alcance de dos líneas, `i`, `r`, `w` son aceptables. Si el alcance es amplio, usa nombres descriptivos pero sin redundancia (`user.Name`, no `user.UserName`).
  - `camelCase` para identificadores privados (no exportados) y `PascalCase` para identificadores públicos (exportados).
  - Siglas y acrónimos mantienen mayúsculas completas (`userID`, `httpURL`, `apiServer`, no `userId` o `HttpUrl`).
- **Manejo de Errores Idiomático**:
  - En Go los errores son valores normales, no excepciones.
  - Verifica siempre `if err != nil`. Nunca descartes un error con `_ = fn()`.
  - Envuelve errores añadiendo contexto con `fmt.Errorf("action description: %w", err)`.
  - No uses `panic` para control de flujo ni errores previsibles; `panic` solo se reserva para fallos de arranque irrecuperables.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. Manejo de errores y envoltorio con contexto

**Incorrecto (ignorar error o loguear y retornar al mismo tiempo):**
```go
// Mal: ignora el error o hace doble reporte
func ReadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        log.Println("Error reading file:", err) // Duplica logs si el llamador también loguea
        return nil, err // Pierde el contexto de qué archivo falló
    }
    // ...
    return cfg, nil
}
```

**Correcto (envoltorio con %w y sin ruido de logging intermedio):**
```go
func ReadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("read config file at %s: %w", path, err)
    }

    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("parse config json: %w", err)
    }

    return &cfg, nil
}
```

---

### B. Goroutines, concurrencia y propagación de Context

**Incorrecto (goroutine huérfana sin cancelación / goroutine leak):**
```go
// Mal: si el cliente aborta la petición, la goroutine sigue corriendo indefinidamente
func ProcessItems(items []string) {
    go func() {
        for _, item := range items {
            heavyDbWrite(item)
        }
    }()
}
```

**Correcto (uso de `context.Context` y `sync.WaitGroup` o errgroup):**
```go
func ProcessItems(ctx context.Context, items []string) error {
    g, ctx := errgroup.WithContext(ctx)

    for _, item := range items {
        item := item // Evita captura de variable de iteración en versiones anteriores a Go 1.22
        g.Go(func() error {
            select {
            case <-ctx.Done():
                return ctx.Err()
            default:
                return heavyDbWriteWithContext(ctx, item)
            }
        })
    }

    if err := g.Wait(); err != nil {
        return fmt.Errorf("process items failed: %w", err)
    }

    return nil
}
```

---

### C. Interfaces pequeñas y desacopladas

**Incorrecto (interfaz gigante estilo Java):**
```go
// Mal: interface monstruosa que obliga a implementar 15 métodos para un mock
type UserService interface {
    CreateUser()
    UpdateUser()
    DeleteUser()
    SendNotification()
    GenerateInvoice()
    ExportCsv()
}
```

**Correcto (interfaz mínima y focalizada):**
```go
// Bien: solo pide lo que la función necesita consumir
type UserFinder interface {
    FindUserByID(ctx context.Context, id string) (*User, error)
}

func NotifyUser(ctx context.Context, finder UserFinder, userID string) error {
    user, err := finder.FindUserByID(ctx, userID)
    if err != nil {
        return fmt.Errorf("find user for notification: %w", err)
    }
    // procesar...
    return nil
}
```

---

## 3. Linters y Formateadores de Referencia

- **Herramientas estándar de Go**:
  ```bash
  # Formato oficial obligatorio
  gofmt -s -w .
  # Linter básico oficial
  go vet ./...
  # Verificación estricta con golangci-lint
  golangci-lint run ./...
  # Ejecución de pruebas con detector de carreras (race detector)
  go test -race -v ./...
  ```

---

## 4. Checklist para Go

- [ ] Se ejecutó `gofmt -s -w .` en todos los archivos `.go`.
- [ ] No hay errores ignorados con `_`; todos se comprueban con `if err != nil`.
- [ ] Los errores se contextualizan usando `fmt.Errorf("...: %w", err)`.
- [ ] Las funciones bloqueantes y llamadas remotas reciben `ctx context.Context` como primer parámetro.
- [ ] `go test -race ./...` y `golangci-lint run` pasan sin advertencias.
