// Vista previa de los paneles en el navegador: la app entera con un estudio de mentira.
//   npx vite src/renderer   →   /preview.html                    con las CLIs de esta máquina
//                               /preview.html?caso=normal        con las del diseño
//                               /preview.html?caso=sin-agentes
import { installMock, RECENTS } from './mock'

const caso = new URLSearchParams(location.search).get('caso') ?? 'real'
installMock(caso)
localStorage.setItem('orquest.recents', JSON.stringify(RECENTS))

const { createApp } = await import('vue')
const { createPinia } = await import('pinia')
await import('@fontsource/jetbrains-mono/400.css')
await import('@fontsource/jetbrains-mono/700.css')
await import('@fontsource/pixelify-sans/700.css')
await import('./style.css')
const { default: App } = await import('./App.vue')
createApp(App).use(createPinia()).mount('#app')
