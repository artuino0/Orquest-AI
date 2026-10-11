// Página de Orquest AI: la oficina en vivo, las descargas al día y las capturas ampliadas.
const REPO = 'artuino0/Orquest-AI'

// ── La oficina de demostración: se carga cuando se acerca a la vista (pesa y se anima sola).
// Quien pidió menos movimiento la abre con el botón.
const oficina = document.getElementById('oficina')
const abrir = document.getElementById('abrir-oficina')
function cargarOficina() {
  if (oficina.src) return
  oficina.src = oficina.dataset.src
  abrir.hidden = true
}
abrir.addEventListener('click', cargarOficina)
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  new IntersectionObserver((vistas, o) => {
    if (!vistas.some((v) => v.isIntersecting)) return
    o.disconnect()
    cargarOficina()
  }, { rootMargin: '200px' }).observe(oficina)
}

// ── Descargas: se marca la de tu sistema y se apunta a la versión más nueva que haya en GitHub.
const SISTEMA = /Windows/i.test(navigator.userAgent) ? 'win' : /Mac/i.test(navigator.userAgent) ? 'mac' : /Linux|X11/i.test(navigator.userAgent) ? 'linux' : ''
document.querySelector(`.dl[data-os="${SISTEMA}"]`)?.classList.add('tuyo')

const ARCHIVO = { win: /\.exe$/i, mac: /\.dmg$/i, linux: /\.AppImage$/i }
const megas = (bytes) => `${Math.round(bytes / 1048576)} MB`
// Si GitHub no contesta, se quedan los enlaces fijos que ya trae la página.
fetch(`https://api.github.com/repos/${REPO}/releases?per_page=5`)
  .then((r) => (r.ok ? r.json() : []))
  .then((versiones) => {
    const ultima = versiones.find((v) => !v.draft && v.assets?.length)
    if (!ultima) return
    document.getElementById('version').textContent = ultima.tag_name
    for (const enlace of document.querySelectorAll('.dl')) {
      const paquete = ultima.assets.find((a) => ARCHIVO[enlace.dataset.os].test(a.name))
      if (!paquete) continue
      enlace.href = paquete.browser_download_url
      const detalle = enlace.querySelector('small')
      detalle.textContent = `${detalle.textContent} · ${megas(paquete.size)}`
    }
  })
  .catch(() => {})

// ── Capturas: clic para verlas grandes, clic o Escape para cerrar.
function cerrar() {
  document.querySelector('.zoom')?.remove()
}
for (const img of document.querySelectorAll('.shots img')) {
  img.addEventListener('click', () => {
    const fondo = document.createElement('div')
    fondo.className = 'zoom'
    fondo.append(Object.assign(new Image(), { src: img.src, alt: img.alt }))
    fondo.addEventListener('click', cerrar)
    document.body.append(fondo)
  })
}
addEventListener('keydown', (e) => e.key === 'Escape' && cerrar())
