# Seguridad en ASP.NET Core

Esta referencia define las directrices de seguridad para aplicaciones web y APIs desarrolladas en ASP.NET Core (.NET 8 / 9).

---

## 1. Errores Típicos y Vulnerabilidades

- **Overposting / Asignación Masiva**: Vincular modelos de base de datos directamente como parámetros de acción en controladores, permitiendo modificar campos como `IsAdmin` o `TenantId`.
- **Inyección SQL con `FromSqlRaw`**: Concatenar cadenas interpoladas directamente en `FromSqlRaw` en lugar de usar parámetros vinculados o `FromSqlInterpolated`.
- **Falta de Validación Antiforgery en Razor Pages o MVC**: Omitir `[ValidateAntiForgeryToken]` o no configurar adecuadamente cookies SameSite.
- **Redirección Abierta (Open Redirect)**: Redirigir a `returnUrl` sin validar que sea una URL local (`Url.IsLocalUrl()`).

---

## 2. Configuración Segura en `Program.cs`

```csharp
var builder = WebApplication.CreateBuilder(args);

// 1. Forzar HSTS y redirección HTTPS
builder.Services.AddHsts(options =>
{
    options.Preload = true;
    options.IncludeSubDomains = true;
    options.MaxAge = TimeSpan.FromDays(365);
});

builder.Services.AddHttpsRedirection(options =>
{
    options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;
    options.HttpsPort = 443;
});

// 2. Antiforgery seguro
builder.Services.AddAntiforgery(options =>
{
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();

// 3. Encabezados de seguridad con middleware
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Append("Content-Security-Policy", "default-src 'self'");
    await next();
});

app.UseAuthentication();
app.UseAuthorization();
```

---

## 3. Patrones de Código: Inseguro vs Seguro

### A. Prevención de Inyección SQL en Entity Framework Core

**Inseguro:**
```csharp
// INSEGURO: interpolación directa en FromSqlRaw no crea parámetros SQL
var user = await _context.Users
    .FromSqlRaw($"SELECT * FROM Users WHERE Email = '{userInput}'")
    .FirstOrDefaultAsync();
```

**Seguro:**
```csharp
// SEGURO: FromSqlInterpolated parametriza de forma automática y segura
var user = await _context.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {userInput}")
    .FirstOrDefaultAsync();
```

---

### B. Prevención de Overposting mediante DTOs

**Inseguro (Vincular entidad de dominio directamente):**
```csharp
// INSEGURO: un atacante puede enviar { "Name": "Alice", "IsSuperAdmin": true }
[HttpPost]
public async Task<IActionResult> UpdateUser(User user)
{
    _context.Update(user);
    await _context.SaveChangesAsync();
    return Ok();
}
```

**Seguro (DTO específico con campos permitidos):**
```csharp
public record UpdateUserRequest(
    [Required, StringLength(100)] string Name,
    [EmailAddress] string Email
);

[HttpPost]
public async Task<IActionResult> UpdateUser([FromBody] UpdateUserRequest request, [FromServices] ICurrentUser currentUser)
{
    var user = await _context.Users.FindAsync(currentUser.Id);
    if (user is null) return NotFound();

    user.Name = request.Name;
    user.Email = request.Email;

    await _context.SaveChangesAsync();
    return NoContent();
}
```

---

## 4. Checklist para ASP.NET Core

- [ ] Se utilizan DTOs dedicados para endpoints de entrada, evitando overposting.
- [ ] No se usa interpolación directa en `FromSqlRaw`; se usa `FromSqlInterpolated` o LINQ puro.
- [ ] Las redirecciones externas validan `Url.IsLocalUrl(returnUrl)`.
- [ ] Las cabeceras HSTS, X-Frame-Options y CSP están configuradas.
- [ ] Las operaciones que cambian estado en Razor/MVC usan `[ValidateAntiForgeryToken]`.
