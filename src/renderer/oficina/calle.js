// La calle a los lados del edificio: llena las franjas que sobran junto a la
// oficina cuando la ventana es más ancha que ella. Acera pegada al edificio,
// arroyo de dos carriles y otra acera; pasan coches y camina gente.
//
// No es parte de la escena ni del mapa: vive en una capa fija detrás de todo,
// recortada a la ventana. Por eso nunca agrega barras de desplazamiento ni
// cambia el tamaño de la oficina; simplemente se ve lo que quepa.
//
// Medidas en px nativos de la escena, contadas desde la pared del edificio
// hacia afuera. app.js avisa de la escala y de la hora con eventos.
const ANCHO = 220
const ACERA = 44 // ancho de la acera pegada al edificio
const BORDE = 4
const CARRIL = 30
const ARROYO = CARRIL * 2
const X = {
  borde1: ACERA,
  arroyo: ACERA + BORDE,
  raya: ACERA + BORDE + CARRIL - 2,
  borde2: ACERA + BORDE + ARROYO,
  acera2: ACERA + BORDE + ARROYO + BORDE,
}
const VEHICULOS = [
  { nombre: 'auto-rojo', frente: [24, 33], atras: [24, 32] },
  { nombre: 'auto-azul', frente: [24, 32], atras: [24, 30] },
  { nombre: 'camioneta', frente: [24, 41], atras: [24, 40] },
  { nombre: 'taxi', frente: [24, 33], atras: [24, 32] },
]
const PEATONES = [1, 2, 3, 4]
const PEATON = [17, 23]
const VEL_COCHE = 46 // px nativos por segundo
const VEL_PEATON = 13
const entre = (a, b) => a + Math.random() * (b - a)
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)]

let s = 1
let alto = 356
const px = (n) => `calc(${n}px * var(--s))`

const capa = document.createElement('div')
capa.id = 'calles'
document.body.prepend(capa)

function pieza(lado, clase, x, w) {
  const el = document.createElement('div')
  el.className = clase
  // En la calle izquierda todo se mide desde su orilla derecha (la pared del edificio).
  el.style[lado.espejo ? 'right' : 'left'] = px(x)
  el.style.width = px(w)
  lado.el.appendChild(el)
  return el
}

function sprite(lado, archivo, x, y, w, h, z) {
  const el = pieza(lado, 'cosa', x, w)
  Object.assign(el.style, { top: px(y), height: px(h), backgroundImage: `url("sprites/${archivo}.png")`, zIndex: z ?? y + h })
  return el
}

function armar(espejo) {
  const lado = { espejo, el: document.createElement('div'), moviles: new Set() }
  lado.el.className = `calle ${espejo ? 'izq' : 'der'}`
  capa.appendChild(lado.el)
  pieza(lado, 'suelo acera', 0, ACERA)
  // El bordillo está pintado con la acera a su izquierda: del otro lado va en espejo.
  pieza(lado, `suelo bordillo${espejo ? ' espejo' : ''}`, X.borde1, BORDE)
  pieza(lado, 'suelo asfalto', X.arroyo, ARROYO)
  pieza(lado, 'suelo raya', X.raya, 4)
  pieza(lado, `suelo bordillo${espejo ? '' : ' espejo'}`, X.borde2, BORDE)
  pieza(lado, 'suelo acera', X.acera2, ANCHO - X.acera2)
  // Mobiliario junto al bordillo; la gente camina del lado del edificio para no encimarse.
  const y = espejo ? [70, 168, 250, 310] : [40, 132, 214, 290]
  sprite(lado, 'farola', ACERA - 24, y[0], 21, 40)
  lado.luz = sprite(lado, 'farola-luz', ACERA - 24, y[0], 21, 40, y[0] + 41)
  lado.luz.hidden = true
  sprite(lado, 'buzon', ACERA - 14, y[1], 10, 17)
  sprite(lado, 'hidrante', ACERA - 13, y[2], 9, 12)
  sprite(lado, 'arbol-acera', ACERA - 22, y[3], 18, 28)
  sprite(lado, 'arbol-acera', X.acera2 + 6, y[1] - 40, 18, 28)
  sprite(lado, 'farola', X.acera2 + 4, y[3] - 60, 21, 40)
  return lado
}

