import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Activity, BossRequest, CliStatus, Employee, EmployeeState, GroupCheck, ProjectSummary, SlotEdit, StudioSnapshot, Task, Requirement, RepoCheck, BlockKind, Effort, ProviderId } from '../../../shared/ipc'
import { T } from '../../../core/i18n'
import { LOOKS } from '../world/behavior'
import { CAST_ORDER, CHARACTER_GENDER, CHARACTERS, DEFAULT_BOSS, fits } from '../characters'
import { genderOf } from '../../../core/gender'

export type Overlay = 'hire' | 'board' | 'inbox' | 'boss' | 'library' | 'plans' | 'accounts' | null
export type DrawerMode = 'float' | 'split'

export interface ActivityItem {
  at: number
  text: string
  state?: EmployeeState
}

const RECENTS_KEY = 'orquest.recents'

/** Un proyecto abierto antes en esta máquina. */
export interface Recent {
  path: string
  /** Cuándo se abrió por última vez; 0 si viene de una versión que no lo guardaba. */
  at: number
  /** Es una carpeta que agrupa repositorios y se abrió como un solo proyecto. */
  group?: boolean
  /** Lo guardado del proyecto; undefined mientras se pregunta, null si no hay nada. */
  summary?: ProjectSummary | null
}

/** Lo que una versión anterior guardaba en el navegador; se pasa una vez a la carpeta de la app. */
function legacyRecents(): Recent[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as (string | Recent)[]
    return saved.map((r) => (typeof r === 'string' ? { path: r, at: 0 } : { path: r.path, at: r.at, ...(r.group ? { group: true } : {}) }))
  } catch {
    return []
  }
}

