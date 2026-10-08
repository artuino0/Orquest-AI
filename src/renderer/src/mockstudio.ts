/**
 * Un proyecto de mentira para la vista previa: jefe, cinco empleados y tareas
 * que avanzan solas (asignar → trabajar → entregar → aprobar o regresar), con
 * la misma forma de datos que manda el estudio real. Sirve para ver los
 * paneles y la oficina sin abrir la app ni gastar una sola CLI.
 *
 *   /preview.html?proyecto=1              abre directo en la oficina
 *   /preview.html?proyecto=1&jefe=0       oficina vacía, sin jefe
 *   /preview.html?proyecto=1&rapido=1     todo cinco veces más rápido
 */
import type { DossierView, Employee, EmployeeState, Manual, OrquestApi, ProviderId, Role, Slot, StudioSnapshot, Task } from '../../shared/ipc'

export const MOCK_REPO = 'E:\\desarrollo\\tienda-en-linea'

const PEOPLE: { id: string; name: string; role: string; provider: ProviderId; model: string }[] = [
  { id: 'e1', name: 'Lupita', role: 'backend', provider: 'claude', model: 'opus' },
  { id: 'e2', name: 'Beto', role: 'dba', provider: 'codex', model: 'gpt-5' },
  { id: 'e3', name: 'Nico', role: 'frontend', provider: 'antigravity', model: 'gemini-3' },
  { id: 'e4', name: 'Paty', role: 'qa', provider: 'opencode', model: 'sonnet' },
  { id: 'e5', name: 'Tavo', role: 'infra', provider: 'commandcode', model: 'auto' },
]
const WORK: Record<string, [string, string, string][]> = {
  e1: [['API de productos', 'API de productos lista, con pruebas', 'Faltan pruebas del alta'], ['Sesiones seguras', 'Sesiones con token y expiración', 'El token no expira']],
  e2: [['Migración de clientes', 'Migración terminada sin pérdida', 'Faltan índices'], ['Índices de búsqueda', 'Consultas 4× más rápidas', 'Bloquea la tabla']],
  e3: [['Lista de productos', 'Lista responsive', 'Se rompe en móvil'], ['Validación de RFC', 'RFC validado en el formulario', 'Acepta RFC vacío']],
  e4: [['Probar alta de clientes', 'Alta probada, 2 hallazgos', 'Faltan capturas'], ['Probar pagos', 'Pagos probados sin hallazgos', 'No probó el reembolso']],
  e5: [['Pipeline de despliegue', 'Pipeline en verde', 'Falla en producción'], ['Respaldos nocturnos', 'Respaldo y restauración probados', 'No restaura']],
}

