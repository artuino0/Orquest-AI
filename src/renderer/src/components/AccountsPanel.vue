<script setup lang="ts">
/**
 * Cuentas: cada sesión iniciada de una CLI en esta máquina, quién trabaja con
 * ella y cuánto lleva gastado de su límite. Solo muestra lo que da el núcleo
 * (core/accounts): no calcula nada.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RefreshCw, UserPlus } from 'lucide-vue-next'
import { useStudio } from '../stores/studio'
import { ago } from '../format'
import type { Account } from '../../../core/accounts'
import PanelFrame from './PanelFrame.vue'

const studio = useStudio()
const accounts = ref<Account[]>([])
const loading = ref(true)
const refreshing = ref(false)
const now = ref(Date.now())

async function load() {
  refreshing.value = true
  accounts.value = await window.orquest.accounts().catch(() => accounts.value)
  now.value = Date.now()
  loading.value = false
  refreshing.value = false
}
// El uso cambia mientras trabajan: se vuelve a mirar cada tanto.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(load, 15000)
})
onBeforeUnmount(() => clearInterval(timer))

const cliName = (id: string) => studio.clis.find((c) => c.id === id)?.name ?? id
/** Proveedores que tienen dónde abrir una cuenta: se ofrecen tengas ya una o no. */
const signups = computed(() => studio.clis.filter((c) => c.signup))
const open = (url: string) => window.orquest.openExternal(url)
/** Quién está trabajando con esa cuenta en este proyecto. */
const using = (a: Account) => {
  const key = a.main ? '' : a.dir
  const b = studio.board
  if (!b) return []
  const names = b.staff.filter((m) => !m.gone && m.provider === a.provider && (m.account ?? '') === key).map((m) => m.name)
  if (b.boss && b.boss.provider === a.provider && (b.boss.account ?? '') === key) names.unshift(studio.nameOf('jefe'))
  return names
}
const groups = computed(() => {
  const by = new Map<string, Account[]>()
  for (const a of accounts.value) by.set(a.provider, [...(by.get(a.provider) ?? []), a])
  return [...by.entries()]
})
/** "2 h 10 min", "3 días". */
const left = (at: number) => {
  const min = Math.max(1, Math.round((at - now.value) / 60000))
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`
  return `${Math.round(min / 1440)} días`
}
const BLOCKS = 20
const level = (used: number) => (used >= 90 ? 'hot' : used >= 70 ? 'warm' : '')
</script>

<template>
  <PanelFrame title="Cuentas" subtitle="Cada sesión iniciada en esta máquina y lo que lleva usado de su límite">
    <template #actions><button class="btn" :disabled="refreshing" @click="load"><RefreshCw /> {{ refreshing ? 'Actualizando…' : 'Actualizar' }}</button></template>
    <p v-if="loading" class="blank">Buscando cuentas…</p>
    <div v-else-if="!accounts.length" class="blank">
      <h2>No hay cuentas con sesión iniciada</h2>
      <p>Aquí aparecen las de Codex y Claude Code en cuanto inicies sesión en su CLI.</p>
      <p v-if="signups.length" class="more">
        <button v-for="c in signups" :key="c.id" class="btn" @click="open(c.signup!.url)"><UserPlus /> Crear cuenta de {{ c.name }}</button>
      </p>
    </div>
    <div v-else class="accounts">
      <section v-for="[provider, list] in groups" :key="provider">
        <h3 class="cap"><i :style="{ background: `var(--pv-${provider})` }" /> {{ cliName(provider) }} · {{ list.length }} {{ list.length === 1 ? 'cuenta' : 'cuentas' }}</h3>
        <article v-for="a in list" :key="a.dir" class="account">
          <header>
            <b>{{ a.main ? a.label : `Cuenta ${a.label}` }}</b>
            <span class="dim">~/{{ a.dir }}</span>
            <span class="who" :class="{ none: !using(a).length }">{{ using(a).length ? using(a).join(', ') : 'nadie la usa ahora' }}</span>
          </header>
          <template v-if="a.usage">
            <div v-for="w in a.usage.windows" :key="w.minutes" class="gauge" :class="level(w.used)">
              <span class="label">{{ w.label }}</span>
              <span class="bar" :title="`${Math.round(w.used)}% usado`"><i v-for="n in BLOCKS" :key="n" :class="{ on: w.used > 0 && n <= Math.max(1, Math.round((w.used / 100) * BLOCKS)) }" /></span>
              <b class="pct">{{ Math.round(w.used) }}%</b>
              <span class="dim reset">{{ w.resetsAt ? `se reinicia en ${left(w.resetsAt)}` : w.used === 0 ? 'recién reiniciado' : '' }}</span>
            </div>
            <p class="dim age">Dato de {{ ago(a.usage.at, now) }}</p>
          </template>
          <p v-else class="dim">Sin datos todavía: aparecen cuando esta cuenta trabaje.</p>
        </article>
      </section>
      <p class="dim hint">
        Otra cuenta del mismo proveedor es otra carpeta con su propia sesión (por ejemplo <code>~/.codex2</code>): Orquest la detecta sola y la ofrece al contratar, y así dos cuentas trabajan al mismo tiempo.
      </p>
      <div v-if="signups.length" class="more">
        <span class="dim">¿Se te acaba el límite a media jornada? Otra cuenta lo duplica.</span>
        <button v-for="c in signups" :key="c.id" class="btn" @click="open(c.signup!.url)"><UserPlus /> Crear cuenta de {{ c.name }}</button>
        <span v-if="signups.some((c) => c.signup?.referral)" class="dim note">El de {{ signups.filter((c) => c.signup?.referral).map((c) => c.name).join(' y ') }} es enlace de referido del autor: a ti no te cuesta más y ayuda a sostener Orquest AI.</span>
      </div>
    </div>
  </PanelFrame>
</template>

<style scoped>
.more { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; }
.more .note { flex-basis: 100%; }
.accounts { display: flex; flex-direction: column; gap: 18px; padding: 16px; overflow: auto; }
section { display: flex; flex-direction: column; gap: 10px; }
h3 { display: flex; align-items: center; gap: 8px; margin: 0; }
h3 i { width: 10px; height: 10px; }
.account { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--surface-2); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow); }
.account header { display: flex; align-items: baseline; gap: 10px; }
.account header b { font: 700 18px var(--font-pixel); color: var(--accent); }
.who { margin-left: auto; font-size: 11px; }
.who.none { color: var(--text-secondary); }
.gauge { display: grid; grid-template-columns: 70px auto 46px 1fr; align-items: center; gap: 10px; font-size: 11px; }
.label { font-weight: 700; letter-spacing: 1px; text-transform: uppercase; font-size: 10px; color: var(--text-secondary); }
.bar { display: flex; gap: 2px; padding: 2px; background: var(--surface); border: 2px solid var(--border-light); }
.bar i { width: 10px; height: 14px; background: var(--border); }
.bar i.on { background: var(--st-idle); }
.gauge.warm .bar i.on { background: var(--st-review); }
.gauge.hot .bar i.on { background: var(--st-block); }
.pct { font: 700 13px var(--font); text-align: right; }
.gauge.hot .pct { color: var(--st-block); }
.age, .hint { margin: 0; font-size: 11px; line-height: 1.6; }
.dim { color: var(--text-secondary); font-size: 11px; }
code { padding: 0 4px; background: var(--surface); }
.blank h2 { margin: 0; font: 700 18px var(--font-pixel); color: var(--text-primary); }
</style>
