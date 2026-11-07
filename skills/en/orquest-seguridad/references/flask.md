# Flask Security

This reference defines security standards for web applications and microservices built with Flask (Python).

---

## 1. Common Pitfalls and Vulnerabilities

- **Server-Side Template Injection (SSTI)**: Using `render_template_string()` while concatenating unescaped user input, enabling Remote Code Execution via Jinja2 (`{{ config.__class__... }}`).
- **Insecure Client-Side Signed Sessions**: By default, Flask stores session state in client cookies that are cryptographically signed but unencrypted. Anyone with the cookie can view its plaintext contents.
- **Missing CSRF Protection**: Core Flask does not enforce CSRF protection automatically; it must be added via `Flask-WTF` or `Flask-SeaSurf`.

---

## 2. Secure Flask Configuration

```python
import os
from flask import Flask
from flask_talisman import Talisman
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)

# 1. High-entropy Secret Key loaded from environment
app.config['SECRET_KEY'] = os.environ['FLASK_SECRET_KEY']

# 2. Hardened session cookies
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 30 minutes

# 3. Maximum request payload size (prevention of memory DoS)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024  # 2 Megabytes

# 4. Global CSRF protection
csrf = CSRFProtect(app)

# 5. Security headers and HTTPS enforcement with Talisman
Talisman(
    app,
    content_security_policy={
        'default-src': "'self'",
        'script-src': "'self'",
        'style-src': ["'self'", "'unsafe-inline'"],
    },
    force_https=True
)
```

---

## 3. Code Patterns: Insecure vs Secure

### SSTI Prevention (Server-Side Template Injection)

**Insecure (Direct string concatenation into `render_template_string`):**
```python
from flask import render_template_string, request

# INSECURE: if user_name is "{{ 7 * 7 }}", Jinja2 evaluates to 49 (Potential RCE)
@app.route('/greet')
def greet():
    name = request.args.get('name', 'Guest')
    template = f"<h1>Hello, {name}!</h1>"
    return render_template_string(template)
```

**Secure (Passing variables as Jinja2 template context):**
```python
from flask import render_template, request

# SECURE: Jinja2 escapes variables automatically and prevents code evaluation
@app.route('/greet')
def greet():
    name = request.args.get('name', 'Guest')
    return render_template('greet.html', name=name)
```

In `templates/greet.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <!-- Jinja2 automatically escapes 'name' -->
  <h1>Hello, {{ name }}!</h1>
</body>
</html>
```

---

## 4. Flask Security Checklist

- [ ] `SECRET_KEY` is loaded from high-entropy environment variables.
- [ ] `SESSION_COOKIE_HTTPONLY = True` and `SESSION_COOKIE_SECURE = True` are active.
- [ ] `CSRFProtect` is active across all state-mutating HTTP methods (`POST`, `PUT`, `DELETE`).
- [ ] `render_template_string` is never used with concatenated user inputs.
- [ ] `MAX_CONTENT_LENGTH` restricts incoming request payload sizes.
