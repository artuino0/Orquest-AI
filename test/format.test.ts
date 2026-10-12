import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { formatText, projectOptions } from '../src/core/format.js'

const made: string[] = []
function office() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orq-format-')))
  made.push(dir)
  mkdirSync(join(dir, 'src'))
  return dir
}
afterEach(() => made.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('formatear con Prettier', () => {
  it('formatea según el tipo de archivo, con las opciones de fábrica si el proyecto no trae', async () => {
    const dir = office()
    expect(await formatText(dir, 'src/a.ts', 'const  a = {b:1,\n c:2}')).toBe('const a = { b: 1, c: 2 };\n')
    expect(await formatText(dir, 'datos.json', '{"a":1,"b":[1,2]}')).toBe('{ "a": 1, "b": [1, 2] }\n')
    expect(await formatText(dir, 'src/x.css', 'a{color:red}')).toBe('a {\n  color: red;\n}\n')
  })

  it('usa las opciones del proyecto: las de la carpeta más cercana', async () => {
    const dir = office()
    writeFileSync(join(dir, '.prettierrc'), '{ "semi": false, "singleQuote": true }')
    expect(await formatText(dir, 'src/a.ts', 'const a = "x";')).toBe("const a = 'x'\n")
    writeFileSync(join(dir, 'src', 'package.json'), '{ "prettier": { "semi": true } }')
    expect(await formatText(dir, 'src/a.ts', 'const a = "x"')).toBe('const a = "x";\n')
  })

  it('de la configuración solo toma datos: ni plugins ni nada fuera de la oficina', async () => {
    const dir = office()
    writeFileSync(join(dir, '.prettierrc'), '{ "tabWidth": 4, "plugins": ["./malo.js"], "parser": "babel", "overrides": [] }')
    expect(await projectOptions(dir, 'src/a.ts')).toEqual({ tabWidth: 4 })
    // Una configuración que no es JSON (YAML, JavaScript) no se carga: quedan las de fábrica.
    writeFileSync(join(dir, '.prettierrc'), 'semi: false\n')
    expect(await projectOptions(dir, 'src/a.ts')).toEqual({})
    expect(await projectOptions(dir, '../otra/a.ts')).toEqual({})
  })

  it('dice claro cuando no puede', async () => {
    const dir = office()
    await expect(formatText(dir, 'main.py', 'x=1')).rejects.toThrow(RuleError)
    await expect(formatText(dir, 'src/a.ts', 'const = ;')).rejects.toThrow(/No se pudo formatear|Could not format/)
  })
})
