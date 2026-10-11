// Arranque de la oficina de píxel. Primero quién da los datos, luego la oficina:
//   dentro de la app (?fuente=app)  → puente.js, que recibe el estudio real del panel
//   suelta en el navegador          → demo.js, una jornada de mentira
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/700.css'

const PARAMS = new URLSearchParams(location.search)
const enApp = PARAMS.get('fuente') === 'app'
// ?marco=0: la jornada de mentira sin encabezado ni lista de eventos, para incrustarla en la página web.
if (!enApp && PARAMS.get('marco') === '0') document.documentElement.classList.add('en-app')
if (enApp) await import('./puente.js')
else await import('./demo.js')
// La calle primero, para que ya esté escuchando cuando la oficina diga su escala y su hora.
if (enApp) await import('./calle.js')
await import('./app.js')
