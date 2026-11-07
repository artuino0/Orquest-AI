# Seguridad en Node.js

Esta referencia define las directrices de seguridad para aplicaciones y servicios sobre Node.js runtime.

---

## 1. Errores Típicos y Vulnerabilidades Comunes

- **Bloqueo del Event Loop (Denegación de Servicio)**: Operaciones criptográficas pesadas o JSON gigante en el hilo principal (`JSON.parse` de 50MB o expresiones regulares catastróficas ReDoS).
- **Inyección de Comandos (Command Injection)**: Invocar `child_process.exec()` concatenando entradas de usuario no sanitizadas.
- **Salto de Directorio (Path Traversal)**: Concatenar rutas de archivos con `path.join(__dirname, userInput)` permitiendo secuencias `../../etc/passwd`.
- **Polución de Prototipo (Prototype Pollution)**: Clonado o fusión profunda de objetos sin sanitizar claves como `__proto__` o `constructor.prototype`.

---

## 2. Configuración Segura del Runtime

- Ejecuta Node con restricciones estrictas de permisos si usas Node 20+:
  ```bash
  node --permission --allow-fs-read=/app/public --allow-fs-write=/app/tmp app.js
  ```
- No expongas encabezados de tecnología (`X-Powered-By: Node.js`).
- Escucha siempre en direcciones IP explícitas (`127.0.0.1` o `0.0.0.0` en contenedores), no en interfaces no controladas.

---

## 3. Patrones de Código: Inseguro vs Seguro

### A. Ejecución de comandos del sistema

**Inseguro (Inyección directa con `exec`):**
```javascript
const { exec } = require('child_process');

// Inseguro: si fileName es "; rm -rf / ;", se ejecuta el comando inyectado
function convertImage(fileName) {
  exec(`convert ${fileName} output.png`, (err, stdout) => {
    // ...
  });
}
```

**Seguro (Uso de `execFile` con argumentos separados):**
```javascript
const { execFile } = require('child_process');

// Seguro: execFile no invoca un shell (/bin/sh); los argumentos no se interpretan como comandos
function convertImage(fileName) {
  // Validación estricta de nombre de archivo (solo alfanumérico y extensiones seguras)
  if (!/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png)$/.test(fileName)) {
    throw new Error('Invalid file name');
  }

  execFile('convert', [fileName, 'output.png'], (err, stdout) => {
    if (err) throw err;
  });
}
```

---

### B. Prevención de Salto de Directorio (Path Traversal)

**Inseguro:**
```javascript
const fs = require('fs');
const path = require('path');

function getReport(userInput) {
  // userInput = "../../../../etc/passwd"
  const targetPath = path.join('/var/reports', userInput);
  return fs.readFileSync(targetPath, 'utf8');
}
```

**Seguro (Resolución canónica y verificación de prefijo):**
```javascript
const fs = require('fs');
const path = require('path');

const SAFE_BASE_DIR = path.resolve('/var/reports');

function getReport(userInput) {
  const safeFileName = path.basename(userInput);
  const resolvedPath = path.resolve(SAFE_BASE_DIR, safeFileName);

  // Asegura que la ruta final comience estrictamente dentro del directorio seguro
  if (!resolvedPath.startsWith(SAFE_BASE_DIR + path.sep)) {
    throw new Error('Access denied: path traversal detected');
  }

  return fs.readFileSync(resolvedPath, 'utf8');
}
```

---

## 4. Checklist para Node.js

- [ ] ¿No se utiliza `child_process.exec()` con entradas no confiables; se usa `execFile` con arrays de argumentos?
- [ ] ¿Las rutas de archivo se normalizan y verifican contra el directorio base seguro?
- [ ] ¿Las operaciones intensivas en CPU se delegan a `Worker Threads` para no bloquear el Event Loop?
- [ ] ¿Las expresiones regulares complejas están validadas contra ReDoS?
