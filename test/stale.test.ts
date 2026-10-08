import { describe, expect, it } from 'vitest'
import { PROVIDERS } from '../src/core/providers.js'
import { ScreenReader } from '../src/core/state.js'

describe('indicador de "trabajando" que se quedó en pantalla', () => {
  it('si no cambia en varios segundos ya no cuenta: el agente está libre', async () => {
    let t = 1000
    const r = new ScreenReader(PROVIDERS.kimi.screen, { now: () => t })
    // Una respuesta dejó en pantalla un renglón que parece indicador, y debajo está el prompt.
    expect(await r.write('· Revisando…\r\n> \r\n')).toBe('working')
    expect(r.promptVisible()).toBe(false)
    t += 6000
    expect(r.current()).toBe('idle')
    expect(r.promptVisible()).toBe(true)
  })

  it('un indicador que sí se mueve sigue siendo trabajo', async () => {
    let t = 1000
    const r = new ScreenReader(PROVIDERS.kimi.screen, { now: () => t })
    for (let s = 1; s <= 8; s++) {
      t += 1000
      // La CLI redibuja su renglón con el segundo que lleva.
      expect(await r.write(`\x1b[2J\x1b[H· Pensando… (${s}s)\r\n> \r\n`)).toBe('working')
    }
  })
})
