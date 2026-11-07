# Laravel Security

This reference defines security best practices for web applications and APIs built with the Laravel framework (PHP 8.2+).

---

## 1. Common Pitfalls and Vulnerabilities

- **Unrestricted Mass Assignment (`$guarded = []`)**: Leaving Eloquent models vulnerable to uncurated mass assignment via `User::create($request->all())`.
- **SQL Injection with `DB::raw()`**: Concatenating user input into `whereRaw`, `havingRaw`, or `orderByRaw` clauses.
- **XSS in Blade Templates (`{!! $variable !!}`)**: Using unescaped Blade tags `{!! !!}` with untrusted data instead of safe interpolation `{{ $variable }}`.
- **Unprotected API Routes**: Omitting `auth:sanctum` middleware on sensitive endpoints in `routes/api.php`.

---

## 2. Secure Laravel Configuration

- **Session Hardening (`config/session.php`)**:
  ```php
  'secure' => env('SESSION_SECURE_COOKIE', true),
  'http_only' => true,
  'same_site' => 'lax',
  ```
- **Strict Model Protection in `AppServiceProvider.php`**:
  ```php
  use Illuminate\Database\Eloquent\Model;

  public function boot(): void
  {
      // Throws exception if unwhitelisted attributes are mass-assigned
      Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
  }
  ```

---

## 3. Code Patterns: Insecure vs Secure

### A. Safe Eloquent Queries vs SQL Injection

**Insecure:**
```php
// INSECURE: SQL injection via $status or $order
$users = DB::table('users')
    ->whereRaw("status = '" . $request->input('status') . "'")
    ->orderByRaw($request->input('sort'))
    ->get();
```

**Secure:**
```php
// SECURE: Parameter binding for whereRaw and whitelist validation for sorting
$allowedSorts = ['name', 'created_at', 'email'];
$sortColumn = in_array($request->input('sort'), $allowedSorts, true) ? $request->input('sort') : 'created_at';

$users = DB::table('users')
    ->whereRaw('status = ?', [$request->input('status')])
    ->orderBy($sortColumn, 'asc')
    ->get();
```

---

### B. Form Requests and Mass Assignment Prevention

**Insecure:**
```php
public function store(Request $request)
{
    // INSECURE: client can pass role="admin" or balance=999999
    $user = User::create($request->all());
    return response()->json($user, 201);
}
```

**Secure (Form Request with validated attributes):**
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

// In controller:
public function store(StoreUserRequest $request)
{
    // SECURE: $request->validated() returns ONLY attributes defined in rules()
    $user = User::create($request->validated());
    return response()->json($user, 201);
}
```

---

## 4. Laravel Security Checklist

- [ ] `APP_DEBUG=false` in non-local environments.
- [ ] No `$guarded = []` in Eloquent models without strict Form Requests.
- [ ] No raw string concatenation in `DB::raw()` or `whereRaw()`.
- [ ] Blade templates use `{{ $var }}` (auto-escaped); `{!! $var !!}` is not used with untrusted inputs.
- [ ] Session cookies enforce `secure => true` and `http_only => true`.
- [ ] Private API routes are protected by `auth:sanctum`.
