import { describe, expect, it } from 'vitest'
import { PROVIDERS } from '../src/core/providers.js'
import { ScreenReader, parseOscState, stripAnsi } from '../src/core/state.js'

describe('stripAnsi', () => {
  it('quita colores y OSC', () => {
    expect(stripAnsi('\x1b[31mhola\x1b[0m \x1b]0;titulo\x07mundo')).toBe('hola mundo')
  })
  it('el avance del cursor cuenta como espacios', () => {
    expect(stripAnsi('esc\x1b[1Cto\x1b[Cinterrupt\x1b[3Cx')).toBe('esc to interrupt   x')
    // Como lo dibuja Claude Code: columna absoluta.
    expect(stripAnsi('\r\n\x1b[2G\x1b[1mChoose\x1b[9Gthe\x1b[13Gtext\x1b[22m\r\n')).toBe('\r\n Choose the text\r\n')
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

  it('detecta trabajando, bloqueado e idle con patrones de Claude', async () => {
    const r = new ScreenReader(claude)
    expect(await r.write('✻ Pensando… (esc to interrupt)\r\n')).toBe('working')
    expect(await r.write('\r\n'.repeat(40) + 'Do you want to proceed?\r\n❯ 1. Yes\r\n')).toBe('blocked')
    expect(await r.write('\r\n'.repeat(40) + '> \r\n? for shortcuts\r\n')).toBe('idle')
  })

  it('lee lo que hay en pantalla, no restos de lo que se redibujó', async () => {
    const r = new ScreenReader(claude, { cols: 60, rows: 6 })
    expect(await r.write('Do you trust this folder?\r\n❯ No, exit\r\n')).toBe('blocked')
    // Borra la pantalla y dibuja el prompt en su lugar, como hace la TUI.
    expect(await r.write('\x1b[2J\x1b[H> \r\n\x1b[2G?\x1b[4Gfor\x1b[8Gshortcuts')).toBe('idle')
    expect(r.screen()).toContain(' ? for shortcuts')
  })

  it('el hook gana sobre la pantalla mientras está fresco', async () => {
    let t = 0
    const r = new ScreenReader(claude, { hookTtlMs: 1000, now: () => t })
    expect(await r.write('\x1b]7777;orquest:state=blocked\x07esc to interrupt')).toBe('blocked')
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
    // Kimi no recibe esfuerzo por argumento; Grok sí (--reasoning-effort) y ya no avisa.
    expect(PROVIDERS.kimi.unsupported({ effort: 'high' })).toHaveLength(1)
    expect(PROVIDERS.grok.unsupported({ effort: 'high' })).toHaveLength(0)
  })
  it('ningún proveedor salta permisos por defecto', () => {
    for (const p of Object.values(PROVIDERS)) {
      const args = p.buildArgs({ model: 'x', effort: 'high', systemPrompt: 'y' }).join(' ')
      expect(args).not.toMatch(/skip-permissions|bypass|yolo/i)
    }
  })
})

describe('prompt listo', () => {
  it('las pantallas de primer arranque de Claude cuentan como bloqueado', async () => {
    const r = new ScreenReader(PROVIDERS.claude.screen)
    expect(await r.write('Security notes: ... Press Enter to continue…')).toBe('blocked')
    expect(r.promptVisible()).toBe(false)
    expect(await r.write('\r\n'.repeat(40) + '> \r\n? for shortcuts\r\n')).toBe('idle')
    expect(r.promptVisible()).toBe(true)
  })
})

describe('prompt de Claude Code con barra de estado', () => {
  it('reconoce la caja de entrada aunque no se vea "? for shortcuts"', async () => {
    const r = new ScreenReader(PROVIDERS.claude.screen, { cols: 80, rows: 12 })
    const line = '─'.repeat(78)
    // Como se ve con statusLine configurada (capturado de la CLI real).
    expect(await r.write(`${line}\r\n❯ Try "write a test for <filepath>"\r\n${line}\r\n  ⏸ manual mode on`)).toBe('idle')
    expect(r.promptVisible()).toBe(true)
    // Trabajando, la caja sigue ahí pero manda el spinner.
    expect(await r.write('\x1b[2J\x1b[H✻ Pensando… (esc to interrupt)\r\n' + `${line}\r\n❯ \r\n${line}`)).toBe('working')
    expect(r.promptVisible()).toBe(false)
  })
})
