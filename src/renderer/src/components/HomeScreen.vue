<script setup lang="ts">
import { BookOpen, FolderGit2, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CliStatus } from '../../../shared/ipc'
import { ago } from '../format'
import { useStudio, type Recent } from '../stores/studio'
import InstallGuide from './InstallGuide.vue'

const studio = useStudio()
const guide = ref(false)

// El equipo de la portada: todos los personajes de píxel chico, uno de cada uno, al doble de su tamaño.
// Los que se añadan a la carpeta como charN.png aparecen solos.
const CHARS = import.meta.glob<string>('../../../../assets/herdr-oficina/sprites/char*.png', { eager: true, query: '?url', import: 'default' })
const team = Object.entries(CHARS)
  .map(([path, url]) => ({ n: Number(/char(\d+)\.png$/.exec(path)?.[1]), url }))
  .filter((c) => c.n)
  .sort((a, b) => a.n - b.n)
  .map((c) => c.url)
const double = (ev: Event) => {
  const img = ev.target as HTMLImageElement
  img.width = img.naturalWidth * 2
}
const name = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p

type State = 'ready' | 'no-session' | 'missing'
const stateOf = (c: CliStatus): State => (!c.installed ? 'missing' : c.session === false ? 'no-session' : 'ready')
const CHIP: Record<State, string> = { ready: 'INSTALADA', 'no-session': 'SIN SESIÓN', missing: 'NO INSTALADA' }

function detail(c: CliStatus): string {
  if (!c.installed) return 'No se encontró en el PATH'
  const v = c.version ? `v${c.version}` : 'versión desconocida'
  if (c.session === false) return `${v} · ${/\s/.test(c.login ?? '') && !c.login?.startsWith('abre') ? `ejecuta ${c.login}` : 'ejecuta el login de la CLI'}`
  return `${v} · ${c.session ? 'sesión activa' : 'sesión sin comprobar'}`
}

const ready = computed(() => studio.clis.filter((c) => stateOf(c) === 'ready'))
const noSession = computed(() => studio.clis.filter((c) => stateOf(c) === 'no-session'))
const missing = computed(() => studio.clis.filter((c) => stateOf(c) === 'missing'))
/** Ya se revisó y ninguna sirve: no se puede abrir proyecto. */
const blocked = computed(() => studio.checkedAt !== null && !ready.value.length)

function summary(r: Recent): string {
  const s = r.summary
  if (s === undefined) return ''
  if (!s) return 'sin abrir en este estudio'
  if (!s.started) return 'sin jefe'
  const staff = `${s.staff} ${s.staff === 1 ? 'empleado' : 'empleados'}`
  return s.pending ? `${staff} · ${s.pending} ${s.pending === 1 ? 'entrega pendiente' : 'entregas pendientes'}` : staff
}

// "Última revisión: hace 12 s" avanza sola.
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 1000)

function onKey(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'o' && !blocked.value && !guide.value) {
    ev.preventDefault()
    studio.pickProject()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  studio.loadSummaries()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(clock)
})
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <div class="home">
    <ThemeToggle class="theme-corner" />
    <section class="left">
      <div class="team">
        <img v-for="(src, i) in team" :key="i" :src="src" alt="" @load="double" />
      </div>

      <div class="brand">
        <h1>ORQUEST AI</h1>
        <p>Tu estudio de agentes de código. Cada animación es un estado real.</p>
      </div>

      <div v-if="blocked" class="alert">
        <TriangleAlert />
        <div>
          <strong>Ningún agente está listo</strong>
          <p>
            Para abrir un proyecto necesitas al menos una CLI instalada y con sesión iniciada.
            <template v-if="noSession.length"><br />· Sin sesión: {{ noSession.map((c) => c.name).join(', ') }} → ejecuta su comando de login.</template>
            <template v-if="missing.length"><br />· No instaladas: {{ missing.map((c) => c.name).join(', ') }}.</template>
          </p>
          <div class="actions">
            <button class="btn" :disabled="studio.detecting" @click="studio.detect()"><RefreshCw :class="{ spin: studio.detecting }" />Volver a detectar</button>
            <button class="btn" @click="guide = true"><BookOpen />Guía de instalación</button>
          </div>
        </div>
      </div>

      <div class="open">
        <button class="btn primary" :disabled="blocked || studio.checkedAt === null" @click="studio.pickProject()"><FolderOpen />Abrir repositorio…</button>
        <span v-if="blocked" class="why">Bloqueado hasta que haya un agente listo</span>
        <span v-else-if="studio.checkedAt === null">Buscando agentes…</span>
        <span v-else>Ctrl+O</span>
      </div>
      <p v-if="studio.error" class="why">{{ studio.error }}</p>

      <div class="recents" :class="{ locked: blocked }">
        <h2>PROYECTOS RECIENTES</h2>
        <button v-for="r in studio.recents" :key="r.path" class="project" :disabled="blocked || studio.checkedAt === null" @click="studio.openProject(r.path)">
          <FolderGit2 />
          <span class="data">
            <strong>{{ name(r.path) }}</strong>
            <small>{{ r.path }}</small>
          </span>
          <span class="meta">
            <span>{{ r.at ? ago(r.at, now) : '' }}</span>
            <small>{{ summary(r) }}</small>
          </span>
        </button>
        <p v-if="!studio.recents.length" class="empty">Aún no abres ningún proyecto.</p>
      </div>
    </section>

    <aside class="panel agents">
      <header>
        <h2 class="title-pixel">Agentes en esta máquina</h2>
        <span v-if="studio.checkedAt !== null" class="count" :class="{ none: !ready.length }">{{ ready.length }} de {{ studio.clis.length }} listas</span>
      </header>

      <div v-for="c in studio.clis" :key="c.id" class="cli" :class="stateOf(c)" :title="c.account">
        <i class="color" :style="{ background: `var(--pv-${c.id})` }" />
        <span class="data">
          <strong>{{ c.name }}</strong>
          <small>{{ detail(c) }}</small>
        </span>
        <span class="chip">{{ CHIP[stateOf(c)] }}</span>
      </div>
      <p v-if="!studio.clis.length" class="empty">Buscando las CLIs instaladas…</p>

      <footer>
        <button class="btn" :disabled="studio.detecting" @click="studio.detect()"><RefreshCw :class="{ spin: studio.detecting }" />Volver a detectar</button>
        <small v-if="studio.detecting">Revisando…</small>
        <small v-else-if="studio.checkedAt !== null">Última revisión: {{ ago(studio.checkedAt, now) }}</small>
      </footer>
    </aside>

    <InstallGuide v-if="guide" :clis="[...noSession, ...missing]" @close="guide = false" />
  </div>
