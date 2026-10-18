<script setup lang="ts">
/**
 * Uso: el límite de cada cuenta, compacto. Las 5 horas con cuándo reinicia y
 * la semana. Si una se agota, su barra queda en rojo con la hora de regreso.
 * Solo monitoreo: cambiar de cuenta es cosa del usuario, en Plantilla.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { Info } from 'lucide-vue-next'
import { T } from '../../../core/i18n'
import type { Account } from '../../../core/accounts'
import { useStudio } from '../stores/studio'
import { useUsage, windowsOf } from '../stores/usage'

defineEmits<{ accounts: [] }>()
const studio = useStudio()
const usage = useUsage()
onBeforeUnmount(usage.watch())

/** El color de cada proveedor, el mismo de su insignia. */
const COLOR: Record<string, string> = { claude: '#d97757', codex: '#3b82f6', antigravity: '#34a853', opencode: '#e5e5e5', commandcode: '#a78bfa', kimi: '#ff6b9d', grok: '#8a8a8a' }

const cliName = (id: string) => studio.clis.find((c) => c.id === id)?.name ?? id
const now = ref(Date.now())
const tick = setInterval(() => (now.value = Date.now()), 30_000)
onBeforeUnmount(() => clearInterval(tick))
const hour = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
/** Cuándo vuelve a cero: la hora si es hoy; si no, el día. */
const when = (ms: number) => (new Date(ms).toDateString() === new Date(now.value).toDateString() ? hour(ms) : new Date(ms).toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }))

const rows = computed(() =>
  usage.accounts.map((a: Account) => {
    const { short, week } = windowsOf(a)
    const out = !!short && short.used >= 100
    return {
      key: `${a.provider}:${a.dir}`,
      name: cliName(a.provider) + (a.main ? '' : ` · ${a.label}`),
      provider: a.provider,
      color: COLOR[a.provider] ?? 'var(--accent)',
      short,
      week,
      out,
      // El dato puede ser viejo: lo que la CLI anotó la última vez que trabajó.
      old: !!a.usage && now.value - a.usage.at > 60 * 60_000,
    }
  }),
)
const resting = computed(() => rows.value.filter((r) => r.out && r.short?.resetsAt))
</script>

<template>
  <div class="usage">
    <p v-if="!usage.loaded" class="dim">{{ T`Leyendo el uso de tus cuentas…` }}</p>
    <p v-else-if="!rows.length" class="dim">{{ T`No hay cuentas con sesión en esta máquina.` }}</p>
    <div v-for="r in rows" :key="r.key" class="row" :class="{ out: r.out }">
      <div class="top">
        <i :style="{ background: r.color }" />
        <b>{{ r.name }}</b>
        <span class="grow" />
        <strong v-if="r.out" class="bad">{{ T`agotado` }}</strong>
        <strong v-else-if="r.short">{{ Math.round(r.short.used) }}%</strong>
        <span v-else class="dim">{{ T`sin dato` }}</span>
      </div>
      <div class="meter"><b :style="{ width: `${Math.min(100, r.short?.used ?? 0)}%`, background: r.out ? 'var(--st-block)' : r.color }" /></div>
      <div class="foot">
        <span v-if="r.short" :class="{ bad: r.out }">
          {{ r.short.label }}<template v-if="r.short.resetsAt"> · {{ r.out ? T`vuelve ${when(r.short.resetsAt)}` : T`reinicia ${when(r.short.resetsAt)}` }}</template>
        </span>
        <span v-else class="dim">{{ T`Aparece cuando su CLI trabaje.` }}</span>
        <span class="grow" />
        <span v-if="r.week" class="dim">{{ T`semana ${Math.round(r.week.used)}%` }}</span>
      </div>
      <small v-if="r.old" class="dim">{{ T`Dato de la última vez que trabajó.` }}</small>
    </div>
    <p v-for="r in resting" :key="`resting-${r.key}`" class="note">
      <Info />{{ T`Quien trabaja con ${r.name} descansa hasta las ${hour(r.short!.resetsAt!)}.` }}
    </p>
    <button class="btn more" @click="$emit('accounts')">{{ T`Ver cuentas` }}</button>
  </div>
</template>

<style scoped>
.usage { flex: 1; min-height: 0; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 14px; }
.row { display: flex; flex-direction: column; gap: 6px; }
.top { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.top i { width: 10px; height: 10px; flex: none; }
.top strong { font-size: 12px; }
.grow { flex: 1; }
.meter { height: 8px; background: var(--bg); border: 2px solid var(--border); }
.meter b { display: block; height: 100%; }
.foot { display: flex; gap: 8px; font-size: 10px; color: var(--text-secondary); }
.dim { color: var(--text-secondary); font-size: 11px; margin: 0; }
.bad { color: var(--st-block); }
.note { display: flex; gap: 8px; margin: 0; padding: 8px 10px; font-size: 11px; line-height: 1.5; color: var(--text-secondary); background: var(--bg); border: 2px solid var(--border); }
.note svg { width: 14px; height: 14px; flex: none; margin-top: 1px; }
.more { align-self: flex-start; padding: 4px 10px; }
</style>
