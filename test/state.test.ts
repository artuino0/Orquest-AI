import { describe, expect, it } from 'vitest'
import { PROVIDERS } from '../src/core/providers.js'
import { ScreenReader, parseOscState, stripAnsi } from '../src/core/state.js'

describe('stripAnsi', () => {
  it('quita colores y OSC', () => {
    expect(stripAnsi('\x1b[31mhola\x1b[0m \x1b]0;titulo\x07mundo')).toBe('hola mundo')
  })
})

describe('parseOscState', () => {
  it('toma la última señal del hook', () => {
    expect(parseOscState('a\x1b]7777;orquest:state=working\x07b\x1b]7777;orquest:state=idle\x07')).toBe('idle')
    expect(parseOscState('nada')).toBeUndefined()
  })
})

describe('ScreenReader', () => {
  const claude = PROVIDERS.claude.screen

  it('detecta trabajando, bloqueado e idle con patrones de Claude', () => {
    const r = new ScreenReader(claude)
    expect(r.feed('✻ Pensando… (esc to interrupt)\n')).toBe('working')
    expect(r.feed('\n'.repeat(20) + 'Do you want to proceed?\n❯ 1. Yes\n')).toBe('blocked')
    expect(r.feed('\n'.repeat(20) + '> \n? for shortcuts\n')).toBe('idle')
  })

  it('el hook gana sobre la pantalla mientras está fresco', () => {
    let t = 0
    const r = new ScreenReader(claude, 4000, 1000, () => t)
    expect(r.feed('\x1b]7777;orquest:state=blocked\x07esc to interrupt')).toBe('blocked')
    t = 2000
    expect(r.current()).toBe('working')
  })
})

describe('adaptadores', () => {
  it('Claude recibe modelo, esfuerzo y manual', () => {
    expect(PROVIDERS.claude.buildArgs({ model: 'opus', effort: 'high', systemPrompt: 'Eres QA' })).toEqual([
      '--model', 'opus', '--effort', 'high', '--append-system-prompt', 'Eres QA',
    ])
  })
  it('Codex usa -m y model_reasoning_effort', () => {
    expect(PROVIDERS.codex.buildArgs({ model: 'gpt-5', effort: 'low' })).toEqual([
      '-m', 'gpt-5', '-c', 'model_reasoning_effort=low',
    ])
  })
  it('avisa lo que un proveedor genérico no soporta', () => {
    expect(PROVIDERS.grok.unsupported({ effort: 'high' })).toHaveLength(1)
  })
  it('ningún proveedor salta permisos por defecto', () => {
    for (const p of Object.values(PROVIDERS)) {
      const args = p.buildArgs({ model: 'x', effort: 'high', systemPrompt: 'y' }).join(' ')
      expect(args).not.toMatch(/skip-permissions|bypass|yolo/i)
    }
  })
})
