/**
 * Lo que lleva usado cada cuenta de su límite, para el botón «uso» del dock y
 * el panel Uso. Se vuelve a pedir cada 30 s mientras alguien lo mira.
 * Solo monitoreo: nada aquí cambia de cuenta.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Account, UsageWindow } from '../../../core/accounts'

const EVERY_MS = 30_000

/** El tramo corto (las 5 horas) y el de la semana de una cuenta. */
export function windowsOf(a: Account): { short?: UsageWindow; week?: UsageWindow } {
  const list = [...(a.usage?.windows ?? [])].sort((x, y) => x.minutes - y.minutes)
  return { short: list[0], week: list.find((w) => w.minutes >= 7 * 24 * 60 && w !== list[0]) }
}

export const useUsage = defineStore('usage', () => {
  const accounts = ref<Account[]>([])
  const loaded = ref(false)
  let watchers = 0
  let timer: ReturnType<typeof setInterval> | undefined

  async function load() {
    accounts.value = await window.orquest.accounts().catch(() => accounts.value)
    loaded.value = true
  }
  /** Quien muestra el uso lo pide al montarse y lo suelta al irse. */
  function watch() {
    if (watchers++ === 0) {
      void load()
      timer = setInterval(load, EVERY_MS)
    }
    return () => {
      if (--watchers === 0) clearInterval(timer)
    }
  }

  /** Lo más alto que lleva usado alguna cuenta en su tramo corto: lo que enseña el dock. */
  const peak = computed(() => {
    const used = accounts.value.map((a) => windowsOf(a).short?.used).filter((n): n is number => typeof n === 'number')
    return used.length ? Math.round(Math.max(...used)) : null
  })

  return { accounts, loaded, load, watch, peak }
})
