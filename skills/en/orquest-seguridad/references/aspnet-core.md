# ASP.NET Core Security

This reference defines security best practices for web applications and APIs developed with ASP.NET Core (.NET 8 / 9).

---

## 1. Common Pitfalls and Vulnerabilities

- **Overposting / Mass Assignment**: Binding database entity classes directly into action parameters, allowing clients to modify protected fields like `IsAdmin` or `TenantId`.
- **SQL Injection with `FromSqlRaw`**: Concatenating user inputs into `FromSqlRaw` instead of using bound parameters or `FromSqlInterpolated`.
- **Missing Antiforgery Tokens in Razor Pages/MVC**: Forgetting `[ValidateAntiForgeryToken]` or misconfiguring SameSite cookie policies.
- **Open Redirects**: Redirecting to `returnUrl` parameters without validating them with `Url.IsLocalUrl()`.

---

## 2. Secure Configuration in `Program.cs`

```csharp
var builder = WebApplication.CreateBuilder(args);

// 1. Force HSTS and HTTPS Redirection
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

// 2. Hardened Antiforgery settings
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

// 3. Security headers middleware
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

## 3. Code Patterns: Insecure vs Secure

### A. Preventing SQL Injection in Entity Framework Core

**Insecure:**
```csharp
// INSECURE: direct string interpolation in FromSqlRaw does not bind SQL parameters
var user = await _context.Users
    .FromSqlRaw($"SELECT * FROM Users WHERE Email = '{userInput}'")
    .FirstOrDefaultAsync();
```

**Secure:**
```csharp
// SECURE: FromSqlInterpolated automatically parameterizes query values
var user = await _context.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {userInput}")
    .FirstOrDefaultAsync();
```

---

### B. Preventing Overposting via Dedicated DTOs

**Insecure (Direct domain model binding):**
```csharp
// INSECURE: attacker can pass { "Name": "Alice", "IsSuperAdmin": true }
[HttpPost]
public async Task<IActionResult> UpdateUser(User user)
{
    _context.Update(user);
    await _context.SaveChangesAsync();
    return Ok();
}
```

**Secure (Explicit request DTO):**
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

## 4. ASP.NET Core Security Checklist

- [ ] Action endpoints bind dedicated input DTOs, avoiding overposting.
- [ ] No string interpolation in `FromSqlRaw`; `FromSqlInterpolated` or LINQ used.
- [ ] External redirects validate with `Url.IsLocalUrl(returnUrl)`.
- [ ] HSTS, X-Frame-Options, and CSP response headers configured.
- [ ] State-mutating Razor/MVC actions protected by `[ValidateAntiForgeryToken]`.
