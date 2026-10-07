import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CliStatus, Employee, HireRequest } from '../../../shared/ipc'

export const useStudio = defineStore('studio', () => {
  const clis = ref<CliStatus[]>([])
  const employees = ref<Employee[]>([])
  const repo = ref<string | null>(null)
  const selected = ref<string | null>(null)
  const error = ref<string | null>(null)

  const usable = computed(() => clis.value.filter((c) => c.installed && c.session !== false))
  const canHire = computed(() => usable.value.length > 0 && !!repo.value)

  async function detect() {
    clis.value = await window.orquest.detectClis()
  }

  async function pickRepo() {
    repo.value = (await window.orquest.pickRepo()) ?? repo.value
  }

  async function hire(req: Omit<HireRequest, 'repo'>) {
    if (!repo.value) return
    error.value = null
    try {
      await window.orquest.hire({ ...req, repo: repo.value })
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function fire(id: string, removeOffice: boolean) {
    await window.orquest.fire(id, removeOffice)
    employees.value = employees.value.filter((e) => e.id !== id)
    if (selected.value === id) selected.value = null
  }

  window.orquest.onHired((e) => {
    if (!employees.value.some((x) => x.id === e.id)) employees.value.push(e)
  })
  window.orquest.onState((id, state) => {
    const e = employees.value.find((x) => x.id === id)
    if (e) e.state = state
  })

  return { clis, employees, repo, selected, error, usable, canHire, detect, pickRepo, hire, fire }
})
