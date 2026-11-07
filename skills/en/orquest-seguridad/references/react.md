# React Security

This reference defines defensive practices to prevent client-side vulnerabilities in React applications.

---

## 1. Common Pitfalls and Vulnerabilities

- **Cross-Site Scripting (XSS) via `dangerouslySetInnerHTML`**: Injecting untrusted HTML without proper DOMPurify sanitization.
- **URL Injections (`javascript:` pseudo-protocol)**: Dynamic user inputs bound directly into `<a href={userUrl}>`.
- **Insecure Token Storage in `localStorage`**: Storing authentication tokens in `localStorage` or `sessionStorage` where any XSS attack can access them.
- **Secret Leaks in Environment Variables**: Storing server API secrets in client-facing variables prefixed with `REACT_APP_` or `VITE_`.

---

## 2. Code Patterns: Insecure vs Secure

### A. HTML Rendering and XSS Prevention

**Insecure:**
```jsx
// Insecure: allows malicious payloads like <img src=x onerror=fetch(...)>
function CommentView({ comment }) {
  return (
    <div className="comment">
      <div dangerouslySetInnerHTML={{ __html: comment.body }} />
    </div>
  );
}
```

**Secure (Sanitized with DOMPurify):**
```jsx
import DOMPurify from 'dompurify';

function CommentView({ comment }) {
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

### B. Secure Anchor Links and Reverse Tabnabbing

**Insecure:**
```jsx
// Insecure: permits href="javascript:alert(1)" and lacks reverse tabnabbing defense
function UserWebsite({ url }) {
  return <a href={url} target="_blank">Visit Website</a>;
}
```

**Secure:**
```jsx
function UserWebsite({ url }) {
  // Validate protocol strictly
  const isSafeProtocol = /^https?:\/\//i.test(url);
  const safeUrl = isSafeProtocol ? url : '#';

  return (
    <a 
      href={safeUrl} 
      target="_blank" 
      rel="noopener noreferrer"
    >
      Visit Website
    </a>
  );
}
```

---

## 3. Secure Token Storage

- **Recommended**: Store session and authentication tokens in `HttpOnly; Secure; SameSite=Strict` cookies. In this architecture, client-side JavaScript cannot read the cookie, neutralizing token theft via XSS.
- If in-memory tokens are required, keep access tokens strictly in React state or context and refresh them using HttpOnly cookie-based refresh tokens.

---

## 4. React Security Checklist

- [ ] `dangerouslySetInnerHTML` is avoided or strictly sanitized with `DOMPurify`.
- [ ] Dynamic `href` attributes validate protocol schemes (`https?://`).
- [ ] Anchor tags with `target="_blank"` include `rel="noopener noreferrer"`.
- [ ] No server-side private keys or secrets are stored in `REACT_APP_` or `VITE_` variables.
- [ ] Session tokens are kept in `HttpOnly` cookies rather than `localStorage`.
