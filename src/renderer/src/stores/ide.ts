/**
 * El explorador del proyecto (botón de carpeta en la barra de la oficina): el
 * panel de archivos, las pestañas abiertas y el editor que ocupa el lugar de la
 * oficina. Es la carpeta del proyecto, no la oficina de un agente.
 *
 * Cerrar el editor no cierra los archivos: las pestañas se quedan hasta que se
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

const WIDTH_KEY = 'orquest.files.width'
const OPEN_KEY = 'orquest.files.open'
export const MIN_WIDTH = 220
const remembered = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Sin almacenamiento, la preferencia dura esta sesión.
  }
}
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const useIde = defineStore('ide', () => {
  const panelOpen = ref(remembered(OPEN_KEY) === '1')
  const width = ref(Math.max(MIN_WIDTH, Number(remembered(WIDTH_KEY)) || 320))
  const tabs = ref<Tab[]>([])
  const active = ref<string | null>(null)
  /** El editor a la vista, en el lugar de la oficina. */
  const visible = ref(false)
  let serial = 0

  const current = computed(() => tabs.value.find((t) => t.path === active.value) ?? null)
  const isDirty = (t: Tab) => !!t.stamp && t.draft !== t.onDisk
  const dirtyCount = computed(() => tabs.value.filter(isDirty).length)

  function togglePanel() {
    panelOpen.value = !panelOpen.value
    remember(OPEN_KEY, panelOpen.value ? '1' : '0')
  }
  function setWidth(px: number) {
    width.value = Math.round(Math.max(MIN_WIDTH, Math.min(px, window.innerWidth / 2)))
    remember(WIDTH_KEY, String(width.value))
  }

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

  /** Clic en un archivo de la lista: lo abre (o lo trae al frente) y muestra el editor. */
  async function open(path: string) {
    if (!tabs.value.some((t) => t.path === path)) await load(path)
    active.value = path
    visible.value = true
  }
  /** «Ver editor»: entra a lo que ya está abierto, sin abrir nada más. */
  function show() {
    active.value ??= tabs.value[0]?.path ?? null
    visible.value = true
  }
  function hide() {
    visible.value = false
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
    if (!tabs.value.length) visible.value = false
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
    visible.value = false
  }

  return { panelOpen, width, tabs, active, visible, current, dirtyCount, isDirty, togglePanel, setWidth, load, open, show, hide, close, save, format, reset }
})
