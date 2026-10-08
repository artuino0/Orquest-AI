import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import DemoOffice from './components/DemoOffice.vue'

createApp(DemoOffice).use(createPinia()).mount('#app')
