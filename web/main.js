// Página de Orquest AI: la oficina en vivo, la calle, las descargas al día y las capturas ampliadas.
const REPO = 'artuino0/Orquest-AI'
const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches

// ── La oficina: el póster se queda hasta que el visitante la abre y termina de cargar.
const oficina = document.getElementById('oficina')
const abrir = document.getElementById('abrir-oficina')
abrir.addEventListener('click', () => {
  abrir.disabled = true
  abrir.lastChild.textContent = 'Abriendo…'
  oficina.addEventListener('load', () => {
    oficina.hidden = false
    abrir.remove()
  }, { once: true })
  oficina.src = oficina.dataset.src
})

// ── La calle. Posiciones en píxeles del arte (el CSS las escala); tiempos en ms.
// Los autos repiten cada 8 s: llegan a la cebra, esperan al peatón y siguen. El peatón
// cruza de ida en una vuelta y de regreso en la siguiente. Dos más recorren las aceras.
const calle = document.getElementById('calle')
const PASO = 130 // lo que dura cada cuadro al caminar o rodar
const tramo = (t, t0, t1, a, b) => a + ((b - a) * (t - t0)) / (t1 - t0)
const ACTORES = {
  azul: (t) => {
    const u = t % 8000
    if (u < 1000) return { y: tramo(u, 0, 1000, -34, 26), anda: true }
    if (u < 5000) return { y: 26 }
    if (u < 7000) return { y: tramo(u, 5000, 7000, 26, 200), anda: true }
    return { y: 200 }
  },
  taxi: (t) => {
    const u = t % 8000
    if (u < 1000) return { y: tramo(u, 0, 1000, 200, 76), anda: true }
    if (u < 5000) return { y: 76 }
    if (u < 7000) return { y: tramo(u, 5000, 7000, 76, -34), anda: true }
    return { y: -34 }
  },
  // Ya pasó la cebra: sale por abajo y vuelve a entrar por arriba detrás del azul.
  rojo: (t) => {
    const u = t % 8000
    if (u < 1500) return { y: tramo(u, 0, 1500, 146, 200), anda: true }
    if (u < 5800) return { y: 200 }
    return { y: tramo(u, 5800, 8000, -36, 146), anda: true }
  },
  cruza: (t) => {
    const u = t % 16000
    if (u < 1000) return { x: 10 }
    if (u < 5000) return { x: tramo(u, 1000, 5000, 10, 102), anda: true }
    if (u < 9000) return { x: 102, d: -1 }
    if (u < 13000) return { x: tramo(u, 9000, 13000, 102, 10), anda: true, d: -1 }
    return { x: 10 }
  },
  baja: (t) => ({ y: tramo(t % 14000, 0, 14000, -24, 192), anda: true }),
  sube: (t) => ({ y: tramo(t % 15000, 0, 15000, 192, -24), anda: true }),
}
const actores = [...calle.querySelectorAll('[data-actor]')].map((el) => ({ el, mover: ACTORES[el.dataset.actor], cuadros: el.classList.contains('f2') ? 2 : 4 }))

let inicio = 0
let enMarcha = 0
function pintarCalle(ahora) {
  const t = ahora - inicio
  for (const a of actores) {
    const p = a.mover(t)
    if (p.x !== undefined) a.el.style.setProperty('--x', p.x.toFixed(1))
    if (p.y !== undefined) a.el.style.setProperty('--y', p.y.toFixed(1))
    a.el.style.setProperty('--d', p.d ?? 1)
    a.el.style.setProperty('--i', p.anda ? Math.floor(t / PASO) % a.cuadros : 0)
  }
  enMarcha = requestAnimationFrame(pintarCalle)
}
// Arranca cuando la sección entra en pantalla y se pausa al salir. Con menos movimiento
// se queda como viene en la página: cada quien en su primer cuadro.
if (!QUIETO) {
  let pausa = 0
  new IntersectionObserver(([vista]) => {
    if (vista.isIntersecting && !enMarcha) {
      inicio += performance.now() - pausa
      enMarcha = requestAnimationFrame(pintarCalle)
    } else if (!vista.isIntersecting && enMarcha) {
      cancelAnimationFrame(enMarcha)
      enMarcha = 0
      pausa = performance.now()
    }
  }).observe(calle)
}

// ── Descargas: se resalta la del sistema del visitante y se apunta a la versión más nueva.
const SISTEMA = /Windows/i.test(navigator.userAgent) ? 'win' : /Mac/i.test(navigator.userAgent) ? 'mac' : /Linux|X11/i.test(navigator.userAgent) ? 'linux' : ''
document.querySelector(`.descarga[data-os="${SISTEMA}"]`)?.classList.add('tuyo')

const ARCHIVO = { win: /\.exe$/i, mac: /\.dmg$/i, linux: /\.AppImage$/i }
// Si GitHub no contesta, se quedan los enlaces fijos que ya trae la página.
fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`)
  .then((r) => (r.ok ? r.json() : []))
  .then((versiones) => {
    const ultima = versiones.find((v) => !v.draft && v.assets?.length)
    if (!ultima) return
    document.getElementById('version').textContent = ultima.tag_name
    for (const enlace of document.querySelectorAll('.descarga')) {
      const paquete = ultima.assets.find((a) => ARCHIVO[enlace.dataset.os].test(a.name))
      if (paquete) enlace.href = paquete.browser_download_url
    }
  })
  .catch(() => {})

// ── Capturas: clic para verlas grandes; clic o Escape para cerrar.
const cerrar = () => document.querySelector('.ampliada')?.remove()
for (const img of document.querySelectorAll('#incluye figure img')) {
  img.addEventListener('click', () => {
    const fondo = document.createElement('div')
    fondo.className = 'ampliada'
    fondo.append(Object.assign(new Image(), { src: img.src, alt: img.alt }))
    fondo.addEventListener('click', cerrar)
    document.body.append(fondo)
  })
}
addEventListener('keydown', (e) => e.key === 'Escape' && cerrar())
