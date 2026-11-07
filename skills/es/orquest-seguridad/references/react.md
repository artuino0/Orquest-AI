# Seguridad en React

Esta referencia define las normas para prevenir ataques del lado del cliente en aplicaciones desarrolladas con React.

---

## 1. Errores Típicos y Vulnerabilidades

- **Cross-Site Scripting (XSS) vía `dangerouslySetInnerHTML`**: Inyectar HTML proveniente del usuario sin sanitización adecuada con bibliotecas como DOMPurify.
- **Inyección en URLs (`javascript:` pseudo-protocol)**: Usar URLs no validadas en etiquetas `<a href={userUrl}>`. Si el usuario ingresa `javascript:stealToken()`, el navegador ejecuta el script.
- **Almacenamiento inseguro de tokens en `localStorage`**: Guardar JWTs en `localStorage` o `sessionStorage`, dejándolos expuestos a cualquier script malicioso o biblioteca comprometida en la página.
- **Fuga de Secretos en Variables de Entorno**: Exponer variables privadas en variables que inician con `REACT_APP_` o `VITE_`, las cuales se compilan directamente en el bundle JavaScript público.

---

## 2. Patrones de Código: Inseguro vs Seguro

### A. Renderizado de HTML y Prevención de XSS

**Inseguro:**
```jsx
// Inseguro: si comment.body contiene <img src=x onerror=fetch(...)>, se ejecuta XSS
function CommentView({ comment }) {
  return (
    <div className="comment">
      <div dangerouslySetInnerHTML={{ __html: comment.body }} />
    </div>
  );
}
```

**Seguro (Uso de DOMPurify con configuración restrictiva):**
```jsx
import DOMPurify from 'dompurify';

function CommentView({ comment }) {
  // Configuración estricta de etiquetas y atributos permitidos
  const cleanHtml = DOMPurify.sanitize(comment.body, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li'],
    ALLOWED_ATTR: ['href', 'title', 'target'],
    ALLOW_DATA_ATTR: false
  });

  return (
    <div className="comment">
      <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />
    </div>
  );
}
```

---

### B. Enlaces seguros y prevención de `javascript:` y Reverse Tabnabbing

**Inseguro:**
```jsx
// Inseguro: permite href="javascript:alert(1)" y no protege target="_blank"
function UserWebsite({ url }) {
  return <a href={url} target="_blank">Visitar sitio web</a>;
}
```

**Seguro:**
```jsx
function UserWebsite({ url }) {
  // Validar protocolo seguro explícitamente (http o https)
  const isSafeProtocol = /^https?:\/\//i.test(url);
  const safeUrl = isSafeProtocol ? url : '#';

  return (
    <a 
      href={safeUrl} 
      target="_blank" 
      rel="noopener noreferrer"
    >
      Visitar sitio web
    </a>
  );
}
```

---

## 3. Manejo Seguro de Tokens de Autenticación

- **Recomendado**: Configura la autenticación para utilizar cookies con las banderas `HttpOnly; Secure; SameSite=Strict`. De esta forma, JavaScript del navegador no puede leer la cookie y los ataques XSS no pueden exfiltrar la sesión.
- Si es estrictamente necesario almacenar el token en memoria, mantén el token de acceso en el estado de React (cierre o Context) y renóvalo mediante refresh tokens gestionados en cookies HttpOnly.

---

## 4. Checklist para React

- [ ] ¿No se utiliza `dangerouslySetInnerHTML` salvo que esté sanitizado con `DOMPurify`?
- [ ] ¿Todos los atributos `href` dinámicos validan que el esquema sea exclusivamente `http:` o `https:`?
- [ ] ¿Los enlaces con `target="_blank"` incluyen `rel="noopener noreferrer"`?
- [ ] ¿No existen llaves privadas o secretos de API en variables `REACT_APP_` o `VITE_`?
- [ ] ¿Los tokens de sesión se guardan en cookies `HttpOnly` y no en `localStorage`?
