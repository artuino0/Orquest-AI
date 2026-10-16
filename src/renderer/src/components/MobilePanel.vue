<script setup lang="ts">
/**
 * Celular: prender el acceso desde la app móvil, emparejar un celular con su QR
 * (o el código), ver y quitar los emparejados, y si los avisos llevan detalle.
 * Solo muestra lo que da el núcleo (core/mobile).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RefreshCw, Smartphone, Trash2 } from 'lucide-vue-next'
import { renderSVG } from 'uqr'
import { useStudio } from '../stores/studio'
import { ago } from '../format'
import type { MobileStatus } from '../../../core/mobile'
import PanelFrame from './PanelFrame.vue'
import { T } from '../../../core/i18n'

const studio = useStudio()
const status = ref<MobileStatus | null>(null)
const busy = ref(false)
const now = ref(Date.now())

async function run(fn: () => Promise<MobileStatus>) {
  busy.value = true
  await studio.attempt(async () => (status.value = await fn()))
  busy.value = false
}
const load = () => run(() => window.orquest.mobileStatus())
const enable = (on: boolean) => run(() => window.orquest.mobileEnable(on))
const newCode = () => run(() => window.orquest.mobileCode())
const revoke = (id: string) => run(() => window.orquest.mobileRevoke(id))
const detail = (on: boolean) => run(() => window.orquest.mobileDetail(on))
// El código vence y los dispositivos se conectan: se vuelve a mirar cada tanto.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  timer = setInterval(() => {
    now.value = Date.now()
    if (Math.floor(now.value / 1000) % 10 === 0) void load()
  }, 1000)
})
onBeforeUnmount(() => clearInterval(timer))

const s = computed(() => status.value)
/** El QR se dibuja aquí mismo, sin pedirlo a ningún servicio. */
const qr = computed(() => (s.value?.pairing ? renderSVG(s.value.pairing.qr, { border: 1, whiteColor: '#ffffff', blackColor: '#000000' }) : ''))
const left = computed(() => {
  const ms = (s.value?.pairing?.expiresAt ?? 0) - now.value
  if (ms <= 0) return ''
  const m = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(sec).padStart(2, '0')}`
})
</script>

<template>
  <PanelFrame :title="T`Celular`" :subtitle="T`Contesta a tu equipo desde el celular`">
    <div v-if="s" class="mobile">
      <label class="switch">
        <input type="checkbox" :checked="s.enabled" :disabled="busy" @change="enable(($event.target as HTMLInputElement).checked)" />
        <span>
          <b>{{ T`Acceso desde el celular` }}</b>
          <small>{{ s.enabled ? T`Prendido: esta compu escucha en el puerto ${s.port ?? ''} de tu red.` : T`Apagado: nada fuera de esta compu puede conectarse.` }}</small>
        </span>
      </label>
      <p v-if="s.error" class="bad">{{ s.error }}</p>

      <template v-if="s.enabled">
        <section class="pair">
          <div class="qr">
            <!-- eslint-disable-next-line vue/no-v-html -- SVG generado aquí con uqr, no viene de fuera -->
            <div v-if="qr && left" class="code-img" v-html="qr" />
            <div v-else class="code-img empty"><Smartphone /></div>
          </div>
          <div class="how">
            <h3>{{ T`Emparejar un celular` }}</h3>
            <p>{{ T`Abre Orquest en tu celular, toca Emparejar y escanea el código. O escríbelo:` }}</p>
            <p v-if="s.pairing && left" class="code">{{ s.pairing.code }} <small>{{ T`vence en ${left}` }}</small></p>
            <button class="btn primary" :disabled="busy" @click="newCode"><RefreshCw /> {{ s.pairing && left ? T`Otro código` : T`Generar código` }}</button>
            <p class="dim">{{ T`La app para el celular todavía no está publicada.` }}</p>
          </div>
        </section>

        <section>
          <h3>{{ T`Por dónde llega` }}</h3>
          <ul class="list">
            <li v-for="a in s.addresses" :key="a.ip">
              <b>{{ a.ip }}</b>
              <span class="dim">{{ a.via === 'tailscale' ? T`Tailscale: en casa y fuera, cifrado` : T`Tu red local: solo en casa, sin cifrar` }}</span>
            </li>
            <li v-if="!s.addresses.length" class="dim">{{ T`Esta compu no está conectada a ninguna red.` }}</li>
          </ul>
          <p v-if="!s.addresses.some((a) => a.via === 'tailscale')" class="dim">{{ T`Para usarlo fuera de casa, o para que el camino vaya cifrado, instala Tailscale en la compu y en el celular.` }}</p>
        </section>

        <section>
          <h3>{{ T`Celulares emparejados` }}</h3>
          <ul class="list">
            <li v-for="d in s.devices" :key="d.id">
              <b>{{ d.name }}</b>
              <span class="dim">{{ d.lastSeen ? T`visto ${ago(d.lastSeen, now)}` : T`emparejado ${ago(d.pairedAt, now)}` }} · {{ d.push ? T`recibe avisos` : T`sin avisos` }}</span>
              <button class="btn danger" :disabled="busy" :title="T`Ya no podrá entrar; para volver, se empareja de nuevo`" @click="revoke(d.id)"><Trash2 /> {{ T`Quitar` }}</button>
            </li>
            <li v-if="!s.devices.length" class="dim">{{ T`Ninguno todavía.` }}</li>
          </ul>
        </section>

        <label class="switch">
          <input type="checkbox" :checked="s.detail" :disabled="busy" @change="detail(($event.target as HTMLInputElement).checked)" />
          <span>
            <b>{{ T`Avisos con detalle` }}</b>
            <small>{{ T`Los avisos salen por el servicio de Expo hacia Apple o Google. Sin detalle dicen solo quién y qué pasa («Lupita te necesita»); con detalle llevan la pregunta o el título de la entrega.` }}</small>
          </span>
        </label>
      </template>
    </div>
  </PanelFrame>
</template>

<style scoped>
.mobile { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px; font-size: 12px; max-width: 760px; }
.switch { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.switch input { margin-top: 2px; }
.switch span { display: flex; flex-direction: column; gap: 3px; }
.switch small { color: var(--text-secondary); line-height: 1.5; }
.pair { display: flex; gap: 18px; align-items: flex-start; padding: 14px; background: var(--surface); border: 3px solid var(--border); }
.code-img { width: 180px; height: 180px; display: grid; place-items: center; background: #fff; border: 3px solid var(--border); image-rendering: pixelated; }
.code-img :deep(svg) { width: 100%; height: 100%; }
.code-img.empty { background: var(--bg); color: var(--text-secondary); }
.code-img.empty svg { width: 40px; height: 40px; }
.how { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.how h3, section h3 { margin: 0 0 6px; font: 700 13px var(--font); }
.how p { margin: 0; line-height: 1.5; }
.code { font: 700 26px var(--font); letter-spacing: 4px; color: var(--accent); }
.code small { font-size: 11px; letter-spacing: 0; color: var(--text-secondary); font-weight: 400; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--surface); border: 2px solid var(--border); }
.list li .dim { flex: 1; }
.list .btn { padding: 4px 10px; }
.dim { color: var(--text-secondary); }
.bad { color: var(--st-block); margin: 0; }
</style>
