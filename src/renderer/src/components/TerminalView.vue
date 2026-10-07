<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

const props = defineProps<{ id: string }>()
const el = ref<HTMLDivElement>()
let term: Terminal | undefined
let fit: FitAddon | undefined
let offData: (() => void) | undefined
let observer: ResizeObserver | undefined

async function attach(id: string) {
  offData?.()
  term!.reset()
  term!.write(await window.orquest.scrollback(id))
  offData = window.orquest.onData((from, data) => from === id && term!.write(data))
  fitNow()
}

function fitNow() {
  if (!term || !fit || !el.value?.offsetParent) return
  fit.fit()
  window.orquest.resize(props.id, term.cols, term.rows)
}

onMounted(() => {
  term = new Terminal({ fontSize: 13, theme: { background: '#1b1a24' }, convertEol: false })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(el.value!)
  // Puedes solo mirar o escribirle.
  term.onData((d) => window.orquest.write(props.id, d))
  observer = new ResizeObserver(fitNow)
  observer.observe(el.value!)
  attach(props.id)
})

watch(() => props.id, attach)

onBeforeUnmount(() => {
  offData?.()
  observer?.disconnect()
  term?.dispose()
})
</script>

<template>
  <div ref="el" class="term" />
</template>

<style scoped>
.term { flex: 1; padding: 8px; min-height: 0; height: 100%; }
</style>
