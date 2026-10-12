<script setup lang="ts">
/**
 * Un archivo en el editor (Monaco): entero o, si se le da cómo estaba antes
 * (`original`), como diferencia con los dos lados. El lenguaje sale del nombre
 * del archivo. Se puede escribir solo con `editable`; guardar y formatear los
 * decide quien lo usa (aquí solo se avisa: `change`, `save`, `format`).
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { T } from '../../../core/i18n'
import { theme } from '../theme'

const props = defineProps<{ path: string; text: string; original?: string | null; editable?: boolean }>()
const emit = defineEmits<{ change: [text: string]; save: []; format: [] }>()
const host = ref<HTMLDivElement>()
let api: typeof import('../monaco') | undefined
let alive = true
let open: { dispose(): void }[] = []
type Monaco = (typeof import('../monaco'))['monaco']
/** Donde se escribe: el editor o, en una diferencia, su lado «ahora». */
let target: ReturnType<Monaco['editor']['create']> | undefined
let view: { updateOptions(o: { readOnly: boolean }): void } | undefined
let serial = 0

function show() {
  if (!api || !host.value) return
  const { monaco } = api
  open.forEach((x) => x.dispose())
  // Cada vez una dirección nueva: dos modelos no pueden compartirla, y de su ruta sale el lenguaje.
  const model = (text: string, side: string) => monaco.editor.createModel(text, undefined, monaco.Uri.from({ scheme: 'orquest', authority: side, path: `/${++serial}/${props.path.split('\\').join('/')}` }))
  const options = {
    readOnly: !props.editable,
    automaticLayout: true,
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'monospace',
    fontSize: 12,
    lineHeight: 19,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none' as const,
    stickyScroll: { enabled: false },
  }
  const now = model(props.text, 'ahora')
  if (props.original == null) {
    const editor = monaco.editor.create(host.value, { ...options, model: now })
    open = [editor, now]
    target = view = editor
  } else {
    const before = model(props.original, 'antes')
    // Si no cabe lado a lado (panel flotante), Monaco lo pone en una sola columna.
    const diff = monaco.editor.createDiffEditor(host.value, { ...options, originalEditable: false, useInlineViewWhenSpaceIsLimited: true })
    diff.setModel({ original: before, modified: now })
    open = [diff, before, now]
    target = diff.getModifiedEditor()
    view = diff
  }
  const editor = target
  editor.onDidChangeModelContent(() => emit('change', editor.getValue()))
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
  editor.addAction({ id: 'orquest.formatear', label: T`Formatear con Prettier`, keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF], run: () => emit('format') })
}

/** Cambia todo el texto por otro (el formateado), como una edición más: Ctrl+Z lo deshace. */
function replace(text: string) {
  const model = target?.getModel()
  if (!target || !model) return
  target.pushUndoStop()
  target.executeEdits('orquest', [{ range: model.getFullModelRange(), text }])
  target.pushUndoStop()
}
defineExpose({ replace })

onMounted(async () => {
  const loaded = await import('../monaco')
  if (!alive) return
  api = loaded
  api.applyTheme()
  show()
  // La letra de la app puede terminar de cargar después: se vuelve a medir para que el cursor y la selección cuadren.
  void document.fonts.ready.then(() => alive && loaded.monaco.editor.remeasureFonts())
})
watch(() => [props.path, props.text, props.original], show)
watch(() => props.editable, (on) => view?.updateOptions({ readOnly: !on }))
watch(theme, () => api?.applyTheme(), { flush: 'post' })
onBeforeUnmount(() => {
  alive = false
  open.forEach((x) => x.dispose())
})
</script>

<template>
  <div ref="host" class="code-view" />
</template>

<style scoped>
.code-view { width: 100%; height: 100%; min-height: 0; overflow: hidden; }
</style>
