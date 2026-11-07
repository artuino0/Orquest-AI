# Dependency Management and Software Composition Analysis (SCA)

This reference defines standards to prevent malicious packages, known vulnerabilities (CVEs), and software supply chain compromises in project dependencies.

---

## 1. Primary Threats in Dependencies

- **Typosquatting**: Malicious packages published to public registries with names closely mirroring legitimate libraries (e.g., `cross-env` vs `crossenv`, `colorama` vs `colourama`).
- **Account Takeover / Malicious Releases**: Hijacked maintainer credentials used to publish minor versions containing cryptominers or credential stealers.
- **Malicious Install Scripts (`preinstall` / `postinstall`)**: Automated scripts executed during `npm install` designed to exfiltrate local environment variables or SSH keys.
- **Unpatched Known Vulnerabilities**: Running outdated library versions with known critical vulnerabilities tracked in the NVD / GitHub Advisory Database.

---

## 2. Supply Chain Mitigation Practices

1. **Mandatory Lockfiles in Version Control**:
   - `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `Pipfile.lock`, `composer.lock`, `Cargo.lock`, `go.sum`.
   - Lockfiles pin exact versions and cryptographic integrity hashes (SHA-512) for all direct and transitive dependencies.
   - In CI/CD and production builds, install dependencies strictly via immutable commands:
     - Node.js: `npm ci` or `pnpm install --frozen-lockfile`.
     - Python: `poetry install --no-root --sync` or `uv sync --locked`.
2. **Disabling Install Scripts on Untrusted Packages**:
   ```bash
   npm install <package> --ignore-scripts
   ```
3. **Automated Dependency Auditing (SCA)**:
   - **Node.js**:
     ```bash
     npm audit --audit-level=high
     pnpm audit --audit-level=high
     ```
   - **Python**:
     ```bash
     pip-audit -r requirements.txt
     ```
   - **Universal Scanner (Google OSV-Scanner)**:
     ```bash
     osv-scanner -r .
     ```

---

## 3. Remediating Vulnerabilities Safely

When `npm audit` or `pip-audit` reports vulnerabilities:

1. **Assess Severity and Reachability**:
   - High or Critical vulnerabilities in code paths directly reachable from external requests require immediate patching.
   - Development-only vulnerabilities in build tooling (`devDependencies`) present lower production risk, but should be patched systematically.
2. **Controlled Updates**:
   - Avoid running `npm audit fix --force` blindly; it can introduce breaking major version upgrades.
   - Consult the official security advisory to identify the minimum patched version and upgrade the direct dependency manually.

---

## 4. Dependency Management Checklist

- [ ] Lockfiles are committed to version control.
- [ ] CI/CD pipelines use deterministic install commands (`npm ci`, `uv sync --locked`).
- [ ] Dependency scanners (`npm audit`, `pip-audit`, `osv-scanner`) report zero open Critical issues.
- [ ] New packages are verified against official documentation to prevent typosquatting.
- [ ] Packages with low maintenance activity or negligible adoption are audited prior to inclusion.
