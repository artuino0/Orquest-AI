# Seguridad en Flask

Esta referencia establece las directrices de seguridad para aplicaciones web y microservicios desarrollados con Flask (Python).

---

## 1. Errores Típicos y Vulnerabilidades

- **Inyección de Plantillas del Servidor (SSTI - Server-Side Template Injection)**: Usar `render_template_string()` concatenando entradas de usuario sin escapar, permitiendo ejecución de código arbitrario vía Jinja2 (`{{ config.__class__... }}`).
- **Sesiones no seguras (Client-side signed cookies)**: Por omisión, Flask almacena las sesiones en cookies firmadas pero no cifradas. El cliente puede leer todo su contenido si contiene datos confidenciales.
- **Falta de protección CSRF**: Flask nativo no incluye protección CSRF de forma automática; debe añadirse explícitamente con `Flask-WTF` o `Flask-SeaSurf`.

---

## 2. Configuración Segura de Flask

```python
import os
from flask import Flask
from flask_talisman import Talisman
from flask_wtf.csrf import CSRFProtect

app = Flask(__name__)

# 1. Secret Key robusta desde variables de entorno
app.config['SECRET_KEY'] = os.environ['FLASK_SECRET_KEY']

# 2. Cookies de sesión seguras
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 30 minutos

# 3. Límite de tamaño máximo de petición (prevenir DoS por subida masiva)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024  # 2 Megabytes

# 4. Protección CSRF global
csrf = CSRFProtect(app)

# 5. Cabeceras HTTP de seguridad con Talisman
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

## 3. Patrones de Código: Inseguro vs Seguro

### Prevención de SSTI (Server-Side Template Injection)

**Inseguro (Concatenación directa en `render_template_string`):**
```python
from flask import render_template_string, request

# INSEGURO: si user_name es "{{ 7 * 7 }}", Jinja2 lo evalúa a 49 (RCE potencial)
@app.route('/greet')
def greet():
    name = request.args.get('name', 'Guest')
    template = f"<h1>Hello, {name}!</h1>"
    return render_template_string(template)
```

**Seguro (Pasar datos como contexto de Jinja2 o usar plantillas de archivo):**
```python
from flask import render_template, request

# SEGURO: Jinja2 escapa automáticamente el contexto contra XSS y no evalúa código
@app.route('/greet')
def greet():
    name = request.args.get('name', 'Guest')
    return render_template('greet.html', name=name)
```

En `templates/greet.html`:
```html
<!DOCTYPE html>
<html>
<body>
  <!-- Jinja2 escapa 'name' por defecto -->
  <h1>Hello, {{ name }}!</h1>
</body>
</html>
```

---

## 4. Checklist para Flask

- [ ] `SECRET_KEY` es aleatoria, de alta entropía y se inyecta por variable de entorno.
- [ ] `SESSION_COOKIE_HTTPONLY = True` y `SESSION_COOKIE_SECURE = True` están activos.
- [ ] `CSRFProtect` está activo en todas las rutas con métodos `POST`, `PUT`, `DELETE`.
- [ ] No se utiliza `render_template_string` con entradas no confiables concatenadas.
- [ ] `MAX_CONTENT_LENGTH` restringe el tamaño máximo del cuerpo de las peticiones.
