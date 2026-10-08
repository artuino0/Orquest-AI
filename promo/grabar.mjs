// Graba promo/video.html en tiempo real y lo junta con la voz.
//
//   npx vite src/renderer        (en otra terminal: la oficina se sirve en el puerto 5173)
//   node promo/grabar.mjs        → promo/salida/orquest-ai.mp4
//
// Necesita Chrome y ffmpeg. Los 13 clips de voz van en promo/audio/ (01-ella.mp3 … 13-ella.mp3).
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'salida')
const frames = join(out, 'cuadros')
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9335
/** Segundos que se deja a las oficinas antes de arrancar: cada quien llega a su silla. */
const WARMUP = 12

rmSync(frames, { recursive: true, force: true })
mkdirSync(frames, { recursive: true })

const chrome = spawn(CHROME, ['--headless=new', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(out, 'chrome')}`, '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let tabs
for (let i = 0; i < 40 && !tabs; i++) { await sleep(250); tabs = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json(), () => null) }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const waiting = new Map()
/** [segundo del reloj de Chrome, archivo] de cada cuadro recibido. */
const shots = []
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.method === 'Page.screencastFrame') {
    const file = join(frames, `${String(shots.length).padStart(5, '0')}.jpg`)
    writeFileSync(file, Buffer.from(d.params.data, 'base64'))
    shots.push([d.params.metadata.timestamp, file])
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: d.params.sessionId } }))
    return
  }
  waiting.get(d.id)?.(d.result)
}
const cmd = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression) => (await cmd('Runtime.evaluate', { expression, returnByValue: true })).result?.value

await cmd('Page.enable'); await cmd('Runtime.enable')
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
await cmd('Page.navigate', { url: pathToFileURL(join(here, 'video.html')).href })
for (let i = 0; i < 60 && !(await js('window.listo?.()')); i++) await sleep(500)
if (!(await js('window.listo?.()'))) { console.error('La oficina no cargó. ¿Está corriendo `npx vite src/renderer` en el puerto 5173?'); chrome.kill(); process.exit(1) }
await sleep(WARMUP * 1000)

const voz = await js('window.VOZ')
const fin = await js('window.FIN')
await cmd('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 })
await sleep(300)
// El arranque se mide con el mismo reloj que marca cada cuadro.
const t0 = await js('(window.empezar(), Date.now() / 1000)')
await sleep(fin * 1000 + 400)
await cmd('Page.stopScreencast')
chrome.kill()

// Cada cuadro dura hasta el siguiente; lo anterior al arranque se descarta.
const used = shots.filter(([t]) => t >= t0 - 0.05)
const lines = []
used.forEach(([t, file], i) => {
  const next = used[i + 1]?.[0] ?? t0 + fin
  lines.push(`file '${file.replaceAll('\\', '/')}'`, `duration ${Math.max(0.001, Math.min(next, t0 + fin) - t).toFixed(4)}`)
})
lines.push(`file '${used.at(-1)[1].replaceAll('\\', '/')}'`)
writeFileSync(join(out, 'cuadros.txt'), lines.join('\n'))
console.log(`${used.length} cuadros en ${fin} s (${(used.length / fin).toFixed(1)} por segundo)`)

// Voz: cada clip entra en su segundo.
const inputs = voz.flatMap(([, , name]) => ['-i', join(here, 'audio', `${name}.mp3`)])
const delays = voz.map(([t], i) => `[${i + 1}:a]adelay=${Math.round(t * 1000)}:all=1[a${i}]`).join(';')
const mix = `${delays};${voz.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voz.length}:normalize=0,apad=whole_dur=${fin}[a]`
const target = join(out, 'orquest-ai.mp4')
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(out, 'cuadros.txt'), ...inputs,
  '-filter_complex', `[0:v]fps=30,scale=1920:1080:flags=neighbor,format=yuv420p[v];${mix}`, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-t', String(fin), target], { stdio: 'inherit' })
if (r.status) process.exit(r.status)
console.log(target)
process.exit(0)