// Lo que el jefe propone además de los ya contratados: una permitida, una con aviso y una prohibida.
const PROPOSED: Slot[] = [
  { id: 's6', name: 'Sofi', role: 'qa', provider: 'claude', model: 'opus', effort: 'high', reason: '92 % integradas a la primera cuando revisó QA contigo (11 de 12).', status: 'proposed' },
  { id: 's7', name: 'Iván', role: 'dba', provider: 'kimi', model: 'kimi-k2', effort: 'medium', reason: 'Barato para migraciones largas. Sin historial contigo en DBA.', status: 'proposed' },
  { id: 's8', name: 'Gus', role: 'infra', provider: 'grok', model: 'grok-4', effort: 'high', reason: 'Rápido en scripts de CI según el reporte semanal del mercado.', status: 'proposed' },
]
const ROLES: Role[] = ['desarrollo', 'backend', 'frontend', 'dba', 'infra', 'qa', 'diseno']
const stats = (integradas: number, primera: number, rechazos: number, por: Record<string, [number, number]> = {}): DossierView['stats'] => ({
  entregas: integradas + rechazos, integradas, a_la_primera: primera, rechazos_qa: rechazos, regresadas: rechazos,
  aprobadas_a_la_primera: integradas ? Math.round((primera / integradas) * 100) : null,
  por_puesto: Object.fromEntries(Object.entries(por).map(([k, [i, a]]) => [k, { integradas: i, a_la_primera: a }])),
})
const DOSSIERS: DossierView[] = [
  { provider: 'claude', model: '', allowedRoles: null, enforce: 'warn', notes: 'Va bien en todo. Caro para tareas chicas.', stats: stats(12, 11, 1, { backend: [6, 6], qa: [4, 4], frontend: [2, 1] }) },
  { provider: 'claude', model: 'opus', allowedRoles: null, enforce: 'warn', notes: '', stats: stats(8, 8, 0, { backend: [5, 5], qa: [3, 3] }) },
  { provider: 'codex', model: '', allowedRoles: null, enforce: 'warn', notes: '', stats: stats(16, 13, 3, { dba: [9, 8], backend: [7, 5] }) },
  { provider: 'antigravity', model: '', allowedRoles: null, enforce: 'warn', notes: '', stats: stats(9, 7, 2, { frontend: [9, 7] }) },
  { provider: 'opencode', model: '', allowedRoles: null, enforce: 'warn', notes: '', stats: stats(10, 7, 3, { backend: [10, 7] }) },
  { provider: 'commandcode', model: '', allowedRoles: null, enforce: 'warn', notes: '', stats: stats(4, 3, 1, { desarrollo: [4, 3] }) },
  { provider: 'kimi', model: '', allowedRoles: ['desarrollo', 'backend', 'frontend', 'infra', 'qa'], enforce: 'warn', notes: '', stats: stats(0, 0, 0) },
  { provider: 'grok', model: '', allowedRoles: ['desarrollo', 'backend', 'frontend'], enforce: 'block', notes: 'Rompió el pipeline dos veces. No darle Infra ni QA hasta nuevo reporte. En Frontend va bien con tareas chicas.', stats: stats(12, 7, 5, { frontend: [5, 4], backend: [5, 3], desarrollo: [2, 1], infra: [4, 0] }) },
]
const MANUALS: Manual[] = ROLES.map((role) => ({
  role,
  prompt: `Eres ${role} en este estudio. Trabajas solo en tu oficina (worktree) y en tu rama. Sin dependencias nuevas sin permiso. Entrega con capturas.`,
  docs: role === 'frontend' ? ['docs/diseno/tokens.md', 'docs/frontend/convenciones.md'] : ['docs/convenciones.md'],
  skills: role === 'frontend' ? ['impeccable', 'playwright-cli'] : [],
  permissions: { edit: true, allow: ['npm run dev', 'npm test'], deny: ['npm install', 'git push', 'rm -rf'] },
  delivery: '1. Qué cambié y por qué\n2. Archivos tocados\n3. Cómo probarlo\n4. Riesgos o pendientes',
  requireScreenshots: role === 'frontend' || role === 'qa',
}))
const DIFF = `diff --git a/scripts/seed.ts b/scripts/seed.ts
index 3a1..9f2 100644
--- a/scripts/seed.ts
+++ b/scripts/seed.ts
@@ -1,8 +1,10 @@
 import { db } from '../src/db'
-const TOTAL = 10
+const TOTAL = 40
+const PREFIJO = 'seed_'

 export async function seed() {
+  await db.cliente.deleteMany({ where: { rfc: { startsWith: PREFIJO } } })
-  for (let i = 0; i < TOTAL; i++) crear(i)
+  for (let i = 0; i < TOTAL; i++) await crear(i, i % 4 === 0)
 }
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -6,3 +6,4 @@
   "test": "vitest",
+  "seed": "tsx scripts/seed.ts",
`

