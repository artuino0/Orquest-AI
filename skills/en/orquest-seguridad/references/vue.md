# Vue.js Security

This reference outlines security standards for client-side applications built with Vue.js (version 3).

---

## 1. Common Pitfalls and Vulnerabilities

- **Indiscriminate Use of `v-html`**: Binding untrusted user-supplied strings directly into `v-html`, resulting in XSS vulnerabilities.
- **Injections in Dynamic Directives**: Passing unvalidated user input to dynamic attribute bindings (`<a :href="userProvidedUrl">`).
- **Sensitive State Leaks**: Storing internal API tokens, credentials, or private state in global Pinia stores accessible via browser developer consoles (`window.__pinia`).

---

## 2. Code Patterns: Insecure vs Secure

### A. The `v-html` Directive and XSS Prevention

By default, template interpolation `{{ userInput }}` in Vue automatically escapes HTML entities and is safe from XSS. The security risk arises when using `v-html`.

**Insecure:**
```html
<template>
  <!-- Insecure: executes injected script tags and event handlers -->
  <div class="user-bio" v-html="userBio" />
</template>
```

**Secure (Sanitizing with DOMPurify):**
```html
<template>
  <div class="user-bio" v-html="sanitizedBio" />
</template>

<script setup>
import { computed } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps({
  userBio: { type: String, required: true }
});

const sanitizedBio = computed(() => {
  return DOMPurify.sanitize(props.userBio, {
    ALLOWED_TAGS: ['b', 'i', 'strong', 'em', 'p', 'br'],
    ALLOWED_ATTR: []
  });
});
</script>
```

---

### B. Validating Dynamic `:href` Bindings

**Insecure:**
```html
<!-- Insecure: allows href="javascript:stealToken()" -->
<a :href="externalLink" target="_blank">External Link</a>
```

**Secure:**
```html
<template>
  <a :href="safeLink" target="_blank" rel="noopener noreferrer">
    External Link
  </a>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  externalLink: { type: String, required: true }
});

const safeLink = computed(() => {
  const url = props.externalLink.trim();
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return '#';
});
</script>
```

---

## 3. Vue.js Security Checklist

- [ ] `v-html` is avoided or strictly sanitized with `DOMPurify`.
- [ ] Dynamic `:href` bindings enforce `https?://` protocols.
- [ ] Links with `target="_blank"` include `rel="noopener noreferrer"`.
- [ ] No server-side secrets are exposed without the `VITE_` prefix convention.
- [ ] Pinia stores do not hold infrastructure credentials or private encryption keys.
