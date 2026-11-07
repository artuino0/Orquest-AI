# Docker Container Security

This reference outlines standards for building, configuring, and running secure Docker container images.

---

## 1. Critical Pitfalls and Container Risks

- **Running as `root` (UID 0)**: If a container breakout occurs or host volume mounts (`docker.sock`) are compromised, the attacker acquires root access over the host machine.
- **Baking Secrets into Image Layers (`ADD`/`COPY`/`ENV`)**: Leaving API keys, `.env` files, or SSH keys in container layers. Even if deleted in a subsequent `RUN rm` layer, the secret remains accessible in image layer history.
- **Using Outdated or Bloated Base Images**: Pulling `:latest` or unmaintained base images containing known high-severity CVEs.
- **Mounting Docker Daemon Socket (`/var/run/docker.sock`)**: Granting full root equivalence on the host to any container that mounts the socket.

---

## 2. Hardened Multi-Stage Dockerfile

Production example for a Node.js / TypeScript service:

```dockerfile
# ------------------------------------------------------------------------------
# Stage 1: Build Environment
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies using verified lockfile
COPY package*.json ./
RUN npm ci

# Compile TypeScript source
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune development dependencies
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Hardened Minimal Production Runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 1. Create dedicated non-root user and group
RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

# 2. Copy only compiled build artifacts
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

# 3. Switch to unprivileged user
USER appuser

# 4. Expose unprivileged port (> 1024)
EXPOSE 3000

# 5. Run binary directly without invoking a shell wrapper
CMD ["node", "dist/main.js"]
```

---

## 3. Vulnerability Scanning with Trivy

Scan container images prior to publishing to registries:

```bash
# Scan repository filesystem
trivy fs --severity HIGH,CRITICAL .

# Scan built Docker image
docker build -t my-app:v1 .
trivy image --severity HIGH,CRITICAL --exit-code 1 my-app:v1
```

---

## 4. Docker Security Checklist

- [ ] Container runs as an explicit non-root user (`USER appuser` with UID > 1000).
- [ ] Multi-stage builds are used to exclude build toolchains from production images.
- [ ] No `.env` files, private keys, or credentials exist in image layers.
- [ ] Root filesystem can mount as read-only (`--read-only`) with `/tmp` on `tmpfs`.
- [ ] `/var/run/docker.sock` is never mounted into application containers.
- [ ] Image scanned with `trivy` with zero High or Critical vulnerabilities.
