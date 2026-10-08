import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { buildPlan, emptyMap, exampleMap, isOfficeMap, mapIssues, type OfficeMap } from '../world/map'

const LOCAL_KEY = 'orquest.oficina'
const UNDO_LIMIT = 80

/** En la app se guarda con los datos del estudio; en la página de prueba, en el navegador. */
async function read(): Promise<unknown> {
  if (window.orquest?.loadOffice) return window.orquest.loadOffice()
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null')
  } catch {
    return null
  }
}

async function write(map: OfficeMap) {
  // Copia plana: lo reactivo no cruza a otro proceso.
  const plain = JSON.parse(JSON.stringify(map))
  if (window.orquest?.saveOffice) return window.orquest.saveOffice(plain)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(plain))
}

/** La oficina del estudio: la que dibujó el usuario o, mientras no dibuje, la de ejemplo. */
export const useOffice = defineStore('office', () => {
  const map = shallowRef<OfficeMap>(exampleMap())
  const past = shallowRef<OfficeMap[]>([])
  const error = ref<string | null>(null)
  const issues = computed(() => mapIssues(buildPlan(map.value)))
  const canUndo = computed(() => past.value.length > 0)

  let pending: ReturnType<typeof setTimeout> | undefined
  function save() {
    clearTimeout(pending)
    // Un trazo son muchos cambios seguidos: se guarda cuando se calma.
    pending = setTimeout(() => {
      write(map.value).then(
        () => (error.value = null),
        (err) => (error.value = `No se pudo guardar la oficina: ${(err as Error).message}`),
      )
    }, 400)
  }

  async function load() {
    const saved = await read().catch(() => null)
    if (isOfficeMap(saved)) map.value = saved
  }

  /** Cada cambio del modo creativo entra por aquí: se puede deshacer y se guarda solo. */
  function set(next: OfficeMap) {
    past.value = [...past.value.slice(-UNDO_LIMIT + 1), map.value]
    map.value = next
    save()
  }

  function undo() {
    const prev = past.value.at(-1)
    if (!prev) return
    past.value = past.value.slice(0, -1)
    map.value = prev
    save()
  }

  /** Lienzo en blanco, del mismo tamaño. */
  const clear = () => set(emptyMap(map.value.w, map.value.h))
  const useExample = () => set(exampleMap())

  return { map, issues, canUndo, error, load, set, undo, clear, useExample }
})
