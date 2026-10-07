import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BossRequest, CliStatus, Employee, EmployeeState, SlotEdit, StudioSnapshot, Task } from '../../../shared/ipc'
import { LOOKS } from '../world/behavior'

export type Overlay = 'hire' | 'board' | 'inbox' | 'boss' | 'library' | null
export type DrawerMode = 'float' | 'split'

export interface ActivityItem {
  at: number
  text: string
  state?: EmployeeState
}

const RECENTS_KEY = 'orquest.recents'

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveRecents(list: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list))
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
  const recents = ref<string[]>(loadRecents())
  const selected = ref<string | null>(null)
  const overlay = ref<Overlay>(null)
  const drawerMode = ref<DrawerMode>('float')
  const error = ref<string | null>(null)
  const activity = ref<Record<string, ActivityItem[]>>({})
  const board = ref<StudioSnapshot | null>(null)
  const notices = ref<{ id: number; text: string }[]>([])

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
    } finally {
      detecting.value = false
    }
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
    recents.value = [path, ...recents.value.filter((r) => r !== path)].slice(0, 8)
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
    screen, clis, detecting, employees, repo, recents, selected, overlay, drawerMode, error, activity, board, notices,
    usable, canHire, selectedEmployee, counts, proposal, inbox, bossOnline, tasksOf, nameOf, gamingCount, rest,
    detect, openProject, pickProject, goHome, fire, select, attempt, hireBoss, approveTemplate, mergeTask, returnTask, sayToBoss, notice,
  }
})
