# Seguridad en Django

Esta referencia establece las directrices de seguridad para aplicaciones desarrolladas con el framework Django (Python).

---

## 1. Errores Típicos y Vulnerabilidades

- **`DEBUG = True` en Producción**: Expone trazas de depuración interactivas con variables de entorno, claves de base de datos y fragmentos de código fuente ante cualquier excepción no manejada.
- **`SECRET_KEY` hardcodeada o expuesta**: Permite forjar firmas criptográficas de sesiones, tokens de restablecimiento de contraseña y firmas de cookies.
- **Bypass de CSRF con `@csrf_exempt`**: Desactivar la protección CSRF en vistas que realizan cambios de estado (POST/PUT/DELETE) en lugar de enviar el token `X-CSRFToken`.
- **Inyección SQL con `extra()` o `.raw()`**: Concatenar cadenas directamente en métodos sin procesar del ORM.

---

## 2. Configuración Segura de `settings.py`

```python
import os
from pathlib import Path

# 1. Debug desactivado en producción
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() in ('true', '1')

# 2. Secret Key cargada desde el entorno
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

# 3. Hosts permitidos estrictos
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS', 'app.example.com').split(',')

# 4. Cookies de sesión seguras
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = False  # Debe ser legible por JS si se usa frontend SPA desacoplado

# 5. Cabeceras de seguridad y SSL
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 año
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# 6. Middleware esencial activo
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

## 3. Patrones de Código: Inseguro vs Seguro

### Consultas ORM seguras vs Inyección SQL

**Inseguro (Concatenación en raw SQL):**
```python
# Inseguro: si user_input es "' OR 1=1 --", retorna todos los usuarios
def search_users(user_input: str):
    return User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{user_input}'")
```

**Seguro (ORM nativo o SQL parametrizado):**
```python
def search_users(user_input: str):
    # Seguro: el ORM de Django parametriza automáticamente la consulta
    return User.objects.filter(username=user_input)

# O si raw() es estrictamente necesario, usar tupla de parámetros:
def search_users_raw(user_input: str):
    return User.objects.raw(
        "SELECT * FROM auth_user WHERE username = %s", 
        [user_input]
    )
```

---

## 4. Checklist para Django

- [ ] `DEBUG = False` verificado para entornos de staging y producción.
- [ ] `SECRET_KEY` se carga exclusivamente desde variables de entorno seguras.
- [ ] `CsrfViewMiddleware` está activo y no se utiliza `@csrf_exempt` en vistas transaccionales.
- [ ] `SECURE_SSL_REDIRECT = True` y cookies de sesión configuradas con `SECURE = True`.
- [ ] No se concatenan cadenas directas en `.extra()` o `.raw()`.
- [ ] Se ejecutó el comando de auditoría oficial de Django: `python manage.py check --deploy`.