// Algo que cruza la calle de arriba abajo (o al revés) y desaparece al salir.
function cruzar(lado, { hoja, cuadros, w, h, x, baja, velocidad, ms }) {
  const el = pieza(lado, 'cosa hoja', x, w)
  el.style.height = px(h)
  el.style.backgroundImage = `url("sprites/${hoja}.png")`
  el.style.setProperty('--fw', w)
  el.style.setProperty('--n', cuadros)
  el.style.setProperty('--dur', `${cuadros * ms}ms`)
  el.style.top = '0'
  el.style.zIndex = baja ? 400 : 200
  const de = baja ? -h : alto
  const a = baja ? alto : -h
  const anim = el.animate([{ transform: `translateY(${de * s}px)` }, { transform: `translateY(${a * s}px)` }], { duration: ((alto + h) / velocidad) * 1000, easing: 'linear' })
  lado.moviles.add(anim)
  anim.onfinish = anim.oncancel = () => {
    lado.moviles.delete(anim)
    el.remove()
  }
}

// En pantalla, el carril izquierdo baja y el derecho sube (se circula por la derecha).
function carriles(lado) {
  const cerca = X.arroyo + (CARRIL - 24) / 2
  const lejos = cerca + CARRIL
  return lado.espejo ? { baja: lejos, sube: cerca } : { baja: cerca, sube: lejos }
}

function trafico(lado, baja) {
  const sale = () => {
    if (!document.hidden) {
      const v = azar(VEHICULOS)
      const [w, h] = baja ? v.frente : v.atras
      cruzar(lado, { hoja: `${v.nombre}-${baja ? 'frente' : 'atras'}-anim`, cuadros: 2, w, h, x: carriles(lado)[baja ? 'baja' : 'sube'], baja, velocidad: VEL_COCHE * entre(0.9, 1.15), ms: 200 })
    }
    // El siguiente sale cuando este ya dejó hueco de sobra.
    setTimeout(sale, entre(3200, 9000))
  }
  setTimeout(sale, entre(300, 5000))
}

function gente(lado, x, baja) {
  const sale = () => {
    if (!document.hidden) {
      const n = azar(PEATONES)
      cruzar(lado, { hoja: `peaton${n}-${baja ? 'camina' : 'atras-camina'}`, cuadros: 4, w: PEATON[0], h: PEATON[1], x, baja, velocidad: VEL_PEATON * entre(0.85, 1.2), ms: 150 })
    }
    setTimeout(sale, entre(7000, 19000))
  }
  setTimeout(sale, entre(500, 9000))
}

const lados = [armar(true), armar(false)]
for (const lado of lados) {
  trafico(lado, true)
  trafico(lado, false)
  gente(lado, 3, true)
  gente(lado, 20, false)
  gente(lado, X.acera2 + 30, Math.random() < 0.5)
}

// Cada calle se pega al costado de la oficina, a su misma altura.
function ubicar() {
  const oficina = document.getElementById('office')
  if (!oficina) return
  const r = oficina.getBoundingClientRect()
  capa.style.setProperty('--s', s)
  for (const lado of lados) {
    Object.assign(lado.el.style, { top: `${r.top}px`, height: `${r.height}px`, width: `${ANCHO * s}px`, left: `${lado.espejo ? r.left - ANCHO * s : r.right}px` })
  }
}

window.addEventListener('oficina:escala', (e) => {
  const cambio = e.detail.s !== s || e.detail.alto !== alto
  s = e.detail.s
  alto = e.detail.alto
  // Lo que iba en camino se midió con la escala anterior: se retira y vuelve a salir.
  if (cambio) for (const lado of lados) for (const anim of [...lado.moviles]) anim.cancel()
  ubicar()
})
window.addEventListener('oficina:fase', (e) => (capa.style.filter = e.detail.filtro))
window.addEventListener('oficina:noche', (e) => lados.forEach((lado) => (lado.luz.hidden = !e.detail)))
window.addEventListener('resize', ubicar)
document.addEventListener('scroll', ubicar, true)
