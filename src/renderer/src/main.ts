import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/pixelify-sans/700.css'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import { startLanguage } from './lang'

// El idioma primero: las pantallas se cargan ya sabiendo en cuál se escriben.
await startLanguage()
const { default: App } = await import('./App.vue')
createApp(App).use(createPinia()).mount('#app')
