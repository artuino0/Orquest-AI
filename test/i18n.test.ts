import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error guion sin tipos: saca las claves de los T`…` de un texto
import { keysIn } from '../scripts/i18n-claves.mjs'
import { addDictionary, getLang, keyOf, pickLang, setLang, T } from '../src/core/i18n.js'
import core from '../src/core/lang/en.js'
import { loadSettings, saveSettings, startLang } from '../src/core/settings.js'
import ui from '../src/renderer/src/lang/en.js'

afterEach(() => setLang('es'))

describe('idiomas', () => {
  it('sin diccionario el texto sale tal cual, con sus valores', () => {
    expect(getLang()).toBe('es')
    expect(T`Hola`).toBe('Hola')
    expect(T`No existe el empleado ${'ana'} (${2}).`).toBe('No existe el empleado ana (2).')
  })

  it('con diccionario sale traducido y los valores pueden cambiar de orden', () => {
    addDictionary('en', { 'Prueba de {0} para {1}': 'Test for {1} by {0}', 'Prueba suelta': 'Loose test' })
    setLang('en')
    expect(T`Prueba de ${'Ana'} para ${'Beto'}`).toBe('Test for Beto by Ana')
    expect(T`Prueba suelta`).toBe('Loose test')
    // Lo que no está traducido se queda en español: no rompe nada.
    expect(T`Texto que nadie tradujo ${1}`).toBe('Texto que nadie tradujo 1')
    setLang('es')
    expect(T`Prueba suelta`).toBe('Prueba suelta')
  })

  it('elige el primer idioma del sistema que la app habla; si ninguno, inglés', () => {
    expect(pickLang(['es-MX', 'en-US'])).toBe('es')
    expect(pickLang(['fr-FR', 'en-GB', 'es'])).toBe('en')
    expect(pickLang(['de', 'ja_JP'])).toBe('en')
    expect(pickLang([])).toBe('en')
  })

  it('lo que elige el usuario se guarda y gana al idioma del sistema', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orquest-ajustes-'))
    try {
      const file = join(dir, 'sub', 'ajustes.json')
      expect(await loadSettings(file)).toEqual({})
      expect(startLang({}, ['es-MX'])).toBe('es')
      await saveSettings(file, { lang: 'en' })
      const saved = await loadSettings(file)
      expect(saved).toEqual({ lang: 'en' })
      expect(startLang(saved, ['es-MX'])).toBe('en')
      // Un archivo roto o con un idioma que no existe cuenta como sin elegir.
      writeFileSync(file, '{ "lang": "klingon" }')
      expect(await loadSettings(file)).toEqual({})
      writeFileSync(file, 'no es json')
      expect(await loadSettings(file)).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('saca la clave de cada plantilla, también de las anidadas', () => {
    expect(keyOf(['a ', ' b ', ''])).toBe('a {0} b {1}')
    expect(keysIn('const a = T`Hola ${x} y ${f(`z`, {a: 1})}`\nconst b = T`uno\\ndos`')).toEqual(['Hola {0} y {1}', 'uno\ndos'])
    expect(keysIn('T`Fuera ${ok ? T`dentro ${n}` : \'\'} fin`')).toEqual(['Fuera {0} fin', 'dentro {0}'])
    // Solo la etiqueta T: ni otras plantillas ni nombres que terminan en T.
    expect(keysIn('const x = `nada`; LIST`tampoco`; obj.T`ni esto`')).toEqual([])
  })
})

/** Los fuentes donde puede haber texto para el usuario o para los agentes. */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'lang') sources(full, out)
    } else if (/\.(ts|vue|js|mjs)$/.test(name) && name !== 'i18n.ts') out.push(full) // i18n.ts solo trae ejemplos
  }
  return out
}

describe('diccionario en inglés', () => {
  const en: Record<string, string> = { ...core, ...ui }

  it('trae todo texto marcado con T en el código', () => {
    const missing: string[] = []
    for (const file of sources('src')) {
      for (const key of new Set<string>(keysIn(readFileSync(file, 'utf8')))) {
        if (!(key in en)) missing.push(`${relative('.', file).replace(/\\/g, '/')}: ${JSON.stringify(key)}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('cada traducción lleva los mismos valores que su original', () => {
    const holes = (text: string) => [...new Set(text.match(/\{\d+\}/g) ?? [])].sort().join()
    const wrong = Object.entries(en).filter(([key, value]) => holes(key) !== holes(value) || !value.trim()).map(([key]) => key)
    expect(wrong).toEqual([])
  })
})