export function mockStudio(params: URLSearchParams): Partial<OrquestApi> {
  const speed = params.get('rapido') ? 0.2 : 1
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * speed))
  const between = (a: number, b: number) => a + Math.random() * (b - a)

  const employees: Employee[] = []
  const tasks: Task[] = []
  let bossOnline = false
  let proposed = [...PROPOSED]
  const messages: StudioSnapshot['messages'] = []
  /** La primera vez que se integra algo, choca: para ver cómo sale un conflicto. */
  let conflictPending = true
  let seq = 0
  const activityListeners = new Set<(id: string, a: { label: string; detail?: string; seconds?: number } | null) => void>()
  const STEPS = [['Pensando'], ['Leyendo', 'src/api.ts'], ['Planeando'], ['Escribiendo', 'src/api.ts'], ['Ejecutando', 'npm test']] as const
  const listeners = { board: new Set<(s: StudioSnapshot) => void>(), state: new Set<(id: string, s: EmployeeState) => void>(), hired: new Set<(e: Employee) => void>() }

  const snapshot = (): StudioSnapshot => {
    const hints: StudioSnapshot['hints'] = {}
    for (const e of employees) {
      if (tasks.some((t) => t.assignee === e.id && t.status === 'in_progress')) continue
      if (tasks.some((t) => t.assignee === e.id && ['delivered', 'in_qa', 'approved'].includes(t.status))) hints[e.id] = { state: 'delivering' }
    }
    return {
      resumable: [], repo: MOCK_REPO, goal: 'Tienda en línea con catálogo, clientes y pagos', bossOnline,
      slots: [...PEOPLE.map((p, i): Slot => ({ id: `s${i + 1}`, name: p.name, role: p.role, provider: p.provider, model: p.model, effort: 'medium', status: 'hired', employeeId: p.id })), ...(bossOnline ? proposed : [])],
      staff: PEOPLE.filter((p) => employees.some((e) => e.id === p.id)).map((p) => ({ ...p, online: true })),
      tasks: JSON.parse(JSON.stringify(tasks)) as Task[],
      messages, seq: { task: seq, slot: PEOPLE.length },
      hints, context: Object.fromEntries(employees.map((e, i) => [e.id, 20 + i * 11])), burnoutAt: 80,
    }
  }
  const publish = () => listeners.board.forEach((fn) => fn(snapshot()))
  const setState = (id: string, state: EmployeeState) => {
    const e = employees.find((x) => x.id === id)
    if (!e || e.state === state) return
    e.state = state
    listeners.state.forEach((fn) => fn(id, state))
    // Mientras trabaja, va cambiando lo que hace, como se vería en su terminal.
    if (state === 'working') {
      let i = 0
      const tick = () => {
        if (employees.find((x) => x.id === id)?.state !== 'working') return activityListeners.forEach((fn) => fn(id, null))
        const [label, detail] = STEPS[i++ % STEPS.length]
        activityListeners.forEach((fn) => fn(id, { label, detail, seconds: i * 4 }))
        setTimeout(tick, 4000 * speed)
      }
      tick()
    }
  }
  const hire = (id: string, role: string, provider: ProviderId, model?: string) => {
    const e: Employee = { id, provider, model, role, office: { path: `${MOCK_REPO}\\.orquest\\oficinas\\${id}`, branch: `orquest/${id}` }, state: 'idle', pid: 1000 + employees.length, warnings: [] }
    employees.push(e)
    listeners.hired.forEach((fn) => fn(e))
    publish()
  }

  async function cycle(id: string, delay: number) {
    await wait(delay)
    for (let n = 0; employees.some((e) => e.id === id); n++) {
      const [title, report, problem] = WORK[id][n % WORK[id].length]
      await wait(between(8000, 20000))
      const task: Task = { id: `T-${++seq}`, kind: id === 'e4' ? 'qa' : 'work', title, description: title, assignee: id, deps: [], status: 'ready', returns: 0, history: [{ at: Date.now(), text: 'Asignada por el jefe' }] }
      tasks.push(task)
      publish()
      for (;;) {
        await wait(9000) // el jefe se la lleva
        task.status = 'in_progress'
        setState(id, 'working')
        publish()
        await wait(between(18000, 30000))
        if (Math.random() < 0.3) {
          setState(id, 'blocked') // pide permiso: te necesita
          await wait(between(5000, 8000))
          setState(id, 'working')
          await wait(6000)
        }
        task.status = 'delivered'
        task.delivery = { at: Date.now(), report, screenshots: [], diffStat: ' 4 files changed, 120 insertions(+), 18 deletions(-)' }
        setState(id, 'idle')
        publish()
        await wait(22000) // imprime, va con el jefe y regresa
        if (task.returns > 0 || Math.random() < 0.65) break
        task.returns++
        task.status = 'ready'
        task.history.push({ at: Date.now(), text: problem })
        publish()
      }
      // Aprobada: se queda en Entregas hasta que la integres o la regreses.
      task.status = 'approved'
      task.qa = { at: Date.now(), report: 'Aprobado a la primera. Las pruebas nuevas pasan.', screenshots: [], verdict: 'pass' }
      publish()
    }
  }

  function start() {
    bossOnline = true
    hire('jefe', 'jefe', 'claude', 'opus')
    messages.push({ at: Date.now(), from: 'jefe', to: 'usuario', text: `Leí el repositorio. Propongo ${PEOPLE.length + PROPOSED.length} puestos; ${PROPOSED.length} nuevos esperan tu aprobación en Plantilla.` })
    PEOPLE.forEach((p, i) => setTimeout(() => {
      hire(p.id, p.role, p.provider, p.model)
      void cycle(p.id, 1000 + i * 4000)
    }, (1500 + i * 1200) * speed))
  }
  if (params.get('jefe') !== '0') start()

  const find = (id: string) => {
    const t = tasks.find((x) => x.id === id)
    if (!t) throw new Error(`No existe la tarea ${id}.`)
    return t
  }
  const on = <T,>(set: Set<T>) => (cb: T) => {
    set.add(cb)
    return () => void set.delete(cb)
  }
  return {
    pickRepo: async () => MOCK_REPO,
    openProject: async () => snapshot(),
    list: async () => employees.map((e) => ({ ...e })),
    hireBoss: async () => {
      if (!bossOnline) start()
    },
    sayToBoss: async (text) => {
      messages.push({ at: Date.now(), from: 'usuario', to: 'jefe', text })
      publish()
      setTimeout(() => {
        messages.push({ at: Date.now(), from: 'jefe', to: 'usuario', text: 'Hecho. Lo reparto entre el equipo y te aviso cuando haya entregas.' })
        publish()
      }, 2500 * speed)
    },
    approveTemplate: async () => {
      proposed = []
      publish()
    },
    checkSlots: async (slots) => slots.map((s) => {
      const d = DOSSIERS.find((x) => x.provider === s.provider && !x.model)
      if (!d || d.allowedRoles === null || d.allowedRoles.includes(s.role as Role)) return { ok: true }
      const why = `El expediente de ${s.provider} no tiene ${s.role} marcado`
      return d.enforce === 'block' ? { ok: false, reason: `${why}: está bloqueado.` } : { ok: true, warning: `${why}; el expediente solo avisa.` }
    }),
    library: async () => ({ dossiers: JSON.parse(JSON.stringify(DOSSIERS)), manuals: JSON.parse(JSON.stringify(MANUALS)) }),
    saveDossier: async (d) => {
      const at = DOSSIERS.findIndex((x) => x.provider === d.provider && x.model === d.model)
      if (at >= 0) Object.assign(DOSSIERS[at], d)
      else DOSSIERS.push({ ...d, stats: stats(0, 0, 0) })
    },
    saveManual: async (m) => void Object.assign(MANUALS.find((x) => x.role === m.role)!, m),
    taskDiff: async () => DIFF,
    mergeTask: async (id) => {
      if (conflictPending) {
        conflictPending = false
        throw new Error('Conflicto con main: CONFLICT (content) en scripts/seed.ts, 2 bloques.')
      }
      find(id).status = 'merged'
      publish()
    },
    returnTask: async (id, notes) => {
      const t = find(id)
      t.returns++
      t.status = 'ready'
      t.history.push({ at: Date.now(), text: notes || 'Regresa al escritorio' })
      publish()
    },
    fire: async (id) => {
      const i = employees.findIndex((e) => e.id === id)
      if (i >= 0) employees.splice(i, 1)
      publish()
    },
    rest: async () => {},
    scrollback: async (id) => `\x1b[32m${id}@oficina\x1b[0m ~/worktrees/${id} (orquest/${id})\r\n$ claude --resume\r\n\x1b[37m●\x1b[0m Leyendo src/components/AltaForm.tsx\r\n\x1b[32m●\x1b[0m Edité AltaForm.tsx  (+48 -12)\r\n\x1b[33m●\x1b[0m Corriendo pruebas: 14 pasan · 1 falla (validación de RFC)\r\n\x1b[37m●\x1b[0m Necesito validar el esquema con zod.\r\n$ `,
    journal: async () => '## Traspaso\n- Endpoint POST /sesiones listo; falta refresh token.\n- La migración 0042 asume que usuarios.email es único: confirmar con DBA.\n- Siguiente paso: pruebas de expiración con reloj falso.\n\n## Hechos\n- Contratada por el jefe (oficina be-12).\n- Entregó BE-11 → QA aprobó → integrada a la primera.\n- Contexto al 82 % → descansó → contexto 9 %.\n',
    changes: async () => [{ path: 'scripts/seed.ts', status: 'M' }, { path: 'package.json', status: 'M' }] as never,
    diff: async () => DIFF,
    // Capturas de ejemplo: imágenes del propio proyecto, para ver la pestaña con algo.
    captures: async () => ['escena/fondo.png', 'sprites/billar.png', 'sprites/camioneta-frente.png'].map((path, i) => ({ path: `docs/capturas/T3/${path.split('/').pop()}`, at: Date.now() - i * 60000, size: 1000 })),
    capture: async (_id, path) => {
      const name = path.split('/').pop()!
      const res = await fetch(name === 'fondo.png' ? '/escena/fondo.png' : `/sprites/${name}`)
      return { bytes: new Uint8Array(await res.arrayBuffer()), type: 'image/png' }
    },
    onBoard: on(listeners.board),
    onState: on(listeners.state),
    onHired: on(listeners.hired),
    onActivity: on(activityListeners),
    documents: async () => [
      { path: 'docs/plan-fase-1.md', at: Date.now() - 120000, size: 1800, status: 'nuevo' },
      { path: 'docs/decisiones.md', at: Date.now() - 3600000, size: 900, status: 'cambiado' },
      { path: 'README.md', at: Date.now() - 86400000, size: 400 },
    ],
    documentText: async (path) => `# ${path}\n\n## Fase 1: catálogo y clientes\n\n1. Modelo de datos (Beto)\n2. API de productos (Lupita), depende de 1\n3. Lista de productos (Nico), depende de 2\n4. Pruebas de alta (Paty)\n\n## Riesgos\n\n- La migración asume email único.\n- Sin cobro en esta fase.\n`,
  }
}
