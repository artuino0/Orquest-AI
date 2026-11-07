# Node.js Security

This reference defines security standards and defensive practices for applications and services running on Node.js.

---

## 1. Common Pitfalls and Vulnerabilities

- **Event Loop Blocking (Denial of Service)**: Heavy cryptographic operations or parsing massive JSON payloads directly on the main thread (50MB `JSON.parse` or catastrophic ReDoS regexes).
- **Command Injection**: Invoking `child_process.exec()` while concatenating unvalidated user inputs.
- **Path Traversal**: Concatenating file system paths via `path.join(__dirname, userInput)` allowing `../../etc/passwd` directory traversal.
- **Prototype Pollution**: Deep object cloning or recursive merging without sanitizing keys like `__proto__` or `constructor.prototype`.

---

## 2. Secure Runtime Configuration

- Execute Node with strict permission controls when running Node 20+:
  ```bash
  node --permission --allow-fs-read=/app/public --allow-fs-write=/app/tmp app.js
  ```
- Disable technology fingerprinting (`X-Powered-By: Node.js`).
- Bind servers to explicit local or internal IP addresses (`127.0.0.1` or `0.0.0.0` in containers), never open untrusted network interfaces.

---

## 3. Code Patterns: Insecure vs Secure

### A. System Command Execution

**Insecure (Direct shell injection with `exec`):**
```javascript
const { exec } = require('child_process');

// Insecure: if fileName is "; rm -rf / ;", injected shell commands execute
function convertImage(fileName) {
  exec(`convert ${fileName} output.png`, (err, stdout) => {
    // ...
  });
}
```

**Secure (Using `execFile` with separate arguments array):**
```javascript
const { execFile } = require('child_process');

// Secure: execFile does not invoke /bin/sh; arguments are passed as discrete data
function convertImage(fileName) {
  // Strict filename validation (alphanumeric and valid extension only)
  if (!/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png)$/.test(fileName)) {
    throw new Error('Invalid file name');
  }

  execFile('convert', [fileName, 'output.png'], (err, stdout) => {
    if (err) throw err;
  });
}
```

---

### B. Path Traversal Prevention

**Insecure:**
```javascript
const fs = require('fs');
const path = require('path');

function getReport(userInput) {
  // userInput = "../../../../etc/passwd"
  const targetPath = path.join('/var/reports', userInput);
  return fs.readFileSync(targetPath, 'utf8');
}
```

**Secure (Canonical resolution and base directory verification):**
```javascript
const fs = require('fs');
const path = require('path');

const SAFE_BASE_DIR = path.resolve('/var/reports');

function getReport(userInput) {
  const safeFileName = path.basename(userInput);
  const resolvedPath = path.resolve(SAFE_BASE_DIR, safeFileName);

  // Guarantee that the resolved path strictly starts with the safe directory
  if (!resolvedPath.startsWith(SAFE_BASE_DIR + path.sep)) {
    throw new Error('Access denied: path traversal detected');
  }

  return fs.readFileSync(resolvedPath, 'utf8');
}
```

---

## 4. Node.js Security Checklist

- [ ] `child_process.exec()` is not used with untrusted inputs; `execFile` with argument arrays is used.
- [ ] File system paths are canonicalized and verified against an allowed base directory.
- [ ] CPU-heavy tasks are offloaded to `Worker Threads` to avoid blocking the Event Loop.
- [ ] Regular expressions are vetted against ReDoS vulnerabilities.
