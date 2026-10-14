<script setup lang="ts">
import { BookOpen, Download, ExternalLink, FolderGit2, FolderOpen, Heart, RefreshCw, TriangleAlert, UserPlus, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CliStatus, UpdateInfo } from '../../../shared/ipc'
import { getLang, T } from '../../../core/i18n'
import { ago } from '../format'
import { useStudio, type Recent } from '../stores/studio'
import InstallGuide from './InstallGuide.vue'
import RecentsDialog from './RecentsDialog.vue'

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
const openLink = (url: string) => window.orquest.openExternal(url)
const stateOf = (c: CliStatus): State => (!c.installed ? 'missing' : c.session === false ? 'no-session' : 'ready')
const CHIP: Record<State, string> = { ready: T`INSTALADA`, 'no-session': T`SIN SESIÓN`, missing: T`NO INSTALADA` }

function detail(c: CliStatus): string {
  if (!c.installed) return T`No se encontró en el PATH`
  const v = c.version ? `v${c.version}` : T`versión desconocida`
  if (c.session === false) return c.login && !c.manualLogin ? T`${v} · ejecuta ${c.login}` : T`${v} · ejecuta el login de la CLI`
  return c.session ? T`${v} · sesión activa` : T`${v} · sesión sin comprobar`
}

const ready = computed(() => studio.clis.filter((c) => stateOf(c) === 'ready'))
const noSession = computed(() => studio.clis.filter((c) => stateOf(c) === 'no-session'))
const missing = computed(() => studio.clis.filter((c) => stateOf(c) === 'missing'))
// ── Versión nueva: se pregunta una vez al abrir Inicio. El aviso va abajo a la derecha y,
// si se cierra, no vuelve a salir para esa misma versión.
const SKIPPED = 'orquest.update.skipped'
const update = ref<UpdateInfo | null>(null)
onMounted(async () => {
  const found = await window.orquest.checkUpdate().catch(() => null)
  let skipped: string | null = null
  try {
    skipped = localStorage.getItem(SKIPPED)
  } catch {
    // Sin almacenamiento el aviso sale cada vez.
  }
  if (found && found.version !== skipped) update.value = found
})
function skipUpdate() {
  try {
    localStorage.setItem(SKIPPED, update.value?.version ?? '')
  } catch {
    // Solo dura esta sesión.
  }
  update.value = null
}

/** Programas que faltan además de las CLIs (git): sin ellos tampoco se abre un proyecto. */
const lacking = computed(() => studio.requirements.filter((r) => !r.installed))
/** Ya se revisó y ninguna sirve: no se puede abrir proyecto. */
const blocked = computed(() => studio.checkedAt !== null && !ready.value.length)

