/**
 * El MCP «trazo» del lado de la ventana. Lo que el diseñador le pide al editor
 * llega del proceso principal (core/trazomcp) y lo atiende el editor del panel
 * Estudio, que se registra con `serveTrazo` cuando está listo. Si el panel
 * está cerrado se abre y se le espera un momento.
 */
import { ref } from 'vue'
import type { TrazoRequest, TrazoResponse } from '../../core/trazomcp'
import { T } from '../../core/i18n'

/** El editor es opcional: mientras no esté instalado, su botón sale con el ícono de descarga. */
export const editorInstalled = ref<boolean | null>(null)
export async function refreshEditor() {
  editorInstalled.value = await window.orquest.designState().then((s) => !!s.editorVersion, () => null)
}

type Server = (req: TrazoRequest) => Promise<TrazoResponse>
let server: Server | null = null
const ready: (() => void)[] = []

/** El editor ya atiende; devuelve con qué dejar de hacerlo. */
export function serveTrazo(fn: Server): () => void {
  server = fn
  for (const r of ready.splice(0)) r()
  return () => {
    if (server === fn) server = null
  }
}

const waitServer = (ms: number) =>
  new Promise<void>((ok) => {
    const t = setTimeout(ok, ms)
    ready.push(() => {
      clearTimeout(t)
      ok()
    })
  })

/** Git da la raíz con diagonales y el sistema con las suyas: se comparan parejas. */
const same = (a: string, b: string) => {
  const n = (p: string) => p.split('\\').join('/').replace(/\/$/, '').toLowerCase()
  return n(a) === n(b)
}

const fail = (message: string): TrazoResponse => ({ error: { code: -32603, message } })

export function installTrazoBridge(o: { project: () => string | undefined; openPanel: () => void }): () => void {
  return window.orquest.onTrazoRequest(async (req) => {
    const reply = (r: TrazoResponse) => void window.orquest.trazoRespond(req.id, r).catch(() => {})
    const project = o.project()
    if (!project || !same(project, req.project)) return reply(fail(T`El usuario tiene otro proyecto a la vista en Orquest: el editor de este diseño no está abierto. Pídele que vuelva a este proyecto.`))
    if (!server) {
      o.openPanel()
      await waitServer(20_000)
    }
    if (!server) return reply(fail(T`El editor de Trazo no está abierto: pídele al usuario que abra el panel Estudio y elija el diseño del proyecto.`))
    try {
      reply(await server(req))
    } catch (e) {
      reply(fail((e as Error).message))
    }
  })
}
