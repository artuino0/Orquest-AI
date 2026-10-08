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
import type { Employee, EmployeeState, OrquestApi, ProviderId, StudioSnapshot, Task } from '../../shared/ipc'

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

export function mockStudio(params: URLSearchParams): Partial<OrquestApi> {
  const speed = params.get('rapido') ? 0.2 : 1
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * speed))
  const between = (a: number, b: number) => a + Math.random() * (b - a)

  const employees: Employee[] = []
  const tasks: Task[] = []
  let bossOnline = false
  let seq = 0
  const listeners = { board: new Set<(s: StudioSnapshot) => void>(), state: new Set<(id: string, s: EmployeeState) => void>(), hired: new Set<(e: Employee) => void>() }

  const snapshot = (): StudioSnapshot => {
    const hints: StudioSnapshot['hints'] = {}
    for (const e of employees) {
      if (tasks.some((t) => t.assignee === e.id && t.status === 'in_progress')) continue
      if (tasks.some((t) => t.assignee === e.id && ['delivered', 'in_qa', 'approved'].includes(t.status))) hints[e.id] = { state: 'delivering' }
    }
    return {
      repo: MOCK_REPO, goal: 'Tienda en línea con catálogo, clientes y pagos', bossOnline,
      slots: PEOPLE.map((p, i) => ({ id: `s${i + 1}`, name: p.name, role: p.role, provider: p.provider, model: p.model, status: 'hired', employeeId: p.id })),
      staff: PEOPLE.filter((p) => employees.some((e) => e.id === p.id)).map((p) => ({ ...p, online: true })),
      tasks: JSON.parse(JSON.stringify(tasks)) as Task[],
      messages: [], seq: { task: seq, slot: PEOPLE.length },
      hints, context: Object.fromEntries(employees.map((e, i) => [e.id, 20 + i * 11])), burnoutAt: 80,
    }
  }
  const publish = () => listeners.board.forEach((fn) => fn(snapshot()))
  const setState = (id: string, state: EmployeeState) => {
    const e = employees.find((x) => x.id === id)
    if (!e || e.state === state) return
    e.state = state
    listeners.state.forEach((fn) => fn(id, state))
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
      // Aprobada: espera en Entregas a que la integres (o se integra sola al rato).
      task.status = 'approved'
      publish()
      await wait(25000)
      if (task.status === 'approved') {
        task.status = 'merged'
        publish()
      }
    }
  }

  function start() {
    bossOnline = true
    hire('jefe', 'jefe', 'claude', 'opus')
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
    sayToBoss: async () => {},
    approveTemplate: async () => {},
    mergeTask: async (id) => {
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
    onBoard: on(listeners.board),
    onState: on(listeners.state),
    onHired: on(listeners.hired),
  }
}
