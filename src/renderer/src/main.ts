import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@xterm/xterm/css/xterm.css'
import './style.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
