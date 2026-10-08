import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuleError } from '../src/core/board.js'
import { currentBranch } from '../src/core/worktree.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('repositorio sin commits', () => {
  it('se dice con un motivo legible en vez del error de git', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'orquest-vacio-'))
    dirs.push(repo)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
    await expect(currentBranch(repo)).rejects.toThrow(RuleError)
    await expect(currentBranch(repo)).rejects.toThrow(/ningún commit/)

    writeFileSync(join(repo, 'a.txt'), 'hola')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'Inicio'], { cwd: repo })
    expect(await currentBranch(repo)).toBe('main')
  })
})
