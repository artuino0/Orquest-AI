/**
 * El editor del proyecto (panel Editor del lienzo): las pestañas abiertas de
 * la carpeta del proyecto, no de la oficina de un agente.
 *
 * Cerrar el panel no cierra los archivos: las pestañas se quedan hasta que se
 * cierran una por una o se sale del proyecto.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { T } from '../../../core/i18n'

export interface Tab {
  path: string
  /** Cambia cada vez que se trae del disco: estrena editor. */
  key: number
  /** Lo que se le dio al editor al abrirlo. */
  loaded: string
  /** Lo que hay en disco y lo que hay en el editor. */
  onDisk: string
  draft: string
  /** Sello para guardar; vacío = no se puede editar (cortado por largo, o no es texto). */
  stamp: string
  /** Un aviso en lugar del archivo: no es texto, o no se pudo abrir. */
  notice: string
  cut: boolean
  error: string
  saving: boolean
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const useIde = defineStore('ide', () => {
  const tabs = ref<Tab[]>([])
  const active = ref<string | null>(null)
  let serial = 0

  const current = computed(() => tabs.value.find((t) => t.path === active.value) ?? null)
  const isDirty = (t: Tab) => !!t.stamp && t.draft !== t.onDisk
  const dirtyCount = computed(() => tabs.value.filter(isDirty).length)

  /** Trae un archivo del disco a su pestaña (nueva o ya abierta). */
  async function load(path: string) {
    let tab = tabs.value.find((t) => t.path === path)
    if (!tab) {
      tabs.value.push({ path, key: ++serial, loaded: '', onDisk: '', draft: '', stamp: '', notice: '', cut: false, error: '', saving: false })
      tab = tabs.value[tabs.value.length - 1]
    }
    tab.error = tab.notice = ''
    try {
      const f = await window.orquest.projectFile(path)
      // El editor no muestra la marca de inicio (BOM): se compara sin ella; al guardar se conserva.
      tab.loaded = tab.onDisk = tab.draft = f.text.replace(/^﻿/, '')
      tab.stamp = f.stamp
      tab.cut = f.truncated
      if (f.binary) tab.notice = T`Este archivo no es de texto: no se muestra aquí.`
    } catch (err) {
      tab.stamp = ''
      tab.notice = message(err)
    }
    tab.key = ++serial
  }

  /** Clic en un archivo de la lista: lo abre (o lo trae al frente). */
  async function open(path: string) {
    if (!tabs.value.some((t) => t.path === path)) await load(path)
    active.value = path
  }
  /** Cierra una pestaña. Con cambios sin guardar no: primero guardar o descartar. */
  function close(path: string) {
    const i = tabs.value.findIndex((t) => t.path === path)
    if (i < 0) return
    const tab = tabs.value[i]
    if (isDirty(tab)) {
      tab.error = T`Tiene cambios sin guardar: guárdalos o descártalos antes de cerrarlo.`
      active.value = path
      return
    }
    tabs.value.splice(i, 1)
    if (active.value === path) active.value = (tabs.value[i] ?? tabs.value[i - 1])?.path ?? null
  }

  async function save(tab: Tab, locked: boolean, who: string) {
    if (!isDirty(tab) || tab.saving) return
    if (locked) {
      tab.error = T`${who} está trabajando: espera a que termine para guardar. Tus cambios siguen en el editor.`
      return
    }
    tab.saving = true
    tab.error = ''
    try {
      const text = tab.draft
      tab.stamp = (await window.orquest.saveProjectFile(tab.path, text, tab.stamp)).stamp
      tab.onDisk = text
    } catch (err) {
      tab.error = message(err)
    } finally {
      tab.saving = false
    }
  }
  /** El texto del editor pasado por Prettier; quien lo pide lo pone en su editor. */
  async function format(tab: Tab): Promise<string | null> {
    tab.error = ''
    try {
      const pretty = await window.orquest.formatProjectFile(tab.path, tab.draft)
      return pretty === tab.draft ? null : pretty
    } catch (err) {
      tab.error = message(err)
      return null
    }
  }
  /** Al salir del proyecto: lo abierto era de esa carpeta. */
  function reset() {
    tabs.value = []
    active.value = null
  }

  return { tabs, active, current, dirtyCount, isDirty, load, open, close, save, format, reset }
})
