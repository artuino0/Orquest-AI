# Best Practices and Conventions: C# (.NET)

This guide defines clean code guidelines, idiomatic conventions, and tooling for modern C# projects (.NET 8 / .NET 9).

---

## 1. Language Conventions and Idioms

- **Naming**:
  - `PascalCase` for classes, interfaces, methods, properties, events, and namespaces.
  - `camelCase` for local variables and method parameters.
  - `_camelCase` (leading underscore) for private fields (`private readonly ILogger _logger;`).
  - Interfaces must use the `I` prefix (e.g., `IUserRepository`, `IOrderProcessor`).
- **Modern C# Features**:
  - Enable `<Nullable>enable</Nullable>` in `.csproj` and resolve all nullability warnings.
  - Use `record` or `record struct` for immutable DTOs, commands, and events.
  - Use modern pattern matching (`switch` expressions, `when` guards, `is not null`).
  - Use string interpolation `$"User: {user.Name}"` instead of concatenation or `string.Format`.
- **Clean Asynchrony**:
  - Async methods must carry the `Async` suffix (e.g., `GetOrderByIdAsync`).
  - Always pass `CancellationToken cancellationToken = default` in async I/O operations.
  - Avoid `.Result` or `.Wait()`; they block threads on the ThreadPool and trigger deadlocks. Always use `await`.

---

## 2. Code Patterns: Incorrect vs Correct

### A. Nullable Types, Immutability, and `record`

**Incorrect (mutable class lacking null checks):**
```csharp
// Bad: public mutable properties, missing null safety
public class CreateUserCommand
{
    public string Name { get; set; }
    public string Email { get; set; }
}
```

**Correct (immutable Record with positional or init-only validation):**
```csharp
// Good: immutable, validated, value-based equality semantics
public record CreateUserCommand(string Name, string Email)
{
    public CreateUserCommand
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(Name);
        ArgumentException.ThrowIfNullOrWhiteSpace(Email);
        if (!Email.Contains('@'))
        {
            throw new ArgumentException("Email must contain '@'", nameof(Email));
        }
    }
}
```

---

### B. Async/Await Pattern and Cancellation

**Incorrect (blocking sync-over-async or swallowed cancellation):**
```csharp
// Bad: Task.Result can freeze the main thread; does not support cancellation
public User GetUser(string id)
{
    var task = _apiClient.FetchUserAsync(id);
    return task.Result; // HAZARD: sync-over-async deadlock
}
```

**Correct (fully asynchronous with CancellationToken):**
```csharp
public async Task<User> GetUserAsync(string id, CancellationToken cancellationToken = default)
{
    ArgumentException.ThrowIfNullOrWhiteSpace(id);

    try
    {
        var user = await _apiClient.FetchUserAsync(id, cancellationToken);
        return user ?? throw new UserNotFoundException($"User {id} not found");
    }
    catch (OperationCanceledException)
    {
        _logger.LogInformation("FetchUser operation was canceled for id: {UserId}", id);
        throw;
    }
}
```

---

### C. Pattern Matching and `switch` Expressions

**Incorrect (nested if/else chains and manual type casting):**
```csharp
public decimal CalculateDiscount(object customer)
{
    if (customer is VipCustomer)
    {
        var vip = (VipCustomer)customer;
        if (vip.YearsLoyalty > 5) return 0.20m;
        return 0.10m;
    }
    else if (customer is StandardCustomer)
    {
        return 0.05m;
    }
    return 0m;
}
```

**Correct (idiomatic and concise switch expression):**
```csharp
public decimal CalculateDiscount(object customer) => customer switch
{
    VipCustomer { YearsLoyalty: > 5 } => 0.20m,
    VipCustomer => 0.10m,
    StandardCustomer => 0.05m,
    null => throw new ArgumentNullException(nameof(customer)),
    _ => 0m
};
```

---

## 3. Reference Linters and Formatters

- **Official `dotnet format` tool**:
  ```bash
  dotnet format --verify-no-changes --severity warn
  dotnet format
  ```
- **CSharpier** (if configured in solution):
  ```bash
  dotnet csharpier .
  ```
- **Strict Build and Tests**:
  ```bash
  dotnet build --no-incremental --warnaserror
  dotnet test --logger "console;verbosity=normal"
  ```

---

## 4. Checklist for C# (.NET)

- [ ] Solution compiles with zero nullability warnings (`CS8600`, `CS8602`, `CS8618`).
- [ ] No `.Result` or `.Wait()`; all I/O paths use `await`.
- [ ] `async` methods accept and propagate `CancellationToken`.
- [ ] Dependencies are injected as constructor interfaces using `private readonly` fields.
- [ ] `dotnet test` was executed and all tests passed.
