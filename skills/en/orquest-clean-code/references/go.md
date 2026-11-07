# Best Practices and Conventions: Go

This guide outlines clean code standards, idiomatic conventions, and verification tools for Go projects (1.21+).

---

## 1. Language Conventions and Idioms

- **Simplicity and Idiomatic Go**:
  - Follow the canonical guidelines from *Effective Go* and *Go Code Review Comments*.
  - Less is more: avoid unnecessary abstractions, complex type hierarchies, or alien patterns (do not port Java patterns into Go).
  - Accept interfaces, return structs. Interfaces should be small (1 to 3 methods) and defined by the consumer, not the producer package.
- **Naming**:
  - Concise naming: in short scopes, `i`, `r`, `w` are acceptable. In wider scopes, use descriptive names without redundancy (`user.Name`, not `user.UserName`).
  - `camelCase` for unexported identifiers and `PascalCase` for exported identifiers.
  - Acronyms remain all-caps (`userID`, `httpURL`, `apiServer`, not `userId` or `HttpUrl`).
- **Idiomatic Error Handling**:
  - In Go, errors are normal values, not exceptions.
  - Always check `if err != nil`. Never ignore errors with `_ = fn()`.
  - Wrap errors with context using `fmt.Errorf("action description: %w", err)`.
  - Do not use `panic` for standard control flow or predictable errors; reserve `panic` solely for unrecoverable startup failures.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Error Handling and Contextual Wrapping

**Incorrect (ignoring error or double logging and returning):**
```go
// Bad: ignores error or produces noisy double logs
func ReadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        log.Println("Error reading file:", err) // Duplicates logs if caller also logs
        return nil, err // Loses context regarding which file failed
    }
    // ...
    return cfg, nil
}
```

**Correct (wrapping with %w and keeping intermediate layers clean):**
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

### B. Goroutines, Concurrency, and Context Propagation

**Incorrect (orphaned goroutine / goroutine leak):**
```go
// Bad: if caller aborts, goroutine continues running indefinitely
func ProcessItems(items []string) {
    go func() {
        for _, item := range items {
            heavyDbWrite(item)
        }
    }()
}
```

**Correct (using `context.Context` and errgroup):**
```go
func ProcessItems(ctx context.Context, items []string) error {
    g, ctx := errgroup.WithContext(ctx)

    for _, item := range items {
        item := item // Avoids loop variable capture in pre-1.22 Go
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

### C. Small, Decoupled Interfaces

**Incorrect (giant Java-style interface):**
```go
// Bad: monolithic interface forcing mocks to implement 15 unused methods
type UserService interface {
    CreateUser()
    UpdateUser()
    DeleteUser()
    SendNotification()
    GenerateInvoice()
    ExportCsv()
}
```

**Correct (minimal, focused interface):**
```go
// Good: only requests what the consumer function actually needs
type UserFinder interface {
    FindUserByID(ctx context.Context, id string) (*User, error)
}

func NotifyUser(ctx context.Context, finder UserFinder, userID string) error {
    user, err := finder.FindUserByID(ctx, userID)
    if err != nil {
        return fmt.Errorf("find user for notification: %w", err)
    }
    // process...
    return nil
}
```

---

## 3. Reference Linters and Formatters

- **Standard Go Tools**:
  ```bash
  gofmt -s -w .
  go vet ./...
  golangci-lint run ./...
  go test -race -v ./...
  ```

---

## 4. Checklist for Go

- [ ] Ran `gofmt -s -w .` on all `.go` files.
- [ ] No errors ignored with `_`; all checked via `if err != nil`.
- [ ] Errors wrapped with context using `fmt.Errorf("...: %w", err)`.
- [ ] Blocking functions and external calls receive `ctx context.Context` as first parameter.
- [ ] `go test -race ./...` and `golangci-lint run` pass with zero warnings.
