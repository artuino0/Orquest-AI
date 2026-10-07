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
    fail(2, '--json no es JSON válido.')
  }
}

async function request(init) {
  try {
    const res = await fetch(url, init)
    if (res.status === 401) fail(2, 'Orquest no reconoce esta terminal (el agente ya no está contratado).')
    return await res.json()
  } catch {
    fail(2, 'Orquest no responde. ¿Sigue abierta la app?')
  }
}

function help(me) {
  const lines = [`Eres ${me.quien} (${me.id}).`, 'Uso: orquest <herramienta> [--campo valor …]', '']
  for (const t of me.herramientas) {
    lines.push(`  ${t.nombre}: ${t.descripcion}`)
    for (const f of t.campos) lines.push(`      --${f.nombre} <${f.tipo}>${f.requerido ? '' : ' (opcional)'}${f.descripcion ? `  ${f.descripcion}` : ''}`)
  }
  lines.push('', 'Una lista se arma repitiendo la bandera o con JSON. "--campo -" lee el valor de la entrada estándar; "--json" recibe todos los campos de una vez.')
  return lines.join('\n')
}

const [tool, ...rest] = process.argv.slice(2)
if (!url) fail(2, 'Esta terminal no la lanzó Orquest (falta ORQUEST_URL).')

if (!tool || ['ayuda', 'help', '--help', '-h'].includes(tool)) {
  console.log(help(await request()))
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
  else fail(1, `Rechazado: ${r.motivo}`)
}