function summary(r: Recent): string {
  const s = r.summary
  if (s === undefined) return ''
  if (!s) return T`sin abrir en este estudio`
  if (!s.started) return T`sin jefe`
  const staff = s.staff === 1 ? T`${s.staff} empleado` : T`${s.staff} empleados`
  return s.pending ? `${staff} · ${s.pending === 1 ? T`${s.pending} entrega pendiente` : T`${s.pending} entregas pendientes`}` : staff
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

/** Inicio enseña los últimos cinco; el resto, en la lista completa. */
const SHOWN = 5
const allRecents = ref(false)
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await studio.loadRecents()
  void studio.loadSummaries()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(clock)
})
import LangToggle from './LangToggle.vue'
import RepoSetup from './RepoSetup.vue'
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <div class="home">
    <div class="theme-corner">
      <button class="btn support" :title="T`Orquest AI es gratis. Si te sirve, puedes invitar un café o reservar una asesoría.`" @click="openLink(`https://orquest.dydasites.com/${getLang() === 'en' ? 'en/' : ''}#apoyo`)"><Heart />{{ T`Apoyar` }}</button>
      <LangToggle /><ThemeToggle />
    </div>
    <section class="left">
      <div class="team">
        <img v-for="(src, i) in team" :key="i" :src="src" alt="" @load="double" />
      </div>

      <div class="brand">
        <h1>ORQUEST AI <small v-if="studio.version">v{{ studio.version }}</small></h1>
        <p>{{ T`Tu estudio de agentes de código. Cada animación es un estado real.` }}</p>
      </div>

      <div v-for="r in lacking" :key="r.id" class="alert">
        <TriangleAlert />
        <div>
          <strong>{{ T`Falta instalar ${r.name}` }}</strong>
          <p>{{ r.why }}</p>
          <code v-if="r.install.command">{{ r.install.command }}</code>
          <div class="actions">
            <button class="btn" @click="openLink(r.install.url)"><ExternalLink />{{ T`Descargar ${r.name}` }}</button>
            <button class="btn" :disabled="studio.detecting" @click="studio.detect()"><RefreshCw :class="{ spin: studio.detecting }" />{{ T`Volver a detectar` }}</button>
          </div>
        </div>
      </div>

      <div v-if="blocked" class="alert">
        <TriangleAlert />
        <div>
          <strong>{{ T`Ningún agente está listo` }}</strong>
          <p>
            {{ T`Para abrir un proyecto necesitas al menos una CLI instalada y con sesión iniciada.` }}
            <template v-if="noSession.length"><br />{{ T`· Sin sesión: ${noSession.map((c) => c.name).join(', ')} → ejecuta su comando de login.` }}</template>
            <template v-if="missing.length"><br />{{ T`· No instaladas: ${missing.map((c) => c.name).join(', ')}.` }}</template>
          </p>
          <div class="actions">
            <button class="btn" :disabled="studio.detecting" @click="studio.detect()"><RefreshCw :class="{ spin: studio.detecting }" />{{ T`Volver a detectar` }}</button>
            <button class="btn" @click="guide = true"><BookOpen />{{ T`Guía de instalación` }}</button>
          </div>
        </div>
      </div>

      <div class="open">
        <button class="btn primary" :disabled="blocked || !!lacking.length || studio.checkedAt === null" @click="studio.pickProject()"><FolderOpen />{{ T`Abrir repositorio…` }}</button>
        <span v-if="lacking.length" class="why">{{ T`Bloqueado hasta instalar ${lacking.map((r) => r.name).join(', ')}` }}</span>
        <span v-else-if="blocked" class="why">{{ T`Bloqueado hasta que haya un agente listo` }}</span>
        <span v-else-if="studio.checkedAt === null">{{ T`Buscando agentes…` }}</span>
        <span v-else>Ctrl+O</span>
      </div>
      <p v-if="studio.error" class="why">{{ studio.error }}</p>

      <div class="recents" :class="{ locked: blocked || !!lacking.length }">
        <h2>{{ T`PROYECTOS RECIENTES` }}</h2>
        <div v-for="r in studio.recents.slice(0, SHOWN)" :key="r.path" class="row">
          <button class="project" :disabled="blocked || !!lacking.length || studio.checkedAt === null" @click="studio.openProject(r.path)">
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
          <button class="forget" :title="T`Quitar de la lista (la carpeta no se toca)`" @click="studio.removeRecent(r.path)"><X /></button>
        </div>
        <button v-if="studio.recents.length > SHOWN" class="more" @click="allRecents = true">{{ T`Ver todos · ${studio.recents.length}` }}</button>
        <p v-if="!studio.recents.length" class="empty">{{ T`Aún no abres ningún proyecto.` }}</p>
        <RecentsDialog v-if="allRecents" :locked="blocked || !!lacking.length || studio.checkedAt === null" @close="allRecents = false" @open="(p) => { allRecents = false; studio.openProject(p) }" />
      </div>
    </section>

    <aside class="panel agents">
      <header>
        <h2 class="title-pixel">{{ T`Agentes en esta máquina` }}</h2>
        <span v-if="studio.checkedAt !== null" class="count" :class="{ none: !ready.length }">{{ T`${ready.length} de ${studio.clis.length} listas` }}</span>
      </header>

      <div v-for="r in studio.requirements" :key="r.id" class="cli" :class="r.installed ? 'ready' : 'missing lacking'" :title="r.why">
        <i class="color req" />
        <span class="data">
          <strong>{{ r.name }}</strong>
          <small>{{ r.installed ? (r.version ? T`v${r.version} · requisito` : T`requisito`) : T`Hace falta para abrir un proyecto` }}</small>
        </span>
        <span class="chip">{{ r.installed ? T`INSTALADO` : T`NO INSTALADO` }}</span>
      </div>
      <div v-for="c in studio.clis" :key="c.id" class="cli" :class="stateOf(c)" :title="c.account">
        <i class="color" :style="{ background: `var(--pv-${c.id})` }" />
        <span class="data">
          <strong>{{ c.name }}</strong>
          <small>{{ detail(c) }}</small>
        </span>
        <button v-if="c.signup" class="btn signup" :title="c.signup.referral ? T`Enlace de referido del autor de Orquest AI` : T`Planes de ${c.name}`" @click="openLink(c.signup.url)">
          <UserPlus />{{ stateOf(c) === 'ready' ? T`Otra cuenta` : T`Crear cuenta` }}
        </button>
        <span class="chip">{{ CHIP[stateOf(c)] }}</span>
      </div>
      <p v-if="studio.clis.some((c) => c.signup?.referral)" class="referral">{{ T`El enlace de cuenta de ${studio.clis.filter((c) => c.signup?.referral).map((c) => c.name).join(T` y `)} es de referido del autor: a ti no te cuesta más y ayuda a sostener Orquest AI.` }}</p>
      <p v-if="!studio.clis.length" class="empty">{{ T`Buscando las CLIs instaladas…` }}</p>

      <footer>
        <button class="btn" :disabled="studio.detecting" @click="studio.detect()"><RefreshCw :class="{ spin: studio.detecting }" />{{ T`Volver a detectar` }}</button>
        <small v-if="studio.detecting">{{ T`Revisando…` }}</small>
        <small v-else-if="studio.checkedAt !== null">{{ T`Última revisión: ${ago(studio.checkedAt, now)}` }}</small>
      </footer>
    </aside>

    <aside v-if="update" class="update">
      <Download />
      <span>{{ T`Hay una versión nueva: ${update.version}` }}</span>
      <button class="btn primary" @click="openLink(update.url)">{{ T`Descargar` }}</button>
      <button class="btn close" :title="T`Ahora no`" @click="skipUpdate"><X /></button>
    </aside>
    <RepoSetup v-if="studio.repoIssue" />
    <InstallGuide v-if="guide" :clis="[...noSession, ...missing]" @close="guide = false" />
  </div>
