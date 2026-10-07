import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CliStatus, Employee, EmployeeState, HireRequest } from '../../../shared/ipc'
import { LOOKS } from '../world/behavior'

export type Overlay = 'hire' | 'board' | 'inbox' | null
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

  const usable = computed(() => clis.value.filter((c) => c.installed && c.session !== false))
  const canHire = computed(() => usable.value.length > 0 && !!repo.value)
  const selectedEmployee = computed(() => employees.value.find((e) => e.id === selected.value))
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

  function openProject(path: string) {
    repo.value = path
    recents.value = [path, ...recents.value.filter((r) => r !== path)].slice(0, 8)
    saveRecents(recents.value)
    screen.value = 'office'
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

  async function hire(req: Omit<HireRequest, 'repo'>): Promise<boolean> {
    if (!repo.value) return false
    error.value = null
    try {
      await window.orquest.hire({ ...req, repo: repo.value })
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  async function fire(id: string) {
    await window.orquest.fire(id, false)
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
  window.orquest.onState((id, state) => {
    const e = employees.value.find((x) => x.id === id)
    if (!e) return
    e.state = state
    log(id, LOOKS[state].label, state)
  })

  return {
    screen, clis, detecting, employees, repo, recents, selected, overlay, drawerMode, error, activity,
    usable, canHire, selectedEmployee, counts,
    detect, openProject, pickProject, goHome, hire, fire, select,
  }
})