export const useStudio = defineStore('studio', () => {
  const screen = ref<'home' | 'office'>('home')
  /** La versión instalada, para mostrarla junto al nombre de la app. */
  const version = ref('')
  void window.orquest.version().then((v) => (version.value = v), () => {})
  const clis = ref<CliStatus[]>([])
  /** Lo que hace falta instalado además de las CLIs (git). */
  const requirements = ref<Requirement[]>([])
  const detecting = ref(false)
  const employees = ref<Employee[]>([])
  const repo = ref<string | null>(null)
  const recents = ref<Recent[]>([])
  /** Se conserva lo ya preguntado de cada proyecto (su resumen) al recargar la lista. */
  const withSummaries = (list: Recent[]) => list.map((r) => ({ ...r, summary: recents.value.find((x) => x.path === r.path)?.summary }))
  /** La lista guardada en la carpeta de la app; la primera vez trae la que estaba en el navegador. */
  async function loadRecents() {
    let list = await window.orquest.recents().catch(() => [] as Recent[])
    const old = legacyRecents()
    if (old.length) {
      list = await window.orquest.importRecents(old).catch(() => list)
      try {
        localStorage.removeItem(RECENTS_KEY)
      } catch {
        // Si no se puede borrar, la siguiente importación no repite nada.
      }
    }
    recents.value = withSummaries(list)
  }
  /** Quita un proyecto de la lista de Inicio; su carpeta no se toca. */
  async function removeRecent(path: string) {
    recents.value = withSummaries(await window.orquest.removeRecent(path))
  }
  /** Cuándo terminó la última revisión de CLIs. */
  const checkedAt = ref<number | null>(null)
  const selected = ref<string | null>(null)
  const overlay = ref<Overlay>(null)
  const drawerMode = ref<DrawerMode>('float')
  /** El panel del empleado a pantalla completa, como un IDE: archivos a un lado, su terminal al otro. */
  const drawerFull = ref(false)
  const error = ref<string | null>(null)
  const activity = ref<Record<string, ActivityItem[]>>({})
  const board = ref<StudioSnapshot | null>(null)
  const notices = ref<{ id: number; text: string }[]>([])
  /** Qué está haciendo cada quien mientras trabaja (leído de su terminal). */
  const doing = ref<Record<string, Activity>>({})

  // ── Personajes: el del jefe lo eliges al contratarlo; los demás se reparten al llegar.
  const bossKey = (path: string | null) => `orquest.jefe.${path ?? ''}`
  const bossCharacter = ref(DEFAULT_BOSS)
  /** Quién es qué personaje en este proyecto; no cambia aunque alguien se vaya. */
  const cast = ref<Record<string, number>>({})
  function loadBossCharacter(path: string) {
    let saved = NaN
    try {
      saved = Number(localStorage.getItem(bossKey(path)))
    } catch {
      // Sin almacenamiento se queda el de siempre.
    }
    bossCharacter.value = CHARACTERS.includes(saved) ? saved : DEFAULT_BOSS
    cast.value = {}
  }
  function setBossCharacter(n: number) {
    bossCharacter.value = n
    cast.value = {}
    try {
      localStorage.setItem(bossKey(board.value?.repo ?? repo.value), String(n))
    } catch {
      // Solo dura esta sesión.
    }
  }
  function characterOf(id: string): number {
    if (id === 'jefe') return bossCharacter.value
    // Un nombre de mujer lleva personaje de mujer, y uno de hombre, de hombre. Si al repartirlo aún no
    // se sabía su nombre (el tablero llega después), se corrige la primera vez que no cuadre.
    const g = genderOf(nameOf(id))
    const mine = cast.value[id]
    if (!mine || !fits(mine, g)) {
      const free = CAST_ORDER.filter((n) => n !== bossCharacter.value)
      const used = new Set(Object.entries(cast.value).filter(([who]) => who !== id).map(([, n]) => n))
      // Primero los que son claramente de su género; los que valen para cualquiera, después.
      const ok = g ? [...free.filter((n) => CHARACTER_GENDER[n] === g), ...free.filter((n) => !CHARACTER_GENDER[n])] : free
      cast.value[id] = ok.find((n) => !used.has(n)) ?? free.find((n) => !used.has(n) && !g) ?? ok[Object.keys(cast.value).length % Math.max(1, ok.length)] ?? free[0]
    }
    return cast.value[id]
  }

  // ── Estado en calma: entre un paso y otro una CLI se queda quieta un instante.
  // Para lo que se cuenta a la vista sigue trabajando hasta que de verdad para;
  // si no, la barra parpadea con cada paso. Pedir algo o cerrarse sí se nota al momento.
  const CALM_MS = 3000
  const calm = ref<Record<string, EmployeeState>>({})
  const calmTimers = new Map<string, ReturnType<typeof setTimeout>>()
  watch(
    () => employees.value.map((e) => `${e.id}:${e.state}`).join(),
    () => {
      for (const e of employees.value) {
        const pause = calm.value[e.id] === 'working' && (e.state === 'idle' || e.state === 'starting')
        if (pause) {
          if (calmTimers.has(e.id)) continue
          calmTimers.set(e.id, setTimeout(() => {
            calmTimers.delete(e.id)
            const now = employees.value.find((x) => x.id === e.id)
            if (now) calm.value[e.id] = now.state
          }, CALM_MS))
        } else {
          clearTimeout(calmTimers.get(e.id))
          calmTimers.delete(e.id)
          calm.value[e.id] = e.state
        }
      }
    },
    { immediate: true },
  )
  /** El estado de alguien sin los parpadeos entre paso y paso. */
  /**
   * Lo que el usuario lleva escrito en el chat de cada quien, por proyecto. Vive aquí y no en el
   * panel: al irse a otra pantalla y volver, el panel se arma de nuevo y lo escrito se perdía.
   */
  const drafts = ref<Record<string, string>>({})
  const draft = (id: string) =>
    computed({
      get: () => drafts.value[`${repo.value}|${id}`] ?? '',
      set: (text: string) => (drafts.value = { ...drafts.value, [`${repo.value}|${id}`]: text }),
    })

  /** Quien no puede trabajar (su CLI lo dijo) espera como si nada: se ve como que te necesita. */
  const failed = (e: Employee) => !!e.problem && e.state !== 'working' && e.state !== 'exited'
  /** Su terminal ya arrancó pero aún no le llega su primer mensaje: va llegando (ver StudioSnapshot.arriving). */
  const arriving = (id: string) => !!board.value?.arriving?.some((a) => a.id === id)
  const calmStateOf = (e: Employee): EmployeeState =>
    failed(e) ? 'blocked' : arriving(e.id) && e.state !== 'blocked' && e.state !== 'exited' ? 'starting' : calm.value[e.id] ?? e.state

  const usable = computed(() => clis.value.filter((c) => c.installed && c.session !== false))
  const canHire = computed(() => usable.value.length > 0 && !!repo.value)
  const selectedEmployee = computed(() => employees.value.find((e) => e.id === selected.value))
  const proposal = computed(() => board.value?.slots.filter((s) => s.status === 'proposed') ?? [])
  const inbox = computed(() => board.value?.tasks.filter((t) => t.status === 'approved') ?? [])
  const bossOnline = computed(() => !!board.value?.bossOnline)
  /** Nombre del empleado; el jefe lleva el que le pusiste o, si no, "Jefe". */
  const nameOf = (id: string): string => (id === 'jefe' ? board.value?.boss?.name || T`Jefe` : board.value?.staff.find((m) => m.id === id)?.name ?? id)
  const gamingCount = computed(() => Object.values(board.value?.hints ?? {}).filter((h) => h.state === 'gaming').length)
  const rest = (id: string) => attempt(() => window.orquest.rest(id))
  const bringBack = (id: string) => attempt(() => window.orquest.bringBack(id))
  const tasksOf = (id: string): Task[] => board.value?.tasks.filter((t) => t.assignee === id) ?? []
  const counts = computed(() => {
    const c: Partial<Record<EmployeeState, number>> = {}
    for (const e of employees.value) {
      const s = failed(e) ? 'blocked' : e.state
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  })

  function log(id: string, text: string, state?: EmployeeState) {
    ;(activity.value[id] ??= []).push({ at: Date.now(), text, state })
  }

  async function detect() {
    detecting.value = true
    try {
      requirements.value = await window.orquest.requirements().catch(() => [])
      clis.value = await window.orquest.detectClis()
      checkedAt.value = Date.now()
      // Los modelos llegan después: algunas CLIs se los piden a su servidor.
      void window.orquest.cliModels().then(
        (models) => (clis.value = clis.value.map((c) => ({ ...c, models: models[c.id] ?? c.models }))),
        () => {},
      )
    } finally {
      detecting.value = false
    }
  }

  /** Completa la lista de recientes con lo que hay guardado de cada uno. */
  async function loadSummaries() {
    const list = recents.value
    if (!list.length) return
    const got = await window.orquest.projectSummaries(list.map((r) => r.path)).catch(() => [])
    recents.value = list.map((r, i) => ({ ...r, summary: got[i] ?? null }))
  }

  /** Quién está en la oficina de este proyecto. */
  async function loadEmployees() {
    const root = board.value?.repo
    if (!root) return
    // Git da la raíz con diagonales y las oficinas se arman con las del sistema: se comparan parejas.
    const same = (p: string) => p.split('\\').join('/').toLowerCase()
    employees.value = (await window.orquest.list()).filter((e) => same(e.office.path).startsWith(same(root)))
    for (const e of employees.value) if (e.state === 'blocked') readBlock(e.id)
  }

  /**
   * Al abrir un proyecto que quedó con gente se pregunta si se retoma. Decir
   * "ahora no" no despide a nadie: el equipo sigue contratado con sus
   * terminales cerradas, y se puede retomar después desde el aviso de la oficina.
   */
  const resuming = ref(false)
  const resumeAsked = ref(false)
  async function resumeProject(yes: boolean) {
    resumeAsked.value = true
    if (!yes) return
    resuming.value = true
    await attempt(() => window.orquest.resumeProject())
    await loadEmployees()
    resuming.value = false
  }

  /** La carpeta que se quiso abrir y lo que le falta para servir (ver RepoSetup.vue). */
  const repoIssue = ref<({ path: string; group?: GroupCheck } & RepoCheck) | null>(null)
  /** `asGroup`: la carpeta agrupa repositorios y el usuario eligió abrirla como un solo proyecto. */
  async function openProject(path: string, asGroup = false) {
    error.value = null
    // Antes de abrir: ¿es un repositorio con al menos un commit? Si no, se le ofrece al usuario prepararlo.
    const check = await window.orquest.checkRepo(path).catch(() => null)
    // Una carpeta que agrupa repositorios se abre entera si así se eligió, ahora o la vez anterior (viene en recientes).
    const group = !!check && check.state !== 'ok' && check.inside.length > 0 && (asGroup || recents.value.some((r) => r.path === path && r.group))
    if (check && check.state !== 'ok' && !group) {
      repoIssue.value = { path, ...check, group: check.inside.length ? await window.orquest.checkGroup(path).catch(() => undefined) : undefined }
      return
    }
    repoIssue.value = null
    try {
      board.value = await window.orquest.openProject(path, group)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    repo.value = path
    loadBossCharacter(board.value.repo)
    // Se guarda la raíz del repo: es con la que el estudio recuerda el proyecto.
    const root = board.value.repo
    if (path !== root) await window.orquest.removeRecent(path).catch(() => {})
    recents.value = withSummaries(await window.orquest.touchRecent({ path: root, at: Date.now(), ...(group ? { group: true } : {}) }).catch(() => recents.value))
    resumeAsked.value = false
    await loadEmployees()
    screen.value = 'office'
    // Si quedó gente al cerrar, primero se pregunta si se retoma; si no hay jefe, a contratarlo.
    overlay.value = board.value.bossOnline || board.value.resumable.length ? null : 'boss'
  }

  /** Corre una acción y deja el motivo del rechazo en error. */
  async function attempt(fn: () => Promise<unknown>): Promise<boolean> {
    error.value = null
    try {
      await fn()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  const hireBoss = (req: BossRequest) => attempt(() => window.orquest.hireBoss(req))
  const approveTemplate = (slots: SlotEdit[]) => attempt(() => window.orquest.approveTemplate(slots))
  const requestReview = (id: string) => attempt(() => window.orquest.requestReview(id))
  const stopReview = (id: string) => attempt(() => window.orquest.stopReview(id))
  const setTeamApproval = (on: boolean) => attempt(() => window.orquest.setTeamApproval(on))
  const retune = (id: string, change: { provider?: ProviderId; model?: string; effort?: Effort; account?: string }) => attempt(() => window.orquest.retune(id, change))
  const mergeTask = (id: string) => attempt(() => window.orquest.mergeTask(id))
  const returnTask = (id: string, notes: string) => attempt(() => window.orquest.returnTask(id, notes))
  /** Cómo quedó su rama ('failed': no se pudo quitar lo que trajo); null si no se pudo descartar. */
  async function discardTask(id: string, reason?: string) {
    let undone: Awaited<ReturnType<typeof window.orquest.discardTask>> | null = null
    await attempt(async () => (undone = await window.orquest.discardTask(id, reason)))
    return undone
  }
  const sayToBoss = (text: string) => attempt(() => window.orquest.sayToBoss(text))
  const answerQuestion = (id: string, text: string) => attempt(() => window.orquest.answerQuestion(id, text))

  let noticeSeq = 0
  function notice(text: string) {
    const id = ++noticeSeq
    notices.value.push({ id, text })
    setTimeout(() => (notices.value = notices.value.filter((n) => n.id !== id)), 7000)
  }

  /** Prepara la carpeta pendiente (git init y primer commit, lo que falte) y la abre. */
  async function prepareAndOpen() {
    const pending = repoIssue.value
    if (!pending) return
    error.value = null
    try {
      await window.orquest.prepareRepo(pending.path)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    await openProject(pending.path)
  }

  /** La carpeta pendiente pasa a agrupar repositorios: se crean los que se nombren y se abre como un solo proyecto. */
  async function createGroupAndOpen(names: string[]) {
    const pending = repoIssue.value
    if (!pending) return
    error.value = null
    try {
      await window.orquest.createGroup(pending.path, names)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    await openProject(pending.path, true)
  }

  async function pickProject() {
    const path = await window.orquest.pickRepo()
    if (path) openProject(path)
  }

  function goHome() {
    screen.value = 'home'
    selected.value = null
    overlay.value = null
  }

  async function fire(id: string) {
    if (!(await attempt(() => window.orquest.fire(id)))) return
    log(id, T`despedido`)
    employees.value = employees.value.filter((e) => e.id !== id)
    if (selected.value === id) selected.value = null
  }

  function select(id: string | null) {
    // Al jefe se le busca en su ventana (el chat). Su terminal y sus archivos se abren solo desde ahí: `openBossDesk`.
    if (id === 'jefe') {
      selected.value = null
      overlay.value = 'boss'
      return
    }
    selected.value = id
    if (id) overlay.value = null
  }
  /** El panel del jefe con su terminal y sus archivos. Solo se llega desde su ventana. */
  function openBossDesk() {
    selected.value = 'jefe'
    overlay.value = null
  }

  window.orquest.onHired((e) => {
    if (employees.value.some((x) => x.id === e.id)) return
    employees.value.push(e)
    log(e.id, T`contratado como ${e.role}`)
    for (const w of e.warnings) log(e.id, `⚠ ${w}`)
  })
  window.orquest.onBoard((b) => {
    // Quien iba llegando y ya recibió su primer mensaje: llegó. Lo que ya estaba al abrir no se anuncia.
    const before = board.value?.repo === b.repo ? (board.value.arriving ?? []) : []
    board.value = b
    for (const a of before) {
      if (b.arriving?.some((x) => x.id === a.id)) continue
      const e = employees.value.find((x) => x.id === a.id)
      if (e && e.state !== 'exited') notice(a.id === 'jefe' && !b.boss?.name ? T`El jefe llegó a su escritorio.` : T`${nameOf(a.id)} llegó a su escritorio.`)
    }
  })
  window.orquest.onNotice(notice)
  window.orquest.onActivity((id, a) => {
    if (a) doing.value = { ...doing.value, [id]: a }
    else if (doing.value[id]) {
      const { [id]: _gone, ...rest } = doing.value
      doing.value = rest
    }
  })
  // ── Por qué está detenido cada quien, cuando es una pantalla conocida de su CLI
  // (confiar en la carpeta, actualizar, iniciar sesión): el aviso lo dice en vez de
  // un «te necesita» a secas.
  const blocks = ref<Record<string, BlockKind>>({})
  function readBlock(id: string) {
    const still = () => employees.value.find((x) => x.id === id)?.state === 'blocked'
    // La pantalla puede seguir dibujándose: se mira dos veces.
    for (const ms of [300, 1500]) {
      setTimeout(async () => {
        if (!still()) return
        const kind = await window.orquest.blockedBy(id).catch(() => null)
        if (kind && still()) blocks.value = { ...blocks.value, [id]: kind }
      }, ms)
    }
  }
  /** Contesta desde aquí la pantalla que lo detiene (confiar en la carpeta, «ahora no» a otro modelo). */
  const answerBlock = (id: string) => attempt(() => window.orquest.answerBlock(id))
  /** Reinicia su terminal cuando quedó atorada. */
  const restart = (id: string) => attempt(() => window.orquest.restart(id))

  // Su CLI dice que no puede trabajar (modelo que no tiene, sin saldo): se queda a la vista en su panel.
  window.orquest.onProblem((id, problem) => {
    const e = employees.value.find((x) => x.id === id)
    if (!e) return
    e.problem = problem ?? undefined
    if (problem) log(id, `⚠ ${problem}`)
  })
  window.orquest.onState((id, state) => {
    const e = employees.value.find((x) => x.id === id)
    if (!e) return
    e.state = state
    log(id, LOOKS[state].label, state)
    if (state === 'blocked') readBlock(id)
    else if (blocks.value[id]) {
      const { [id]: _gone, ...rest } = blocks.value
      blocks.value = rest
    }
  })

  return {
    blocks, answerBlock, restart, draft,
    version,
    screen, clis, requirements, repoIssue, prepareAndOpen, createGroupAndOpen, detecting, checkedAt, employees, repo, recents, selected, overlay, drawerMode, drawerFull, error, activity, board, notices, doing,
    bossCharacter, setBossCharacter, characterOf,
    usable, canHire, selectedEmployee, counts, proposal, inbox, bossOnline, tasksOf, nameOf, calmStateOf, gamingCount, rest, bringBack, resuming, resumeAsked, resumeProject,
    detect, loadRecents, removeRecent, loadSummaries, openProject, pickProject, goHome, fire, select, openBossDesk, attempt, hireBoss, approveTemplate, retune, setTeamApproval, requestReview, stopReview, mergeTask, returnTask, discardTask, sayToBoss, answerQuestion, notice,
  }
})
