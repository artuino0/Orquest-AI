# Buenas Prácticas y Convenciones: C# (.NET)

Esta guía define las directrices de código limpio, convenciones idiomáticas y herramientas para proyectos modernos en C# (.NET 8 / .NET 9).

---

## 1. Convenciones e Idiomas del Lenguaje

- **Nombres**:
  - `PascalCase` para nombres de clases, interfaces, métodos, propiedades, eventos y namespaces.
  - `camelCase` para variables locales y parámetros de métodos.
  - `_camelCase` (con guion bajo inicial) para campos privados (`private readonly ILogger _logger;`).
  - Las interfaces deben llevar el prefijo `I` (ej. `IUserRepository`, `IOrderProcessor`).
- **Características Modernas de C#**:
  - Habilita `<Nullable>enable</Nullable>` en el `.csproj` y respeta las advertencias de nulabilidad.
  - Usa `record` o `record struct` para DTOs, comandos y eventos inmutables.
  - Usa pattern matching moderno (`switch` expressions, guardas `when`, `is not null`).
  - Usa interpolación de cadenas `$"User: {user.Name}"` en lugar de concatenaciones o `string.Format`.
- **Asincronía Limpia**:
  - Todos los métodos asíncronos deben tener el sufijo `Async` (ej. `GetOrderByIdAsync`).
  - Pasa siempre `CancellationToken cancellationToken = default` en métodos asíncronos de I/O.
  - Evita `.Result` o `.Wait()`; bloquean subprocesos en el ThreadPool y generan deadlocks. Usa siempre `await`.

---

## 2. Patrones de Código: Incorrecto vs Correcto

### A. Tipos nulos, inmutabilidad y `record`

**Incorrecto (clase mutable sin protección de nulos):**
```csharp
// Mal: propiedades mutables públicas, no hay chequeo de nulos
public class CreateUserCommand
{
    public string Name { get; set; }
    public string Email { get; set; }
}
```

**Correcto (Record inmutable con validación posicional o init-only):**
```csharp
// Bien: inmutable, validado y compatible con semántica de valor
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

### B. Patrón Async/Await y cancelación

**Incorrecto (síncrono bloqueante o tragar cancelación):**
```csharp
// Mal: Task.Result puede congelar el hilo principal; no soporta cancelación
public User GetUser(string id)
{
    var task = _apiClient.FetchUserAsync(id);
    return task.Result; // PELIGRO: sync-over-async deadlock
}
```

**Correcto (completamente asíncrono con CancellationToken):**
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

### C. Pattern Matching y expresiones `switch`

**Incorrecto (secuencia anidada de if/else y castings manuales):**
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

**Correcto (Switch Expression idiomático y conciso):**
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

## 3. Linters y Formateadores de Referencia

- **Herramienta oficial `dotnet format`**:
  ```bash
  # Verificar advertencias de formato y estilo
  dotnet format --verify-no-changes --severity warn
  # Aplicar formato automáticamente
  dotnet format
  ```
- **CSharpier** (si está configurado en la solución):
  ```bash
  dotnet csharpier .
  ```
- **Compilación estricta y pruebas**:
  ```bash
  dotnet build --no-incremental --warnaserror
  dotnet test --logger "console;verbosity=normal"
  ```

---

## 4. Checklist para C# (.NET)

- [ ] La solución compila sin warnings de nulabilidad (`CS8600`, `CS8602`, `CS8618`).
- [ ] No se usa `.Result` ni `.Wait()`; todos los flujos I/O usan `await`.
- [ ] Los métodos `async` aceptan y propagan `CancellationToken`.
- [ ] Las dependencias se inyectan como interfaces en el constructor usando campos `private readonly`.
- [ ] Se ejecutó `dotnet test` y todas las pruebas pasaron.
