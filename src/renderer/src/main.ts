import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/pixelify-sans/700.css'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
