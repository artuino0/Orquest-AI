<script setup lang="ts">
/**
 * El editor del proyecto: ocupa el lugar de la oficina, con una pestaña por
 * archivo abierto. «Volver a la oficina» lo oculta sin cerrar nada; cada
 * archivo se cierra con su ✕.
 *
 * Cada pestaña conserva su propio editor mientras está abierta, así no pierde
 * lo escrito, el deshacer ni el lugar donde iba al cambiar de pestaña.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { File, Lock, X } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import { useIde, type Tab } from '../stores/ide'
import { useStudio } from '../stores/studio'
import CodeView from './CodeView.vue'

const ide = useIde()
const studio = useStudio()
const tab = computed(() => ide.current)
const dirty = computed(() => !!tab.value && ide.isDirty(tab.value))

// Es la carpeta donde trabaja el jefe y donde se integran las entregas: mientras él trabaja, solo lectura.
// En calma, para que el candado no parpadee entre paso y paso.
const boss = computed(() => studio.employees.find((e) => e.id === 'jefe'))
const locked = computed(() => !!boss.value && ['working', 'starting'].includes(studio.calmStateOf(boss.value)))
const editable = (t: Tab) => !!t.stamp && !t.notice && !locked.value

const views = new Map<string, InstanceType<typeof CodeView>>()
const keep = (path: string, el: unknown) => (el ? views.set(path, el as InstanceType<typeof CodeView>) : views.delete(path))
const name = (path: string) => path.split('/').pop() ?? path

const save = () => tab.value && ide.save(tab.value, locked.value, studio.nameOf('jefe'))
async function format() {
  const t = tab.value
  if (!t || !editable(t)) return
  const pretty = await ide.format(t)
  if (pretty !== null) views.get(t.path)?.replace(pretty)
}
/** Tira lo escrito y vuelve a traer el archivo del disco. */
const discard = () => tab.value && ide.load(tab.value.path)

// Muchas pestañas: la fila se recorre de lado; la rueda del ratón también la mueve.
const strip = ref<HTMLElement>()
const wheel = (ev: WheelEvent) => strip.value && (strip.value.scrollLeft += ev.deltaY || ev.deltaX)
watch(
  () => ide.active,
  async () => {
    await nextTick()
    strip.value?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
)
</script>

<template>
  <section class="editor">
    <header>
      <nav ref="strip" class="tabs" @wheel.prevent="wheel">
        <button v-for="t in ide.tabs" :key="t.path" class="tab" :class="{ on: t.path === ide.active }" :title="t.path" @click="ide.active = t.path" @auxclick.middle.prevent="ide.close(t.path)">
          <File />
          <span>{{ name(t.path) }}</span>
          <i v-if="ide.isDirty(t)" class="dot" :title="T`sin guardar`" />
          <X class="x" :title="T`Cerrar`" @click.stop="ide.close(t.path)" />
        </button>
      </nav>
      <button class="btn back" @click="ide.hide()"><X />{{ T`Volver a la oficina` }}</button>
    </header>

    <p v-if="!tab" class="empty">{{ T`Elige un archivo en la lista para abrirlo.` }}</p>
    <template v-else>
      <div class="bar">
        <p class="path"><code>{{ tab.path }}</code><b v-if="dirty" class="unsaved"> ● {{ T`sin guardar` }}</b><template v-if="tab.cut"> · {{ T`El archivo es largo: aquí solo sale el principio.` }}</template></p>
        <template v-if="tab.stamp && !tab.notice">
          <span v-if="locked" class="lock"><Lock /> {{ T`Solo lectura mientras ${studio.nameOf('jefe')} trabaja` }}</span>
          <button class="btn" :disabled="!editable(tab)" :title="T`Acomoda el código con Prettier (Shift+Alt+F). No guarda.`" @click="format">{{ T`Formatear` }}</button>
          <button class="btn" :disabled="!dirty" @click="discard">{{ T`Descartar` }}</button>
          <button class="btn primary" :disabled="!dirty || locked || tab.saving" :title="T`Guardar (Ctrl+S)`" @click="save">{{ tab.saving ? T`Guardando…` : T`Guardar` }}</button>
        </template>
      </div>
      <p v-if="tab.error" class="bad">{{ tab.error }}</p>
      <p v-if="tab.notice" class="empty">{{ tab.notice }}</p>
    </template>

    <div class="views">
      <template v-for="t in ide.tabs" :key="`${t.path}:${t.key}`">
        <CodeView v-if="!t.notice" v-show="t.path === ide.active" :ref="(el) => keep(t.path, el)" class="code" :path="t.path" :text="t.loaded" :editable="editable(t)" @change="t.draft = $event" @save="save" @format="format" />
      </template>
    </div>
  </section>
</template>

<style scoped>
.editor { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; min-width: 0; background: var(--term-bg); }
header { display: flex; align-items: flex-end; gap: 8px; padding: 6px 8px 0; background: var(--surface); border-bottom: 3px solid var(--border); }
.tabs { flex: 1; min-width: 0; display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.tab { flex: none; display: inline-flex; align-items: center; gap: 7px; max-width: 240px; padding: 7px 8px 7px 10px; font: 12px var(--font); color: var(--text-secondary); background: var(--surface-2); border: 2px solid var(--border); border-bottom: 0; cursor: pointer; }
.tab.on { color: var(--text-primary); font-weight: 700; background: var(--term-bg); border-top: 3px solid var(--accent); }
.tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab svg { width: 12px; height: 12px; flex: none; }
.tab.on svg:first-child { color: var(--accent); }
.tab .x { padding: 2px; box-sizing: content-box; }
.tab .x:hover { background: var(--st-block); color: var(--on-danger); }
.dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: var(--accent); }
.back { flex: none; margin-bottom: 6px; padding: 5px 10px; }
.bar { display: flex; align-items: center; gap: 6px; min-height: 34px; padding: 4px 10px; border-bottom: 2px solid var(--surface); }
.bar .btn { padding: 4px 10px; }
.path { flex: 1; min-width: 0; margin: 0; font-size: 11px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.unsaved { color: var(--accent); font-weight: 700; }
.lock { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.lock svg { width: 12px; height: 12px; }
.bad { margin: 0; padding: 6px 10px; font-size: 12px; color: var(--st-block); }
.empty { margin: 0; padding: 20px; font-size: 12px; color: var(--text-secondary); }
.views { flex: 1; min-height: 0; position: relative; }
.code { position: absolute; inset: 0; }
</style>
