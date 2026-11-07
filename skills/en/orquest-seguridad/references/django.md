# Django Security

This reference defines security guidelines for web applications and APIs built with the Django framework (Python).

---

## 1. Common Pitfalls and Vulnerabilities

- **`DEBUG = True` in Production**: Exposes interactive tracebacks with environment variables, database passwords, and source code excerpts on unhandled exceptions.
- **Hardcoded or Exposed `SECRET_KEY`**: Enables attackers to forge cryptographic session signatures, password reset tokens, and signed cookie payloads.
- **Bypassing CSRF Protection with `@csrf_exempt`**: Disabling CSRF protection on state-changing endpoints (POST/PUT/DELETE) instead of properly passing `X-CSRFToken` headers.
- **SQL Injection via `extra()` or `.raw()`**: Concatenating unvalidated user inputs directly into raw ORM query methods.

---

## 2. Secure `settings.py` Configuration

```python
import os
from pathlib import Path

# 1. Debug disabled in production
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('true', '1')

# 2. Secret Key loaded from environment
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

# 3. Explicit allowed hosts
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'app.example.com').split(',')

# 4. Secure cookie configuration
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = False  # Set to False if client-side JS needs to read token for SPA

# 5. Security headers and SSL enforcement
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# 6. Essential security middleware active
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
```

---

## 3. Code Patterns: Insecure vs Secure

### Safe ORM Queries vs SQL Injection

**Insecure (Raw string concatenation):**
```python
# Insecure: if user_input is "' OR 1=1 --", dumps all users
def search_users(user_input: str):
    return User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{user_input}'")
```

**Secure (Native ORM or parameterized queries):**
```python
def search_users(user_input: str):
    # Secure: Django ORM parameterizes the query automatically
    return User.objects.filter(username=user_input)

# Or if raw() is strictly required, use bound parameters:
def search_users_raw(user_input: str):
    return User.objects.raw(
        "SELECT * FROM auth_user WHERE username = %s", 
        [user_input]
    )
```

---

## 4. Django Security Checklist

- [ ] `DEBUG = False` verified for staging and production environments.
- [ ] `SECRET_KEY` is loaded exclusively from environment variables.
- [ ] `CsrfViewMiddleware` is enabled and `@csrf_exempt` is not used on transactional routes.
- [ ] `SECURE_SSL_REDIRECT = True` and session cookies have `SECURE = True`.
- [ ] No string formatting or concatenation used in `.extra()` or `.raw()`.
- [ ] Run Django's deployment check: `python manage.py check --deploy`.
