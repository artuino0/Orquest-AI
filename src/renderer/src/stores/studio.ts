import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BossRequest, CliStatus, Employee, EmployeeState, ProjectSummary, SlotEdit, StudioSnapshot, Task } from '../../../shared/ipc'
import { LOOKS } from '../world/behavior'
import { CAST_ORDER, CHARACTERS, DEFAULT_BOSS } from '../characters'

export type Overlay = 'hire' | 'board' | 'inbox' | 'boss' | 'library' | null
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
  /** Lo guardado del proyecto; undefined mientras se pregunta, null si no hay nada. */
  summary?: ProjectSummary | null
}

function loadRecents(): Recent[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as (string | Recent)[]
    return saved.map((r) => (typeof r === 'string' ? { path: r, at: 0 } : { path: r.path, at: r.at }))
  } catch {
    return []
  }
}

function saveRecents(list: Recent[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.map(({ path, at }) => ({ path, at }))))
  } catch {
    // Sin almacenamiento solo se pierden los recientes.
  }
}

export const useStudio = defineStore('studio', () => {
  const screen = ref<'home' | 'office'>('home')
  const clis = ref<CliStatus[]>([])
  const detecting = ref(false)
  const employees = ref<Employee[]>([])
  const repo = ref<string | null>(null)
  const recents = ref<Recent[]>(loadRecents())
  /** Cuándo terminó la última revisión de CLIs. */
  const checkedAt = ref<number | null>(null)
  const selected = ref<string | null>(null)
  const overlay = ref<Overlay>(null)
  const drawerMode = ref<DrawerMode>('float')
  const error = ref<string | null>(null)
  const activity = ref<Record<string, ActivityItem[]>>({})
  const board = ref<StudioSnapshot | null>(null)
  const notices = ref<{ id: number; text: string }[]>([])

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
    if (!cast.value[id]) {
      const free = CAST_ORDER.filter((n) => n !== bossCharacter.value)
      const used = new Set(Object.values(cast.value))
      cast.value[id] = free.find((n) => !used.has(n)) ?? free[Object.keys(cast.value).length % free.length]
    }
    return cast.value[id]
  }

  const usable = computed(() => clis.value.filter((c) => c.installed && c.session !== false))
  const canHire = computed(() => usable.value.length > 0 && !!repo.value)
  const selectedEmployee = computed(() => employees.value.find((e) => e.id === selected.value))
  const proposal = computed(() => board.value?.slots.filter((s) => s.status === 'proposed') ?? [])
  const inbox = computed(() => board.value?.tasks.filter((t) => t.status === 'approved') ?? [])
  const bossOnline = computed(() => !!board.value?.bossOnline)
  /** Nombre del empleado (el jefe es "Jefe"). */
  const nameOf = (id: string): string => (id === 'jefe' ? 'Jefe' : board.value?.staff.find((m) => m.id === id)?.name ?? id)
  const gamingCount = computed(() => Object.values(board.value?.hints ?? {}).filter((h) => h.state === 'gaming').length)
  const rest = (id: string) => attempt(() => window.orquest.rest(id))
  const bringBack = (id: string) => attempt(() => window.orquest.bringBack(id))
  const tasksOf = (id: string): Task[] => board.value?.tasks.filter((t) => t.assignee === id) ?? []
  const counts = computed(() => {
    const c: Partial<Record<EmployeeState, number>> = {}
    for (const e of employees.value) c[e.state] = (c[e.state] ?? 0) + 1
    return c
  })

  function log(id: string, text: string, state?: EmployeeState) {
    ;(activity.value[id] ??= []).push({ at: Date.now(), text, state })
  }

  async function detect() {
    detecting.value = true
    try {
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

  async function openProject(path: string) {
    error.value = null
    try {
      board.value = await window.orquest.openProject(path)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    repo.value = path
    loadBossCharacter(board.value.repo)
    // Se guarda la raíz del repo: es con la que el estudio recuerda el proyecto.
    const root = board.value.repo
    recents.value = [{ path: root, at: Date.now() }, ...recents.value.filter((r) => r.path !== root && r.path !== path)].slice(0, 8)
    saveRecents(recents.value)
    employees.value = (await window.orquest.list()).filter((e) => e.office.path.startsWith(board.value!.repo))
    screen.value = 'office'
    overlay.value = board.value.bossOnline ? null : 'boss'
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
  const mergeTask = (id: string) => attempt(() => window.orquest.mergeTask(id))
  const returnTask = (id: string, notes: string) => attempt(() => window.orquest.returnTask(id, notes))
  const sayToBoss = (text: string) => attempt(() => window.orquest.sayToBoss(text))

  let noticeSeq = 0
  function notice(text: string) {
    const id = ++noticeSeq
    notices.value.push({ id, text })
    setTimeout(() => (notices.value = notices.value.filter((n) => n.id !== id)), 7000)
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
    log(id, 'despedido')
    employees.value = employees.value.filter((e) => e.id !== id)
    if (selected.value === id) selected.value = null
  }

  function select(id: string | null) {
    selected.value = id
    if (id) overlay.value = null
  }

  window.orquest.onHired((e) => {
    if (employees.value.some((x) => x.id === e.id)) return
    employees.value.push(e)
    log(e.id, `contratado como ${e.role}`)
    for (const w of e.warnings) log(e.id, `⚠ ${w}`)
  })
  window.orquest.onBoard((b) => (board.value = b))
  window.orquest.onNotice(notice)
  window.orquest.onState((id, state) => {
    const e = employees.value.find((x) => x.id === id)
    if (!e) return
    e.state = state
    log(id, LOOKS[state].label, state)
  })

  return {
    screen, clis, detecting, checkedAt, employees, repo, recents, selected, overlay, drawerMode, error, activity, board, notices,
    bossCharacter, setBossCharacter, characterOf,
    usable, canHire, selectedEmployee, counts, proposal, inbox, bossOnline, tasksOf, nameOf, gamingCount, rest, bringBack,
    detect, loadSummaries, openProject, pickProject, goHome, fire, select, attempt, hireBoss, approveTemplate, mergeTask, returnTask, sayToBoss, notice,
  }
})
