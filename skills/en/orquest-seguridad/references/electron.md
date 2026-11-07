# Security in Electron Desktop Applications

This reference defines critical isolation standards and least-privilege configurations for desktop applications built with Electron.

---

## 1. Critical Pitfalls and Exploitation Vectors

- **`nodeIntegration: true` in the Renderer**: Allowing Chromium web pages to invoke Node.js APIs directly (`fs`, `child_process`). If the frontend suffers any XSS flaw, the attacker gains instant Remote Code Execution (RCE) on the user's workstation.
- **`contextIsolation: false`**: Allowing web scripts to share the global window prototype with `preload.js` scripts, enabling prototype pollution and sandbox escape.
- **`sandbox: false`**: Disabling the Chromium renderer process sandbox, permitting direct OS system calls.
- **Unrestricted Navigation**: Permitting the Electron window to navigate to untrusted external URLs or open arbitrary popups (`window.open`).

---

## 2. Secure `BrowserWindow` Configuration

```javascript
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 1. Strict Context Isolation (MANDATORY)
      contextIsolation: true,
      // 2. Disable Node.js in web context (MANDATORY)
      nodeIntegration: false,
      // 3. Enable Chromium sandbox (MANDATORY)
      sandbox: true,
      // 4. Secure preload script
      preload: path.join(__dirname, 'preload.js'),
      // 5. Disable webviews and insecure remote features
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // 6. Block untrusted navigation outside the application origin
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      console.warn(`Blocked untrusted navigation to: ${navigationUrl}`);
    }
  });

  // 7. Open external links in default OS browser, never inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    if (['https:', 'http:'].includes(parsedUrl.protocol)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.loadFile('index.html');
}
```

---

## 3. Secure IPC Communication (`contextBridge`)

**Insecure (`preload.js` exposing raw `ipcRenderer`):**
```javascript
// DANGEROUS: exposes all IPC channels; any XSS can send arbitrary internal messages
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipcRenderer // NEVER DO THIS
});
```

**Secure (`preload.js` exposing explicit, validated channels):**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

const VALID_SEND_CHANNELS = ['request-app-version', 'save-document'];
const VALID_RECEIVE_CHANNELS = ['app-version-reply', 'document-saved'];

contextBridge.exposeInMainWorld('api', {
  send: (channel, data) => {
    if (VALID_SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.error(`Invalid IPC send channel: ${channel}`);
    }
  },
  receive: (channel, callback) => {
    if (VALID_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      console.error(`Invalid IPC receive channel: ${channel}`);
    }
  },
  getSystemStatus: () => ipcRenderer.invoke('get-system-status')
});
```

---

## 4. Electron Security Checklist

- [ ] `nodeIntegration: false` in all `BrowserWindow` instances.
- [ ] `contextIsolation: true` and `sandbox: true` enabled.
- [ ] Raw `ipcRenderer` is never exposed directly in `contextBridge`.
- [ ] `will-navigate` and `setWindowOpenHandler` intercept unauthorized external navigation.
- [ ] External web links open strictly via `shell.openExternal()` after protocol checks.
