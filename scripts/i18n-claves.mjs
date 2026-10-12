// Saca las claves de traducción de un texto fuente: una por cada T`…` (ver src/core/i18n.ts).
// Lo usa test/i18n.test.ts, que revisa que todas estén en inglés. Para ver las de unos archivos:
//   node scripts/i18n-claves.mjs src/core/board.ts …
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const COOKED = { n: '\n', t: '\t', r: '\r', '`': '`', '\\': '\\', $: '$', '{': '{', "'": "'", '"': '"' }

function skipString(src, i) {
  const quote = src[i++]
  while (i < src.length && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
  return i + 1
}
function skipTemplate(src, i) {
  while (i < src.length) {
    if (src[i] === '\\') i += 2
    else if (src[i] === '`') return i + 1
    else if (src[i] === '$' && src[i + 1] === '{') i = skipExpression(src, i + 2)
    else i++
  }
  return i
}
/** Desde dentro de un `${`, hasta después de su `}`. */
function skipExpression(src, i) {
  let depth = 1
  while (i < src.length && depth) {
    const c = src[i]
    if (c === '`') i = skipTemplate(src, i + 1)
    else if (c === "'" || c === '"') i = skipString(src, i)
    else {
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
  }
  return i
}

/** Las claves de todos los T`…` del texto, también los que van dentro de otro. */
export function keysIn(source) {
  const src = source.replace(/\r\n/g, '\n')
  const keys = []
  const start = /(?<![\w$.])T`/g
  for (let m; (m = start.exec(src)); ) {
    let i = m.index + 2
    let key = ''
    let holes = 0
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') {
        key += COOKED[src[i + 1]] ?? src[i + 1]
        i += 2
      } else if (src[i] === '$' && src[i + 1] === '{') {
        i = skipExpression(src, i + 2)
        key += `{${holes++}}`
      } else key += src[i++]
    }
    keys.push(key)
    start.lastIndex = m.index + 2
  }
  return keys
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const file of process.argv.slice(2)) for (const key of new Set(keysIn(readFileSync(file, 'utf8')))) console.log(JSON.stringify(key))
}
