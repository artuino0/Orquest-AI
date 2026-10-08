// Graba promo/video.html cuadro por cuadro y lo junta con la voz.
//
//   npx vite src/renderer        (en otra terminal: sirve la oficina y esta página en el puerto 5173)
//   node promo/grabar.mjs        → promo/salida/orquest-ai.mp4 (1080×1920, 60 cuadros por segundo)
//
// No se graba en tiempo real: el reloj de la página se detiene, se avanza un
// sesentavo de segundo y se toma la foto. Así ningún cuadro se pierde ni se
// repite, por lento que vaya la máquina.
//
// Necesita Chrome y ffmpeg. Los 13 clips de voz van en promo/audio/ (01-ella.mp3 … 13-ella.mp3).
//   node promo/grabar.mjs 12     graba solo los primeros 12 segundos (para probar)
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'salida')
const frames = join(out, 'cuadros')
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const SERVER = process.env.ORQUEST_VISTA ?? 'http://localhost:5173'
const PORT = 9335
const FPS = 60
/** Segundos (reales) que se deja a las oficinas antes de arrancar: cada quien llega a su silla. */
const WARMUP = 12

rmSync(frames, { recursive: true, force: true })
mkdirSync(frames, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(out, 'chrome')}`, '--window-size=720,1280', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let tabs
for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json(), () => null) }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const waiting = new Map()
let onBudget = null
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.method === 'Emulation.virtualTimeBudgetExpired') return onBudget?.()
  waiting.get(d.id)?.(d.result)
}
const cmd = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression) => (await cmd('Runtime.evaluate', { expression, returnByValue: true })).result?.value
const stop = (code) => { chrome.kill(); process.exit(code) }

await cmd('Page.enable'); await cmd('Runtime.enable')
// 720×1280 a 1.5 = 1080×1920.
await cmd('Emulation.setDeviceMetricsOverride', { width: 720, height: 1280, deviceScaleFactor: 1.5, mobile: false })
// Mismo origen que la oficina: así el reloj detenido vale también dentro de ella.
await cmd('Page.navigate', { url: `${SERVER}/@fs/${here.replaceAll('\\', '/')}/video.html` })
for (let i = 0; i < 60 && !(await js('window.listo?.()')); i++) await sleep(500)
if (!(await js('window.listo?.()'))) { console.error(`La oficina no cargó. ¿Está corriendo \`npx vite src/renderer\` en ${SERVER}?`); stop(1) }
await sleep(WARMUP * 1000)

const voz = await js('window.VOZ')
const fin = Math.min(await js('window.FIN'), Number(process.argv[2]) || Infinity)

await cmd('Emulation.setVirtualTimePolicy', { policy: 'pause' })
await js('window.empezar()')
const total = Math.round(fin * FPS)
const began = Date.now()
for (let i = 0; i < total; i++) {
  const expired = new Promise((r) => (onBudget = r))
  await cmd('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: 1000 / FPS })
  await expired
  const { data } = await cmd('Page.captureScreenshot', { format: 'jpeg', quality: 95 })
  writeFileSync(join(frames, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'))
  if (i % 300 === 299) console.log(`${((i + 1) / FPS).toFixed(0)} s de ${fin} (${((Date.now() - began) / 1000).toFixed(0)} s reales)`)
}
chrome.kill()

// Voz: cada clip entra en su segundo.
const clips = voz.filter(([t]) => t < fin)
const inputs = clips.flatMap(([, , name]) => ['-i', join(here, 'audio', `${name}.mp3`)])
const delays = clips.map(([t], i) => `[${i + 1}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`).join(';')
const mix = `${delays};${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${fin}[a]`
const target = join(out, 'orquest-ai.mp4')
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(frames, '%05d.jpg'), ...inputs,
  '-filter_complex', `[0:v]format=yuv420p[v];${mix}`, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-t', String(fin), '-movflags', '+faststart', target], { stdio: 'inherit' })
if (r.status) process.exit(r.status)
console.log(target)
process.exit(0)
