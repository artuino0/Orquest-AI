#!/usr/bin/env node
// Comando `orquest`: las herramientas de Orquest desde la terminal de un agente.
// No tiene dependencias ni lógica: manda lo que recibe al servidor local de la
// app, que sabe quién llama por el token de ORQUEST_URL y aplica las reglas.
//
//   orquest ayuda
//   orquest reportar_estado --estado trabajando --nota "voy a la mitad"
//   orquest asignar_tarea --empleado ana-backend --titulo API --depende_de T1 --depende_de T2
//   orquest proponer_plantilla --json - < plantilla.json

const url = process.env.ORQUEST_URL
// El idioma lo dice la app al lanzar la terminal (ORQUEST_LANG). Este comando no tiene
// dependencias, así que trae sus pocos textos en los dos idiomas.
const EN = process.env.ORQUEST_LANG === 'en'
const L = (es, en) => (EN ? en : es)

function fail(code, text) {
  process.stderr.write(`${text}\n`)
  process.exit(code)
}

async function stdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8').trim()
}

/** --campo valor, --campo=valor, --campo (sí), --no-campo (no); repetir una bandera arma una lista. */
async function parse(argv) {
  const args = {}
  let whole
  const put = (k, v) => {
    if (k in args) args[k] = [].concat(args[k], v)
    else args[k] = v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) fail(2, `No entiendo "${a}". Los campos van como --campo valor.`)
    const eq = a.indexOf('=')
    let key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-/g, '_')
    let value
    if (eq > 0) value = a.slice(eq + 1)
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) value = argv[++i]
    else if (key.startsWith('no_')) [key, value] = [key.slice(3), false]
    else value = true
    // Un guion solo lee el valor de la entrada estándar: textos largos o JSON sin pelear con comillas.
    if (value === '-') value = await stdin()
    if (key === 'json') whole = value
    else put(key, value)
  }
  if (whole === undefined) return args
  try {
    return { ...JSON.parse(whole), ...args }
  } catch {
    fail(2, L('--json no es JSON válido.', '--json is not valid JSON.'))
  }
}

async function request(init) {
  try {
    const res = await fetch(url, init)
    if (res.status === 401) fail(2, L('Orquest no reconoce esta terminal (el agente ya no está contratado).', "Orquest doesn't recognize this terminal (the agent is no longer hired)."))
    return await res.json()
  } catch {
    fail(2, L('Orquest no responde. ¿Sigue abierta la app?', 'Orquest is not responding. Is the app still open?'))
  }
}

function help(me, only) {
  const lines = [L(`Eres ${me.quien} (${me.id}).`, `You are ${me.quien} (${me.id}).`), L('Uso: orquest <herramienta> [--campo valor …]', 'Usage: orquest <tool> [--field value …]'), '']
  for (const t of me.herramientas.filter((x) => !only || x.nombre === only)) {
    lines.push(`  ${t.nombre}: ${t.descripcion}`)
    for (const f of t.campos) lines.push(`      --${f.nombre} <${f.tipo}>${f.requerido ? '' : L(' (opcional)', ' (optional)')}${f.descripcion ? `  ${f.descripcion}` : ''}`)
  }
  lines.push('', L('Una lista se arma repitiendo la bandera o con JSON. "--campo -" lee el valor de la entrada estándar; "--json" recibe todos los campos de una vez.', 'A list is built by repeating the flag or with JSON. "--field -" reads the value from standard input; "--json" takes all the fields at once.'))
  return lines.join('\n')
}

/**
 * Gancho de Antigravity antes de cada herramienta (`.agents/hooks.json` de su oficina): niega los
 * comandos que el manual del puesto prohíbe (ORQUEST_DENY, prefijos). agy no recibe permisos por
 * argumento y, con su ajuste «always-proceed», corre todo sin preguntar; esto lo frena igual.
 * Un comando encadenado (`cd x && git push`) se revisa por partes.
 */
async function agyHook() {
  let call = {}
  try {
    call = JSON.parse((await stdin()) || '{}')
  } catch {}
  let deny = []
  try {
    deny = JSON.parse(process.env.ORQUEST_DENY || '[]')
  } catch {}
  const line = call.toolCall?.name === 'run_command' ? String(call.toolCall.args?.CommandLine ?? '') : ''
  const parts = line.split(/&&|\|\||;|\||\n/).map((p) => p.trim().replace(/\s+/g, ' '))
  const hit = deny.find((d) => parts.some((p) => p === d || p.startsWith(`${d} `)))
  process.stdout.write(
    JSON.stringify(
      hit
        ? { decision: 'deny', reason: L(`Prohibido por el manual de tu puesto en Orquest: «${hit}». Si de verdad hace falta, pídeselo al jefe.`, `Forbidden by your role manual in Orquest: "${hit}". If it's really needed, ask the boss.`) }
        : { decision: 'allow' },
    ),
  )
}

const [tool, ...rest] = process.argv.slice(2)
if (tool === 'gancho-agy') {
  await agyHook()
  process.exit(0)
}
if (!url) fail(2, L('Esta terminal no la lanzó Orquest (falta ORQUEST_URL).', "Orquest didn't launch this terminal (ORQUEST_URL is missing)."))

if (!tool || ['ayuda', 'help', '--help', '-h'].includes(tool)) {
  console.log(help(await request()))
} else if (rest.some((a) => ['--help', '-h', '--ayuda'].includes(a))) {
  // `orquest <herramienta> --help`: los campos de esa herramienta (los agentes lo intentan solos).
  console.log(help(await request(), tool.replace(/-/g, '_')))
} else if (tool === 'quien') {
  const me = await request()
  console.log(`${me.quien} ${me.id}`)
} else {
  const r = await request({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ herramienta: tool.replace(/-/g, '_'), args: await parse(rest) }),
  })
  if (r.ok) console.log(r.texto)
  else fail(1, L(`Rechazado: ${r.motivo}`, `Rejected: ${r.motivo}`))
}
