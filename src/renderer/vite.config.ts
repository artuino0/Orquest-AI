// Solo para ver la oficina en el navegador sin abrir la app:
//   npx vite src/renderer   →   http://localhost:5173/demo.html
// La app se arma con electron.vite.config.ts, que no lee este archivo.
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({ plugins: [vue()] })
