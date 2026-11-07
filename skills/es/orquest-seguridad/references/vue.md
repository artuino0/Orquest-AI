# Seguridad en Vue.js

Esta referencia detalla las pautas de seguridad para aplicaciones web desarrolladas con Vue.js (versión 3).

---

## 1. Errores Típicos y Vulnerabilidades

- **Uso indiscriminado de `v-html`**: Inyectar cadenas sin sanitizar que provienen del usuario, permitiendo ejecución de XSS.
- **Inyección en directivas dinámicas**: Usar entradas de usuario no validadas en bindings de atributos sensibles (`<a :href="userProvidedUrl">`).
- **Exposición de datos reactivos sensibles**: Dejar objetos de configuración interna con secretos en el store global (Pinia / Vuex) accesible desde la consola del navegador (`window.__pinia`).

---

## 2. Patrones de Código: Inseguro vs Seguro

### A. Directiva `v-html` y Prevención de XSS

Por defecto, la interpolación de texto con doble llave `{{ userInput }}` en Vue escapa automáticamente todas las entidades HTML y es segura contra XSS. El peligro radica en `v-html`.

**Inseguro:**
```html
<template>
  <!-- Inseguro: permite ejecución directa de scripts inyectados -->
  <div class="user-bio" v-html="userBio" />
</template>
```

**Seguro (Uso de DOMPurify con lista blanca de etiquetas):**
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

### B. Validación de enlaces dinámicos (`:href`)

**Inseguro:**
```html
<!-- Inseguro: permite href="javascript:stealCookie()" -->
<a :href="externalLink" target="_blank">Enlace externo</a>
```

**Seguro:**
```html
<template>
  <a :href="safeLink" target="_blank" rel="noopener noreferrer">
    Enlace externo
  </a>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  externalLink: { type: String, required: true }
});

const safeLink = computed(() => {
  const url = props.externalLink.trim();
  // Solo se permiten esquemas HTTP y HTTPS explícitos
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return '#';
});
</script>
```

---

## 3. Checklist para Vue.js

- [ ] ¿Se evita el uso de `v-html` o se encuentra rigurosamente sanitizado con `DOMPurify`?
- [ ] ¿Los bindings `:href` dinámicos validan el esquema `https?://`?
- [ ] ¿Los enlaces con `target="_blank"` cuentan con `rel="noopener noreferrer"`?
- [ ] ¿No se exponen variables privadas en el archivo `.env` sin prefijo `VITE_`?
- [ ] ¿Los stores de Pinia no almacenan secretos o claves privadas de infraestructura?