</template>

<style scoped>
.home { min-height: 100vh; padding: 56px; display: flex; gap: 56px; align-items: flex-start; background: var(--bg); }
.left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.team { display: flex; gap: 6px; align-items: flex-end; height: 48px; }
.team img { image-rendering: pixelated; }
.brand { display: grid; gap: 6px; }
h1 { margin: 0; font: 700 48px/58px var(--font-pixel); color: var(--accent); }
.brand p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-secondary); }

.alert { display: flex; gap: 12px; padding: 14px; background: var(--tint-danger); border: 3px solid var(--st-block); box-shadow: 4px 4px 0 var(--shadow); }
.alert > svg { width: 20px; height: 20px; flex: none; color: var(--st-block); }
.alert > div { display: grid; gap: 6px; min-width: 0; }
.alert strong { font-size: 14px; }
.alert p { margin: 0; font-size: 12px; line-height: 1.5; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 4px; }

.open { display: flex; align-items: center; gap: 14px; font-size: 11px; color: var(--text-secondary); }
.why { margin: 0; font-size: 11px; color: var(--st-block); }

.recents { display: flex; flex-direction: column; }
.recents h2 { margin: 0; padding: 0 14px 4px; font: 700 10px var(--font); letter-spacing: 1px; color: var(--text-secondary); }
.project { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: none; border: 0; border-bottom: 2px solid var(--border-light); text-align: left; color: inherit; width: 100%; }
.project:hover:not(:disabled) { background: var(--surface); border-color: var(--accent); }
.project:disabled { opacity: 1; }
.project > svg { width: 18px; height: 18px; flex: none; color: var(--accent); }
.data { flex: 1; min-width: 0; display: grid; gap: 3px; }
.data strong { font-size: 14px; line-height: 18px; }
.data small { font-size: 11px; line-height: 15px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { display: grid; gap: 3px; justify-items: end; font-size: 11px; line-height: 15px; white-space: nowrap; }
.meta small { font-size: 10px; line-height: 13px; color: var(--text-secondary); }
.locked { opacity: 0.35; }
.empty { margin: 0; padding: 12px 14px; font-size: 11px; color: var(--text-secondary); }

.agents { width: 500px; flex: none; padding: 20px; display: flex; flex-direction: column; gap: 6px; }
.agents header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; }
.count { font: 700 11px var(--font); color: var(--st-idle); }
.count.none { color: var(--st-block); }
.cli { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 2px solid var(--border-light); }
.color { width: 14px; height: 14px; flex: none; border: 2px solid var(--border); }
.cli .data strong { font-size: 13px; line-height: 17px; }
.cli .data small { font-size: 10px; line-height: 13px; }
.cli.ready .chip { color: var(--st-idle); }
.cli.no-session .chip { color: var(--accent); }
.cli.missing .chip { color: var(--text-secondary); }
.cli.missing strong { color: var(--text-secondary); }
.cli.missing .color { opacity: 0.4; }
.agents footer { display: flex; align-items: center; gap: 10px; padding-top: 10px; border-top: 2px solid var(--border-light); }
.agents footer small { font-size: 10px; color: var(--text-secondary); }
.spin { animation: spin 0.8s steps(8) infinite; }
@keyframes spin { to { rotate: 360deg; } }
.theme-corner { position: fixed; top: 14px; right: 14px; z-index: 2; }
</style>
