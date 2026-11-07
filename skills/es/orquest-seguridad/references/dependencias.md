# Gestión de Dependencias y Análisis de Composición de Software (SCA)

Esta referencia define las pautas para prevenir la introducción de paquetes maliciosos, vulnerabilidades conocidas (CVEs) y ataques a la cadena de suministro en las dependencias del proyecto.

---

## 1. Principales Amenazas en Dependencias

- **Typosquatting**: Paquetes maliciosos publicados en registros públicos con nombres casi idénticos a paquetes populares (ej. `cross-env` vs `crossenv`, `colorama` vs `colourama`).
- **Infección de Mantenimiento (Account Takeover / Malicious Releases)**: Cuentas de desarrolladores de librerías comprometidas que publican versiones menores con código espía o scripts de minería.
- **Inyección por Scripts de Instalación (`preinstall` / `postinstall`)**: Scripts automáticos ejecutados al correr `npm install` que extraen variables de entorno o archivos SSH locales.
- **Vulnerabilidades Conocidas no Parchadas**: Uso de versiones desactualizadas de librerías con vulnerabilidades críticas públicas catalogadas en la NVD / GitHub Advisory Database.

---

## 2. Buenas Prácticas de Mitigación

1. **Archivos Lock Obligatorios en el Repositorio**:
   - `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `Pipfile.lock`, `composer.lock`, `Cargo.lock`, `go.sum`.
   - El archivo lock congela las versiones exactas y los hashes de integridad criptográfica (SHA-512) de cada dependencia transitiva.
   - En CI/CD y entornos de producción, instala exclusivamente con comandos que respetan el lockfile sin alterarlo:
     - Node.js: `npm ci` o `pnpm install --frozen-lockfile`.
     - Python: `poetry install --no-root --sync` o `uv sync --locked`.
2. **Desactivación de Scripts de Instalación en dependencias no confiables**:
   ```bash
   npm install <paquete> --ignore-scripts
   ```
3. **Escaneo Automatizado de Dependencias (SCA)**:
   - **Node.js**:
     ```bash
     npm audit --audit-level=high
     # O si se usa pnpm:
     pnpm audit --audit-level=high
     ```
   - **Python**:
     ```bash
     pip-audit -r requirements.txt
     ```
   - **Escaneo unificado agnóstico (Google Open Source Vulnerabilities - OSV)**:
     ```bash
     osv-scanner -r .
     ```

---

## 3. Resolución Segura de Vulnerabilidades

Cuando `npm audit` o `pip-audit` detecta una vulnerabilidad:

1. **Prioridad por Severidad y Explotabilidad**:
   - Severidad Crítica o Alta con vector de explotación alcanzable en tu código: Requiere actualización inmediata.
   - Si la vulnerabilidad está en una dependencia de desarrollo (`devDependencies`) usada solo para testing local, el riesgo para el entorno de producción suele ser bajo, pero debe actualizarse en la siguiente iteración.
2. **Actualización Controlada**:
   - Nunca ejecutes `npm audit fix --force` a ciegas: puede introducir cambios de versión mayor (*breaking changes*) que rompan la aplicación.
   - Consulta el aviso oficial (Advisory) para identificar la versión mínima parchada y actualiza manualmente la librería directa que la introduce.

---

## 4. Checklist para Gestión de Dependencias

- [ ] El archivo de bloqueo (*lockfile*) está commiteado en el repositorio de control de versiones.
- [ ] Los pipelines de CI/CD utilizan comandos de instalación deterministas (`npm ci`, `uv sync --locked`).
- [ ] Se ejecutó el escáner de dependencias (`npm audit`, `pip-audit`, `osv-scanner`) sin vulnerabilidades críticas abiertas.
- [ ] Se verificó que los nombres de los nuevos paquetes agregados coinciden exactamente con la documentación oficial (sin typosquatting).
- [ ] No se instalan paquetes con bajo mantenimiento, sin repositorio público o con escasa comunidad sin previa auditoría de código.