</template>

<style scoped>
.home { min-height: 100%; padding: 56px; display: flex; gap: 56px; align-items: flex-start; background: var(--bg); }
.left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.team { display: flex; gap: 6px; align-items: flex-end; height: 48px; }
.team img { image-rendering: pixelated; }
.brand { display: grid; gap: 6px; }
h1 { margin: 0; font: 700 48px/58px var(--font-pixel); color: var(--accent); }
.brand h1 small { font: 400 13px var(--font); letter-spacing: 0; color: var(--text-secondary); text-shadow: none; vertical-align: baseline; }
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
.row { display: flex; align-items: stretch; }
.row .project { flex: 1; min-width: 0; }
.forget { flex: none; width: 36px; display: grid; place-items: center; background: none; border: 0; border-bottom: 2px solid var(--border-light); color: var(--text-secondary); opacity: 0.35; cursor: pointer; }
.row:hover .forget, .forget:focus-visible { opacity: 1; }
.forget:hover { color: var(--on-danger); background: var(--st-block); }
.forget svg { width: 14px; height: 14px; }
.more { align-self: flex-start; margin: 8px 14px 0; padding: 4px 0; background: none; border: 0; font: 700 11px var(--font); color: var(--accent); cursor: pointer; }
.more:hover { text-decoration: underline; }
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
.cli .signup { flex: none; padding: 4px 8px; font-size: 10px; }
.referral { margin: 0; padding: 8px 0 0; border-top: 2px solid var(--border-light); font-size: 10px; line-height: 1.5; color: var(--text-secondary); }
.cli.ready .chip { color: var(--st-idle); }
.cli.no-session .chip { color: var(--accent); }
.update { position: fixed; right: 14px; bottom: 14px; z-index: 3; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--surface-2); border: 3px solid var(--accent); box-shadow: 4px 4px 0 var(--shadow); font-size: 12px; }
.update > svg { width: 16px; height: 16px; color: var(--accent); }
.update .close { padding: 6px 8px; }
.cli .color.req { background: var(--text-primary); }
.cli.lacking .chip { color: var(--st-block); }
.cli.lacking strong { color: var(--text-primary); }
.alert code { justify-self: start; font: 12px var(--font); background: var(--term-bg); border: 2px solid var(--border-light); padding: 4px 8px; user-select: all; }
.cli.missing .chip { color: var(--text-secondary); }
.cli.missing strong { color: var(--text-secondary); }
.cli.missing .color { opacity: 0.4; }
.agents footer { display: flex; align-items: center; gap: 10px; padding-top: 10px; border-top: 2px solid var(--border-light); }
.agents footer small { font-size: 10px; color: var(--text-secondary); }
.spin { animation: spin 0.8s steps(8) infinite; }
@keyframes spin { to { rotate: 360deg; } }
.support { padding: 7px 9px; }
.theme-corner { position: fixed; top: 46px; right: 14px; z-index: 2; display: flex; gap: 8px; }
</style>
