/*
 * El host de Orquest para el editor de Trazo (ver src/host/types.ts de Trazo).
 * Corre dentro del iframe del panel Estudio antes que el editor. El editor no
 * toca el disco ni las terminales: cada operación se la pide al panel
 * (components/EstudioPanel.vue) por postMessage, y el panel decide.
 */
;(() => {
  const params = new URLSearchParams(location.search)
  let seq = 0
  const pending = new Map()
  const listeners = { salida: new Set(), fin: new Set() }

  const call = (op, args) =>
    new Promise((ok, ko) => {
      const id = ++seq
      pending.set(id, { ok, ko })
      parent.postMessage({ trazo: 'pedir', id, op, args }, '*')
    })

  window.addEventListener('message', (e) => {
    if (e.source !== parent) return
    const m = e.data
    if (m?.trazo === 'respuesta') {
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.error) p.ko(new Error(m.error))
      else p.ok(m.valor)
    } else if (m?.trazo === 'evento' && listeners[m.tipo]) {
      for (const cb of listeners[m.tipo]) cb(m.datos)
    }
  })

  const listen = (tipo) => (cb) => {
    listeners[tipo].add(cb)
    return () => listeners[tipo].delete(cb)
  }
  const bytes = (v) => (v ? new Uint8Array(v) : v)

  const host = {
    studio: true,
    files: {
      paths: true,
      pick: (filters) => call('elegir', { filters }),
      read: (path, kind) => call('leer', { path, kind }).then(bytes),
      askSave: (defaultPath, filters) => call('guardarComo', { defaultPath, filters }),
      write: (path, data, kind) => call('escribir', { path, bytes: data, kind }),
      download: () => {},
      launchFile: () => call('diseno'),
      confirm: (message) => call('confirmar', { message }),
    },
  }

  // El diseñador del proyecto: el chat de Trazo le habla a él en vez de ofrecer elegir proveedor y modelo.
  const name = params.get('disenador')
  if (name) {
    host.agents = {
      fixed: { name, detail: params.get('detalle') || undefined },
      start: (spec) => call('decir', { prompt: spec.prompt }).then(() => ({ run: name })),
      send: (_run, prompt) => call('decir', { prompt }),
      stop: () => call('detener'),
      models: async () => [],
      onOutput: listen('salida'),
      onExit: listen('fin'),
    }
  }

  window.__TRAZO_HOST__ = host
  // Un clic dentro del editor no llega al lienzo de Orquest: se le avisa para traer el panel al frente.
  window.addEventListener('pointerdown', () => parent.postMessage({ trazo: 'toque' }, '*'), true)
})()
