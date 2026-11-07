# Seguridad en Laravel

Esta referencia define las directrices de seguridad para aplicaciones web y APIs desarrolladas con el framework Laravel (PHP 8.2+).

---

## 1. Errores Típicos y Vulnerabilidades

- **Asignación Masiva sin Restricción (`$guarded = []`)**: Dejar modelos Eloquent completamente desprotegidos contra asignaciones masivas con `User::create($request->all())`.
- **Inyección SQL con `DB::raw()`**: Concatenar entradas de usuario directamente dentro de cláusulas `whereRaw`, `havingRaw` o `orderByRaw`.
- **XSS en Plantillas Blade (`{!! $variable !!}`)**: Usar la sintaxis de no escape de Blade `{!! !!}` con datos proporcionados por usuarios en lugar de la interpolación segura `{{ $variable }}`.
- **Rutas API sin Autenticación Sanctum/Passport**: Dejar endpoints sensibles en `routes/api.php` sin el middleware `auth:sanctum`.

---

## 2. Configuración Segura de Laravel

- **Configuración de sesión (`config/session.php`)**:
  ```php
  'secure' => env('SESSION_SECURE_COOKIE', true),
  'http_only' => true,
  'same_site' => 'lax',
  ```
- **Protección estricta de Eloquent en `AppServiceProvider.php`**:
  ```php
  use Illuminate\Database\Eloquent\Model;

  public function boot(): void
  {
      // Lanza excepción si se intenta asignar masivamente un campo no permitido
      Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
  }
  ```

---

## 3. Patrones de Código: Inseguro vs Seguro

### A. Consultas Eloquent Seguras vs Inyección SQL

**Inseguro:**
```php
// INSEGURO: Inyección SQL a través de $status o $order
$users = DB::table('users')
    ->whereRaw("status = '" . $request->input('status') . "'")
    ->orderByRaw($request->input('sort'))
    ->get();
```

**Seguro:**
```php
// SEGURO: Parámetros vinculados para whereRaw y lista blanca para ordenamiento
$allowedSorts = ['name', 'created_at', 'email'];
$sortColumn = in_array($request->input('sort'), $allowedSorts, true) ? $request->input('sort') : 'created_at';

$users = DB::table('users')
    ->whereRaw('status = ?', [$request->input('status')])
    ->orderBy($sortColumn, 'asc')
    ->get();
```

---

### B. Form Requests y Prevención de Asignación Masiva

**Inseguro:**
```php
public function store(Request $request)
{
    // INSEGURO: El usuario puede enviar role="admin" o balance=999999
    $user = User::create($request->all());
    return response()->json($user, 201);
}
```

**Seguro (Form Request con validación de campos permitidos):**
```php
// app/Http/Requests/StoreUserRequest.php
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'string', Password::defaults()],
        ];
    }
}

// En el controlador:
public function store(StoreUserRequest $request)
{
    // SEGURO: $request->validated() devuelve ÚNICAMENTE los campos definidos en rules()
    $user = User::create($request->validated());
    return response()->json($user, 201);
}
```

---

## 4. Checklist para Laravel

- [ ] `APP_DEBUG=false` en entornos no locales.
- [ ] No se usa `$guarded = []` en modelos Eloquent sin Form Requests estrictos.
- [ ] No se concatenan cadenas de usuario en `DB::raw()` ni `whereRaw()`.
- [ ] Blade usa `{{ $var }}` (con escape automático); no se usa `{!! $var !!}` con entradas no sanitizadas.
- [ ] Las cookies de sesión tienen `secure => true` y `http_only => true`.
- [ ] Los endpoints API privados están protegidos con `auth:sanctum`.
