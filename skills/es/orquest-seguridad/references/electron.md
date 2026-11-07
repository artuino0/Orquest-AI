# Seguridad en Aplicaciones de Escritorio con Electron

Esta referencia define las directrices críticas de aislamiento y privilegios mínimos para aplicaciones de escritorio desarrolladas con Electron.

---

## 1. Errores Críticos y Vectores de Explotación

- **`nodeIntegration: true` en el Renderer**: Permitir que el proceso de renderizado (Chromium) acceda directamente a las APIs de Node.js (`fs`, `child_process`). Si el frontend sufre un ataque XSS, el atacante obtiene ejecución remota de código (RCE) inmediata en la máquina del usuario.
- **`contextIsolation: false`**: Permitir que los scripts del sitio web compartan el prototipo global con los scripts de precarga (`preload.js`), posibilitando la sobrescritura de APIs y el escape del sandbox.
- **`sandbox: false`**: Desactivar el sandbox del proceso Chromium, permitiendo acceso directo a llamadas del sistema operativo.
- **Navegación sin restricción**: Permitir que la ventana de Electron navegue hacia URLs externas no confiables o abra ventanas emergentes arbitrarias (`window.open`).

---

## 2. Configuración Segura de `BrowserWindow`

```javascript
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 1. Aislamiento estricto de contexto (OBLIGATORIO)
      contextIsolation: true,
      // 2. Desactivar Node.js en la ventana web (OBLIGATORIO)
      nodeIntegration: false,
      // 3. Activar el sandbox de Chromium (OBLIGATORIO)
      sandbox: true,
      // 4. Script de precarga seguro
      preload: path.join(__dirname, 'preload.js'),
      // 5. Desactivar webview y ejecución remota no segura
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // 6. Bloquear navegación no autorizada fuera del origen de la app
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    // Solo permitir navegación interna o esquema local seguro
    if (parsedUrl.origin !== 'http://localhost:3000' && parsedUrl.protocol !== 'file:') {
      event.preventDefault();
      console.warn(`Blocked untrusted navigation to: ${navigationUrl}`);
    }
  });

  // 7. Abrir enlaces externos en el navegador por defecto del sistema, nunca dentro de Electron
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

## 3. Patrones de Comunicación IPC Seguros (`contextBridge`)

**Inseguro (`preload.js` exponiendo `ipcRenderer` completo):**
```javascript
// PELIGROSO: expone todo ipcRenderer; cualquier XSS puede enviar cualquier mensaje interno
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipcRenderer // ¡NUNCA HAGAS ESTO!
});
```

**Seguro (`preload.js` exponiendo únicamente métodos y canales explícitos):**
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
      // Filtrar el evento interno de Electron para no exponer el emisor
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    } else {
      console.error(`Invalid IPC receive channel: ${channel}`);
    }
  },
  // Invocaciones request/response tipadas seguras
  getSystemStatus: () => ipcRenderer.invoke('get-system-status')
});
```

---

## 4. Checklist para Electron

- [ ] `nodeIntegration: false` en todos los `BrowserWindow`.
- [ ] `contextIsolation: true` y `sandbox: true` activos.
- [ ] No se expone `ipcRenderer` completo en `contextBridge`; solo canales estrictos validados.
- [ ] Los eventos `will-navigate` y `setWindowOpenHandler` interceptan y cancelan navegación a sitios externos no autorizados.
- [ ] Los enlaces web externos se abren exclusivamente con `shell.openExternal()` tras validar el protocolo `https:`.
