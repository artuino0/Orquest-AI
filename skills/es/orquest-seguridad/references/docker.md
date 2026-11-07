# Seguridad en Contenedores Docker

Esta referencia establece las directrices para construir, configurar y ejecutar imágenes de contenedores Docker de forma segura.

---

## 1. Errores Críticos y Riesgos de Contenedores

- **Ejecución como usuario `root`**: El contenedor corre como UID 0. Si un atacante escapa del contenedor o accede al host vía montajes de volumen (`docker.sock`), obtiene control total de la máquina anfitriona.
- **Inclusión de Secretos en capas de imagen (`ADD`/`COPY`/`ENV`)**: Dejar tokens, archivos `.env` o llaves SSH en la imagen. Aunque se borren en un `RUN rm secret.txt` posterior, el secreto permanece en el historial de capas de Docker.
- **Uso de imágenes base desactualizadas o con vulnerabilidades**: Utilizar `:latest` o imágenes pesadas no mantenidas que arrastran cientos de CVEs críticos.
- **Montaje del socket de Docker (`/var/run/docker.sock`)**: Otorgar permisos equivalentes a `root` en el host a cualquier contenedor que monte el socket.

---

## 2. Dockerfile Seguro Multi-Etapa (Multi-Stage Build)

Ejemplo de producción para una aplicación Node.js / TypeScript:

```dockerfile
# ------------------------------------------------------------------------------
# Etapa 1: Construcción (Builder)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Instalar dependencias con verificación de lockfile
COPY package*.json ./
RUN npm ci

# Compilar código fuente
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Eliminar dependencias de desarrollo
RUN npm prune --production

# ------------------------------------------------------------------------------
# Etapa 2: Imagen Final de Producción (Mínima y Segura)
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# 1. Definir entorno de producción
ENV NODE_ENV=production

# 2. Crear un usuario sin privilegios explícito (UID/GID no-root)
RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

# 3. Copiar únicamente los artefactos necesarios desde la etapa de compilación
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

# 4. Cambiar al usuario sin privilegios
USER appuser

# 5. Puerto no privilegiado (> 1024)
EXPOSE 3000

# 6. Ejecutar directamente con node sin envolver en shell sh/bash
CMD ["node", "dist/main.js"]
```

---

## 3. Escaneo de Vulnerabilidades con Trivy

Escanea la imagen construida antes de publicarla a cualquier registro:

```bash
# Escaneo de vulnerabilidades en el filesystem del proyecto
trivy fs --severity HIGH,CRITICAL .

# Escaneo de la imagen Docker construida
docker build -t mi-app:v1 .
trivy image --severity HIGH,CRITICAL --exit-code 1 mi-app:v1
```

---

## 4. Checklist para Docker

- [ ] El contenedor se ejecuta como un usuario no-root (`USER appuser` con UID > 1000).
- [ ] Se utiliza compilación multi-etapa (*multi-stage build*) para no incluir herramientas de compilación en la imagen final.
- [ ] No existen archivos `.env`, credenciales ni claves SSH en ninguna capa del Dockerfile.
- [ ] El sistema de archivos raíz puede montarse en solo lectura (`--read-only`) con almacenamiento temporal en `tmpfs`.
- [ ] No se monta `/var/run/docker.sock` en ningún contenedor de aplicación.
- [ ] Se escanea la imagen con `trivy` y no presenta vulnerabilidades de severidad Alta o Crítica.
