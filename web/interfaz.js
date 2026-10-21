// La interfaz de la app en la portada: una réplica a mano del lienzo de un proyecto, con datos
// de ejemplo. Queda de fondo detrás de los textos; «Probar la interfaz» los quita y deja moverse
// por ella: arrastrar paneles y el fondo, zoom con Ctrl + rueda, contestarle al jefe, darle
// permiso a Nico. Nada sale del navegador. En celular no se arma: la portada usa su imagen.
;(() => {
  document.documentElement.classList.add('js')
  const EN = document.documentElement.lang === 'en'
  const t = (es, en) => (EN ? en : es)
  // La página en inglés vive en /en/: lo que se pide por ruta está una carpeta arriba.
  const RAIZ = EN ? '../' : ''
  const portada = document.getElementById('inicio')
  const ui = document.getElementById('interfaz')
  const probar = document.getElementById('probar')
  if (!ui || !probar || !matchMedia('(min-width: 901px) and (hover: hover)').matches) return
  const QUIETO = matchMedia('(prefers-reduced-motion: reduce)').matches

  const C = { rojo: '#e5534b', azul: '#4a8fe0', verde: '#5fbf6a', amarillo: '#f2b544', naranja: '#d9774b' }
  const ICONOS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menos: '<path d="M5 12h14"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    cuadro: '<rect x="4" y="4" width="16" height="16"/>',
    agrandar: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    agarre: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    corona: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>',
    medidor: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    personas: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    tablero: '<path d="M6 5v11M12 5v6M18 5v14"/>',
    hoja: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    carpeta: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    bandeja: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    mano: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    diana: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    encuadre: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>',
    rejilla: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    capas: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    volver: '<path d="m12 19-7-7 7-7M19 12H5"/>',
    pregunta: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    listo: '<path d="M20 6 9 17l-5-5"/>',
  }
  const ico = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n]}</svg>`
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const hora = () => new Date().toTimeString().slice(0, 5)

  // ── Dónde nace cada panel, en píxeles del lienzo. «Ordenar» los regresa aquí.
  const ACOMODO = {
    jefe: { x: 100, y: 106, w: 560, h: 452 },
    oficina: { x: 678, y: 72, w: 600, h: 338 },
    nico: { x: 678, y: 428, w: 360, h: 222 },
    uso: { x: 1056, y: 428, w: 222, h: 222 },
  }
  const pos = structuredClone(ACOMODO)

  // ── Lo que pasa en el proyecto de ejemplo.
  const estado = {
    preguntas: [
      {
        texto: t('¿Qué pasarela de pagos usamos?', 'Which payment gateway should we use?'),
        opciones: ['Stripe', 'Mercado Pago', 'Conekta'],
        responde: (o) => t(`Va con ${o}. Le paso a Leo la API de pagos y a Nico la pantalla de cobro.`, `${o} it is. I'll hand Leo the payments API and Nico the checkout screen.`),
      },
      {
        texto: t('¿Cuál es el dominio de producción?', "What's the production domain?"),
        opciones: ['tienda.mx', t('Lo decido después', 'Decide later')],
        responde: () => t('Anotado. Lo dejo en el plan para cuando publiquemos.', "Noted. I'll keep it in the plan for when we ship."),
      },
    ],
    permiso: true, // Nico espera permiso para npm install
    trabajando: 4,
    usos: [
      { nombre: 'Claude Code', color: C.naranja, p: 62, reinicia: '11:51', semana: 31 },
      { nombre: 'Codex', color: C.azul, p: 93, reinicia: '10:38', semana: 74 },
      { nombre: 'Codex · 2', color: C.azul, p: 17, reinicia: '13:36', semana: 3 },
    ],
    respuestas: 0,
  }

  // ── El armado.
  const cabeza = (id, color, titulo, sub) =>
    `<header class="ui-cabeza">${ico('agarre')}<b style="--c:${color}">${titulo}</b><small>${sub}</small>` +
    `<button type="button" data-accion="minimo" title="${t('Minimizar', 'Minimize')}">${ico('menos')}</button>` +
    `<button type="button" data-accion="enfocar" title="${t('Enfocar', 'Focus')}">${ico('agrandar')}</button>` +
    `<button type="button" data-accion="cerrar" title="${t('Cerrar', 'Close')}">${ico('x')}</button></header>`
  const panel = (id, color, titulo, sub, cuerpo) => `<section class="ui-panel" data-panel="${id}">${cabeza(id, color, titulo, sub)}<div class="ui-contenido">${cuerpo}</div></section>`
  const pestana = (icono, texto, falta, extra = '') => `<button type="button" class="ui-boton" data-falta="${falta}">${ico(icono)}${texto}${extra}</button>`

  const jefe = panel(
    'jefe',
    C.verde,
    t('JEFE', 'BOSS'),
    t('Ana · tu única interlocutora', 'Ana · your single point of contact'),
    `<div class="ui-chat">
      <div class="ui-objetivo">${ico('diana')}<div><small>${t('OBJETIVO', 'GOAL')}</small>${t('Tienda en línea con catálogo, clientes y pagos', 'Online store with catalog, customers and payments')}</div></div>
      <div class="ui-mensajes" id="ui-mensajes"></div>
      <div class="ui-pregunta" id="ui-pregunta"></div>
      <div class="ui-caja"><textarea id="ui-texto" rows="1" placeholder="${t('Háblale a Ana…', 'Talk to Ana…')}"></textarea><button type="button" class="ui-boton amarillo" data-accion="enviar">${ico('enviar')}${t('Enviar', 'Send')}</button></div>
    </div>
    <div class="ui-lado">
      <div class="ui-tarjeta">
        <div class="ui-quien"><i style="--retrato:url(${RAIZ}img/char1-idle.png)"></i><div><b>Ana</b><small>Claude Code · opus</small></div></div>
        <span class="ui-estado" id="ui-estado-ana"></span>
        <div class="ui-pista" style="--p:28%"><i></i></div>
      </div>
      ${pestana('terminal', t('Abrir su terminal', 'Open her terminal'), 'terminal')}
      <div class="ui-tarjeta ui-espera" id="ui-espera"></div>
    </div>`,
  )
  const oficina = panel(
    'oficina',
    C.azul,
    t('OFICINA', 'OFFICE'),
    'tienda-en-linea',
    `<div class="ui-oficina"><span class="ui-vivo">● ${t('EN VIVO', 'LIVE')}</span><img src="${RAIZ}img/oficina-poster.png" alt=""><iframe id="ui-oficina" title="${t('Oficina de Orquest AI en demostración', 'Orquest AI office demo')}" hidden></iframe></div>`,
  )
  const nico = panel(
    'nico',
    C.rojo,
    'NICO',
    t('Frontend · Codex · gpt-5', 'Frontend · Codex · gpt-5'),
    `<div class="ui-terminal" id="ui-terminal">
      <div class="ui-franja" id="ui-franja">${ico('mano')}${t('Te necesita: permiso para npm install', 'Needs you: permission for npm install')}</div>
      <p class="tenue">• ${t('Leí', 'Read')} src/carrito/total.ts</p>
      <p class="tenue">• ${t('Edité', 'Edited')} src/checkout/Pago.vue  +42 −3</p>
      <p class="verde">• ${t('Corrí npm test · 18 pasan', 'Ran npm test · 18 passing')}</p>
      <p class="amarillo">Allow command?  npm install stripe</p>
      <div class="ui-opciones" id="ui-opciones"><button type="button" class="ui-boton amarillo" data-accion="permitir">${t('Permitir una vez', 'Allow once')}</button><button type="button" class="ui-boton" data-accion="negar">${t('No', 'No')}</button></div>
    </div>`,
  )
  const uso = panel('uso', C.rojo, t('USO', 'USAGE'), t('límites por proveedor', 'limits per provider'), `<div class="ui-usos" id="ui-usos"></div>`)

  ui.innerHTML = `
    <div class="ui-titulo"><b>Orquest AI</b><span>· tienda-en-linea</span><span class="ui-ventana">${ico('menos')}${ico('cuadro')}${ico('x')}</span></div>
    <div class="ui-barra">
      <button type="button" class="ui-boton" data-falta="inicio">${t('Inicio', 'Home')}</button>
      <span class="ui-proyecto">tienda-en-linea</span>
      <div class="ui-leyenda" id="ui-leyenda"></div>
      <button type="button" class="ui-boton activo" data-abre="jefe">${ico('corona')}${t('Jefe', 'Boss')}</button>
      ${pestana('personas', t('Plantilla', 'Team'), 'plantilla', '<span class="insignia">3</span>')}
      ${pestana('tablero', t('Tablero', 'Board'), 'tablero')}
      ${pestana('hoja', t('Planes', 'Plans'), 'planes')}
      ${pestana('carpeta', t('Expedientes', 'Records'), 'expedientes')}
      ${pestana('bandeja', t('Entregas', 'Deliveries'), 'entregas')}
      <button type="button" class="ui-boton" data-abre="uso" title="${t('Uso', 'Usage')}">${ico('medidor')}</button>
      <button type="button" class="ui-boton" data-falta="tema" title="${t('Tema', 'Theme')}">${ico('sol')}</button>
    </div>
    <nav class="ui-dock">
      <div>${ico('capas')}<span>${t('PROY.', 'PROJ.')}</span></div>
      <button type="button" data-falta="proyecto"><span class="ui-ficha">FE<span class="insignia">2</span><i></i></span><span>flow-erp</span></button>
      <button type="button" data-falta="proyecto"><span class="ui-ficha">HE<i></i></span><span>herdr</span></button>
      <button type="button" data-abre="jefe"><span class="ui-ficha activa">TE<span class="insignia" id="ui-insignia"></span><i></i></span><span>tienda</span></button>
      <button type="button" data-falta="proyecto"><span class="ui-ficha nuevo">+</span></button>
      <button type="button" class="ui-uso" data-abre="uso"><span class="ui-boton">${ico('medidor')}</span><b></b><span id="ui-uso-dock"></span></button>
    </nav>
    <div class="ui-lienzo" id="ui-lienzo">
      <div class="ui-mundo" id="ui-mundo">${jefe}${oficina}${nico}${uso}</div>
      <div class="ui-avisos" id="ui-avisos"></div>
      <div class="ui-zoom">
        <button type="button" data-accion="alejar" title="${t('Alejar', 'Zoom out')}">${ico('menos')}</button><b id="ui-zoom">100%</b><button type="button" data-accion="acercar" title="${t('Acercar', 'Zoom in')}">${ico('mas')}</button>
        <button type="button" data-accion="ver-todo">${ico('encuadre')}${t('Ver todo', 'Fit all')}</button>
        <button type="button" data-accion="ordenar">${ico('rejilla')}${t('Ordenar', 'Arrange')}</button>
      </div>
      <div class="ui-rapida">${ico('corona')}<textarea id="ui-rapida" rows="1" placeholder="${t('Háblale a Ana…', 'Talk to Ana…')}"></textarea><button type="button" data-accion="rapida" title="${t('Enviar', 'Send')}">${ico('enviar')}</button></div>
      <div class="ui-mapa" id="ui-mapa" title="${t('Minimapa', 'Minimap')}"></div>
      <div class="ui-salir" id="ui-salir" hidden><span><b>${t('Estás probando la interfaz.', "You're trying the interface.")}</b> ${t('Arrastra paneles o el fondo · Ctrl + rueda: zoom', 'Drag panels or the background · Ctrl + wheel: zoom')}</span><button type="button" class="ui-boton" data-accion="volver">${ico('volver')}${t('Volver', 'Back')}</button></div>
    </div>`
  portada.classList.add('con-ui')

  const $ = (id) => document.getElementById(id)
  const lienzo = $('ui-lienzo')
  const mundo = $('ui-mundo')
  const paneles = Object.fromEntries([...mundo.querySelectorAll('.ui-panel')].map((el) => [el.dataset.panel, el]))
  let viva = false
  let tocado = false // si el visitante ya movió algo, un cambio de tamaño de la ventana no lo reacomoda
  let encima = 1
  let enfocado = null

  // ── Paneles y cámara.
  const cam = { x: 0, y: 0, s: 1 }
  function colocar(id) {
    const p = pos[id]
    Object.assign(paneles[id].style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` })
  }
  function pintar() {
    mundo.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`
    $('ui-zoom').textContent = `${Math.round(cam.s * 100)}%`
    minimapa()
  }
  function animar() {
    if (QUIETO) return
    ui.classList.add('animada')
    clearTimeout(animar.t)
    animar.t = setTimeout(() => ui.classList.remove('animada'), 420)
  }
  const visibles = () => Object.keys(paneles).filter((id) => !paneles[id].hidden)
  function caja(ids) {
    const xs = ids.map((id) => pos[id])
    const alto = (id) => (paneles[id].classList.contains('minimo') ? 30 : pos[id].h)
    const x0 = Math.min(...xs.map((p) => p.x))
    const y0 = Math.min(...xs.map((p) => p.y))
    return { x0, y0, x1: Math.max(...ids.map((id) => pos[id].x + pos[id].w)), y1: Math.max(...ids.map((id) => pos[id].y + alto(id))) }
  }
  // Encuadra unos paneles dejando libre arriba (el aviso de «probando») y abajo (zoom, caja, minimapa).
  function encuadrar(ids, max = 1) {
    if (!ids.length) return
    const r = lienzo.getBoundingClientRect()
    const b = caja(ids)
    const arriba = 52
    const abajo = 68
    const s = Math.min(max, (r.width - 80) / (b.x1 - b.x0), (r.height - arriba - abajo) / (b.y1 - b.y0))
    cam.s = Math.max(0.35, s)
    cam.x = (r.width - (b.x1 - b.x0) * cam.s) / 2 - b.x0 * cam.s
    cam.y = arriba + (r.height - arriba - abajo - (b.y1 - b.y0) * cam.s) / 2 - b.y0 * cam.s
    pintar()
  }
  function zoomEn(px, py, factor) {
    const s = Math.min(1.6, Math.max(0.35, cam.s * factor))
    cam.x = px - ((px - cam.x) * s) / cam.s
    cam.y = py - ((py - cam.y) * s) / cam.s
    cam.s = s
    tocado = true
    pintar()
  }
  function alFrente(id) {
    paneles[id].style.zIndex = ++encima
    if (enfocado) paneles[enfocado].classList.remove('enfocado')
    enfocado = id
    paneles[id].classList.add('enfocado')
    minimapa()
  }
  function desenfocar() {
    if (enfocado) paneles[enfocado].classList.remove('enfocado')
    enfocado = null
    minimapa()
  }
  // Lo trae a la vista como en la app: lo abre si estaba cerrado y la cámara va a él.
  function mostrar(id) {
    paneles[id].hidden = false
    paneles[id].classList.remove('minimo')
    alFrente(id)
    animar()
    encuadrar([id], Math.max(cam.s, 0.9))
  }

  // ── Minimapa: los paneles y lo que se ve, a escala.
  function minimapa() {
    const mapa = $('ui-mapa')
    const r = lienzo.getBoundingClientRect()
    if (!r.width) return
    const vista = { x0: -cam.x / cam.s, y0: -cam.y / cam.s, x1: (r.width - cam.x) / cam.s, y1: (r.height - cam.y) / cam.s }
    const ids = visibles()
    const b = ids.length ? caja(ids) : vista
    const x0 = Math.min(b.x0, vista.x0)
    const y0 = Math.min(b.y0, vista.y0)
    const k = Math.min((136 - 12) / (Math.max(b.x1, vista.x1) - x0), (70 - 12) / (Math.max(b.y1, vista.y1) - y0))
    const caja2 = (x, y, w, h, clase) => `<i class="${clase}" style="left:${6 + (x - x0) * k}px;top:${6 + (y - y0) * k}px;width:${w * k}px;height:${h * k}px"></i>`
    mapa.innerHTML =
      ids.map((id) => caja2(pos[id].x, pos[id].y, pos[id].w, paneles[id].classList.contains('minimo') ? 30 : pos[id].h, id === enfocado ? 'enfocado' : '')).join('') +
      caja2(vista.x0, vista.y0, vista.x1 - vista.x0, vista.y1 - vista.y0, 'vista')
    minimapa.mapear = (mx, my) => ({ x: x0 + (mx - 6) / k, y: y0 + (my - 6) / k })
  }
  $('ui-mapa').addEventListener('pointerdown', (e) => {
    if (!viva || !minimapa.mapear) return
    const m = $('ui-mapa').getBoundingClientRect()
    const p = minimapa.mapear(e.clientX - m.left, e.clientY - m.top)
    const r = lienzo.getBoundingClientRect()
    cam.x = r.width / 2 - p.x * cam.s
    cam.y = r.height / 2 - p.y * cam.s
    tocado = true
    animar()
    pintar()
  })

  // ── Arrastrar: un panel por su encabezado; el fondo (o el botón de en medio) mueve el lienzo.
  function arrastrar(e, mover) {
    e.preventDefault()
    lienzo.setPointerCapture(e.pointerId)
    ui.classList.add('arrastrando')
    let px = e.clientX
    let py = e.clientY
    const mueve = (ev) => {
      mover(ev.clientX - px, ev.clientY - py)
      px = ev.clientX
      py = ev.clientY
      tocado = true
    }
    const suelta = () => {
      lienzo.removeEventListener('pointermove', mueve)
      lienzo.removeEventListener('pointerup', suelta)
      lienzo.removeEventListener('pointercancel', suelta)
      ui.classList.remove('arrastrando')
      lienzo.classList.remove('moviendo')
    }
    lienzo.addEventListener('pointermove', mueve)
    lienzo.addEventListener('pointerup', suelta)
    lienzo.addEventListener('pointercancel', suelta)
  }
  const FIJOS = '.ui-avisos, .ui-zoom, .ui-rapida, .ui-mapa, .ui-salir'
  lienzo.addEventListener('pointerdown', (e) => {
    if (!viva || e.target.closest(FIJOS)) return
    const el = e.target.closest('.ui-panel')
    const recorrer = (dx, dy) => {
      cam.x += dx
      cam.y += dy
      pintar()
    }
    if (e.button === 1) {
      lienzo.classList.add('moviendo')
      return arrastrar(e, recorrer)
    }
    if (e.button !== 0) return
    if (!el) {
      desenfocar()
      lienzo.classList.add('moviendo')
      return arrastrar(e, recorrer)
    }
    const id = el.dataset.panel
    alFrente(id)
    if (e.target.closest('.ui-cabeza') && !e.target.closest('button')) {
      arrastrar(e, (dx, dy) => {
        pos[id].x += dx / cam.s
        pos[id].y += dy / cam.s
        colocar(id)
        minimapa()
      })
    }
  })
  lienzo.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.ui-cabeza')
    if (!viva || !el || e.target.closest('button')) return
    animar()
    encuadrar([el.parentElement.dataset.panel], 1.25)
  })
  // La rueda sola sigue bajando la página (o recorre el chat o la terminal); Ctrl + rueda, o
  // pellizcar en el trackpad, acerca y aleja con el cursor quieto.
  function rueda(e, x, y) {
    if (!viva || !(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const r = lienzo.getBoundingClientRect()
    zoomEn(x - r.left, y - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)))
  }
  lienzo.addEventListener('wheel', (e) => rueda(e, e.clientX, e.clientY), { passive: false })

  // ── La oficina de píxel: la misma de la página, viva solo después de «Probar».
  const marco = $('ui-oficina')
  marco.addEventListener('load', () => {
    marco.hidden = false
    try {
      // Mismo origen: el Ctrl + rueda que cae dentro de la oficina también es del lienzo.
      marco.contentWindow.addEventListener('wheel', (e) => {
        const r = marco.getBoundingClientRect()
        rueda(e, r.left + (e.clientX * r.width) / marco.clientWidth, r.top + (e.clientY * r.height) / marco.clientHeight)
      }, { passive: false })
    } catch {
      // Abierta desde archivo puede no dejar: entonces la rueda es de la oficina.
    }
  })

  // ── Avisos de abajo a la izquierda (como mucho tres).
  function aviso({ id, texto, color, icono = 'campana', panel: destino, dura }) {
    const caja = $('ui-avisos')
    if (id) caja.querySelector(`[data-id="${id}"]`)?.remove()
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'ui-aviso'
    el.style.setProperty('--c', color)
    if (id) el.dataset.id = id
    if (destino) el.dataset.abre = destino
    el.innerHTML = `${ico(icono)}<span>${texto}</span>`
    caja.prepend(el)
    while (caja.children.length > 3) caja.lastElementChild.remove()
    if (dura) setTimeout(() => el.remove(), dura)
  }
  const quitarAviso = (id) => $('ui-avisos').querySelector(`[data-id="${id}"]`)?.remove()

  // ── Lo que se ve del proyecto: leyenda, insignia del dock, pregunta, lo que Ana espera, uso.
  function pintarProyecto() {
    const pendientes = estado.preguntas.length
    const necesita = estado.permiso ? 1 : 0
    $('ui-leyenda').innerHTML =
      `<span style="--c:${C.azul}">${estado.trabajando} ${t('trabajando', 'working')}</span>` +
      `<span class="${necesita ? 'rojo' : ''}" style="--c:${C.rojo}">${necesita} ${t('te necesita', 'need you')}</span>` +
      `<span style="--c:${C.verde}">1 ${t('en espera', 'idle')}</span>`
    const insignia = $('ui-insignia')
    insignia.textContent = pendientes + necesita
    insignia.hidden = !(pendientes + necesita)
    const estadoAna = $('ui-estado-ana')
    estadoAna.textContent = pendientes ? `■ ${t('Espera por ti', 'Waiting for you')}` : `■ ${t('Trabajando', 'Working')}`
    estadoAna.style.setProperty('--c', pendientes ? C.amarillo : C.azul)

    const q = estado.preguntas[0]
    const tarjeta = $('ui-pregunta')
    tarjeta.hidden = !q
    if (q) {
      tarjeta.innerHTML =
        `<header>${ico('pregunta')}${t('Ana espera por ti', 'Ana is waiting for you')}<small>${pendientes} ${t('sin contestar', 'unanswered')}</small></header>` +
        `<p>${q.texto}</p><div>${q.opciones.map((o) => `<button type="button" class="ui-boton" data-responde="${esc(o)}">${esc(o)}</button>`).join('')}</div>`
    }
    const filas = []
    if (pendientes) filas.push([C.rojo, 'alerta', t(`${pendientes} ${pendientes === 1 ? 'pregunta' : 'preguntas'} sin contestar`, `${pendientes} unanswered ${pendientes === 1 ? 'question' : 'questions'}`), t('Contestar', 'Answer'), 'jefe'])
    if (necesita) filas.push([C.rojo, 'alerta', t('Nico necesita un permiso', 'Nico needs a permission'), t('Ver a Nico', 'See Nico'), 'nico'])
    if (estado.usos[1].p >= 95) filas.push([C.amarillo, 'medidor', t('Codex casi en su límite', 'Codex almost at its limit'), t('Ver uso', 'See usage'), 'uso'])
    $('ui-espera').innerHTML =
      `<small>${t('ANA ESPERA DE TI', 'ANA NEEDS FROM YOU')}</small>` +
      (filas.length
        ? filas.map(([c, i, txt, boton, destino]) => `<p style="--c:${c}">${ico(i)}<span>${txt}</span></p><button type="button" class="ui-boton" data-abre="${destino}">${boton}</button>`).join('')
        : `<span class="ui-libre">${t('Nada por ahora.', 'Nothing for now.')}</span>`)

    pintarUso()
  }
  // El uso cambia cada pocos segundos: se actualiza en su lugar, así la barra avanza con su transición.
  function pintarUso() {
    const caja = $('ui-usos')
    if (!caja.children.length) {
      caja.innerHTML =
        estado.usos
          .map((u) => `<div class="ui-cuenta" style="--c:${u.color}"><header><span>${u.nombre}</span><b></b></header><div class="ui-pista"><i></i></div><footer><span>${t('5 h · reinicia', '5 h · resets')} ${u.reinicia}</span><span>${t('semana', 'week')} ${u.semana}%</span></footer></div>`)
          .join('') + `<button type="button" class="ui-boton" data-falta="cuentas">${t('Ver cuentas', 'See accounts')}</button>`
    }
    estado.usos.forEach((u, i) => {
      const el = caja.children[i]
      const p = Math.round(u.p)
      const alto = p >= 90
      el.querySelector('b').textContent = `${p}%`
      el.querySelector('b').className = alto ? 'alto' : ''
      el.querySelector('.ui-pista').style.cssText = `--p:${u.p}%;--c:${alto ? C.rojo : u.color}`
    })
    $('ui-uso-dock').textContent = `${t('uso', 'usage')} ${Math.round(Math.max(...estado.usos.map((u) => u.p)))}%`
  }

  // ── El chat con Ana.
  function mensaje(quien, texto, mio) {
    const lista = $('ui-mensajes')
    const el = document.createElement('div')
    el.className = `ui-mensaje${mio ? ' mio' : ''}`
    el.innerHTML = `<small>${quien} · ${hora()}</small>${esc(texto)}`
    lista.append(el)
    lista.scrollTop = lista.scrollHeight
  }
  const RESPUESTAS = [
    t('Esto es una demostración: en la app te contesta tu jefe de verdad, con tu proyecto abierto.', 'This is a demo: in the app your real boss answers, with your project open.'),
    t('Anotado. Lo pongo en el tablero y se lo paso a quien le toque.', "Noted. I'll put it on the board and hand it to whoever it fits."),
    t('Va. Te aviso cuando haya una entrega lista para integrar.', "Sure. I'll let you know when there's a delivery ready to merge."),
  ]
  const ana = (texto, espera = 900) => setTimeout(() => mensaje('Ana', texto), espera)
  function decir(texto) {
    texto = texto.trim()
    if (!texto) return
    mensaje(t('Tú', 'You'), texto, true)
    ana(RESPUESTAS[estado.respuestas++ % RESPUESTAS.length])
  }
  // Las cajas crecen con el texto; Enter envía y Shift + Enter hace otro renglón, como en la app.
  for (const [id, enviar] of [['ui-texto', () => decir(cajaTexto('ui-texto'))], ['ui-rapida', () => { decir(cajaTexto('ui-rapida')); mostrar('jefe') }]]) {
    const caja = $(id)
    caja.addEventListener('input', () => {
      caja.style.height = 'auto'
      caja.style.height = `${caja.scrollHeight + 2}px`
    })
    caja.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
      e.preventDefault()
      enviar()
    })
    caja.enviar = enviar
  }
  function cajaTexto(id) {
    const caja = $(id)
    const texto = caja.value
    caja.value = ''
    caja.style.height = ''
    return texto
  }
  function responder(opcion) {
    const q = estado.preguntas.shift()
    if (!q) return
    mensaje(t('Tú', 'You'), opcion, true)
    ana(q.responde(opcion))
    if (!estado.preguntas.length) quitarAviso('preguntas')
    else aviso({ id: 'preguntas', texto: t('Ana espera por ti: 1 pregunta · Contestar', 'Ana is waiting for you: 1 question · Answer'), color: C.amarillo, panel: 'jefe' })
    if (!estado.preguntas.length) estado.trabajando++
    pintarProyecto()
  }

  // ── Nico y su permiso.
  function linea(texto, clase, antes) {
    const p = document.createElement('p')
    p.className = clase
    p.textContent = texto
    const term = $('ui-terminal')
    term.insertBefore(p, antes ?? null)
    term.scrollTop = term.scrollHeight
  }
  function permiso(si) {
    if (!estado.permiso) return
    estado.permiso = false
    $('ui-franja').remove()
    $('ui-opciones').remove()
    quitarAviso('nico')
    if (si) {
      linea(t('✓ npm install stripe · 1 paquete agregado', '✓ npm install stripe · added 1 package'), 'verde')
      estado.trabajando++
      setTimeout(() => linea(`• ${t('Editando', 'Editing')} src/checkout/Pago.vue…`, 'tenue'), 1400)
      setTimeout(() => {
        linea(`• ${t('Entregó «Pantalla de cobro»', 'Delivered “Checkout screen”')}`, 'verde')
        estado.trabajando--
        aviso({ texto: t('Nico entregó «Pantalla de cobro»', 'Nico delivered “Checkout screen”'), color: C.verde, icono: 'listo', panel: 'jefe', dura: 9000 })
        ana(t('Revisé la entrega de Nico: pasa las pruebas. Está lista para que la integres en Entregas.', "I reviewed Nico's delivery: tests pass. It's ready for you to merge in Deliveries."), 600)
        pintarProyecto()
      }, 6500)
    } else {
      linea(t('✗ Denegado', '✗ Denied'), 'rojo')
      ana(t('Nico se quedó sin instalar stripe. Le pedí que use la API con fetch mientras tanto.', "Nico didn't get to install stripe. I asked him to call the API with fetch meanwhile."))
    }
    pintarProyecto()
  }

  // ── Lo que en la app abre otra cosa: aquí, un aviso que lo cuenta.
  const FALTA = {
    inicio: t('En la app, Inicio lista tus proyectos.', 'In the app, Home lists your projects.'),
    plantilla: t('En la app, aquí apruebas los puestos que propone el jefe.', 'In the app, this is where you approve the roles the boss proposes.'),
    tablero: t('En la app, aquí ves las tareas y de quién depende cada una.', 'In the app, this is where you see the tasks and what each one waits on.'),
    planes: t('En la app, aquí lees los planes que guarda el jefe.', 'In the app, this is where you read the plans the boss saves.'),
    expedientes: t('En la app, aquí ves cómo le ha ido a cada modelo en tus proyectos.', "In the app, this is where you see how each model has done in your projects."),
    entregas: t('En la app, aquí revisas e integras lo que entrega cada quien.', 'In the app, this is where you review and merge what everyone delivers.'),
    terminal: t('En la app se abre la terminal real del jefe.', "In the app this opens the boss's real terminal."),
    cuentas: t('En la app, aquí ves las cuentas de cada proveedor.', "In the app, this is where you see each provider's accounts."),
    proyecto: t('En la app cambias de proyecto desde el dock.', 'In the app you switch projects from the dock.'),
    tema: t('La app trae tema claro y oscuro.', 'The app has light and dark themes.'),
  }

  ui.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b || !viva) return
    const id = b.closest('.ui-panel')?.dataset.panel
    if (b.dataset.abre) return mostrar(b.dataset.abre)
    if (b.dataset.responde) return responder(b.dataset.responde)
    if (b.dataset.falta) return aviso({ id: 'falta', texto: FALTA[b.dataset.falta], color: C.azul, dura: 6000 })
    const r = lienzo.getBoundingClientRect()
    switch (b.dataset.accion) {
      case 'minimo':
        paneles[id].classList.toggle('minimo')
        return minimapa()
      case 'enfocar':
        animar()
        return encuadrar([id], 1.25)
      case 'cerrar':
        paneles[id].hidden = true
        if (enfocado === id) desenfocar()
        return minimapa()
      case 'enviar':
        return $('ui-texto').enviar()
      case 'rapida':
        return $('ui-rapida').enviar()
      case 'permitir':
        return permiso(true)
      case 'negar':
        return permiso(false)
      case 'acercar':
        animar()
        return zoomEn(r.width / 2, r.height / 2, 1.2)
      case 'alejar':
        animar()
        return zoomEn(r.width / 2, r.height / 2, 1 / 1.2)
      case 'ver-todo':
        animar()
        return encuadrar(visibles())
      case 'ordenar':
        for (const k of Object.keys(paneles)) {
          Object.assign(pos[k], ACOMODO[k])
          paneles[k].hidden = false
          paneles[k].classList.remove('minimo')
          colocar(k)
        }
        animar()
        return encuadrar(visibles())
      case 'volver':
        return cerrar()
    }
  })
  // 0 encuadra todo y O ordena, como en la app (no mientras se escribe).
  document.addEventListener('keydown', (e) => {
    if (!viva || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('textarea, input')) return
    if (e.key === '0') ui.querySelector('[data-accion="ver-todo"]').click()
    else if (e.key === 'o' || e.key === 'O') ui.querySelector('[data-accion="ordenar"]').click()
  })

  // ── Lo que va pasando solo mientras se prueba: entregas de Leo y el uso que sube.
  let reloj = 0
  let guion = false
  function arrancar() {
    if (!guion) {
      guion = true
      setTimeout(() => {
        aviso({ texto: t('Leo entregó «API de pagos»', 'Leo delivered “Payments API”'), color: C.verde, icono: 'listo', panel: 'jefe', dura: 9000 })
        ana(t('Leo entregó la API de pagos. La revisé y la mandé a QA antes de pedirte que la integres.', 'Leo delivered the payments API. I reviewed it and sent it to QA before asking you to merge it.'), 400)
      }, 9000)
    }
    clearInterval(reloj)
    reloj = setInterval(() => {
      if (document.hidden) return
      const [claude, codex] = estado.usos
      claude.p = Math.min(99, claude.p + 0.4)
      if (estado.trabajando > 4 || !estado.permiso) codex.p = Math.min(99, codex.p + 0.5)
      if (codex.p >= 95 && !arrancar.limite) {
        arrancar.limite = true
        aviso({ id: 'limite', texto: t('Codex va en 95% de su límite de 5 horas', 'Codex is at 95% of its 5-hour limit'), color: C.amarillo, icono: 'medidor', panel: 'uso', dura: 12000 })
        pintarProyecto()
      }
      pintarUso()
    }, 4000)
  }

  // ── Probar y volver.
  function abrir() {
    viva = true
    portada.classList.add('viva')
    ui.inert = false
    $('ui-salir').hidden = false
    if (!marco.src) marco.src = `${RAIZ}oficina/oficina.html?marco=0${EN ? '&lang=en' : ''}`
    animar()
    encuadrar(visibles())
    arrancar()
  }
  function cerrar() {
    viva = false
    portada.classList.remove('viva')
    ui.inert = true
    $('ui-salir').hidden = true
    clearInterval(reloj)
    probar.focus({ preventScroll: true })
  }
  probar.addEventListener('click', abrir)

  // ── De arranque.
  for (const id of Object.keys(paneles)) colocar(id)
  mensaje(t('Tú', 'You'), t('Quiero vender en línea: catálogo, carrito y cobro con tarjeta.', 'I want to sell online: catalog, cart and card payments.'), true)
  mensaje('Ana', t('Leí el repositorio y armé el equipo: Nico en frontend y Leo en backend. Te dejo dos preguntas.', 'I read the repository and put the team together: Nico on frontend and Leo on backend. I left you two questions.'))
  aviso({ id: 'preguntas', texto: t('Ana espera por ti: 2 preguntas · Contestar', 'Ana is waiting for you: 2 questions · Answer'), color: C.amarillo, panel: 'jefe' })
  aviso({ id: 'nico', texto: t('Nico te necesita: dale permiso', 'Nico needs you: give him permission'), color: C.rojo, icono: 'alerta', panel: 'nico' })
  pintarProyecto()
  alFrente('jefe')
  encuadrar(visibles())
  addEventListener('resize', () => {
    if (!tocado) encuadrar(visibles())
    else minimapa()
  })
})()
