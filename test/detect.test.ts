import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canHire, detectProvider, findBinary } from '../src/core/detect.js'
import { PROVIDERS } from '../src/core/providers.js'

describe('detección de CLIs', () => {
  it('encuentra el binario, su versión y la sesión', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orquest-detect-'))
    const bin = join(dir, 'bin')
    const home = join(dir, 'home')
    await mkdir(bin)
    await mkdir(join(home, '.codex'), { recursive: true })
    await writeFile(join(bin, 'codex'), '#!/bin/sh\necho "codex-cli 9.9.9"\n')
    await chmod(join(bin, 'codex'), 0o755)

    const oldPath = process.env.PATH
    process.env.PATH = bin
    try {
      expect(await findBinary('codex')).toBe(join(bin, 'codex'))
      const s = await detectProvider(PROVIDERS.codex, home)
      expect(s).toMatchObject({ installed: true, version: 'codex-cli 9.9.9', session: false })

      await writeFile(join(home, '.codex', 'auth.json'), '{}')
      expect((await detectProvider(PROVIDERS.codex, home)).session).toBe(true)

      const none = await detectProvider(PROVIDERS.grok, home)
      expect(none.installed).toBe(false)
    } finally {
      process.env.PATH = oldPath
    }
  })

  it('sin una CLI usable no se puede contratar', () => {
    expect(canHire([])).toBe(false)
    expect(canHire([{ id: 'codex', name: 'Codex', installed: true, session: false }])).toBe(false)
    expect(canHire([{ id: 'grok', name: 'Grok', installed: true, session: null }])).toBe(true)
  })
})
