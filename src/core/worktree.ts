import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', args, { cwd })
  return stdout.trim()
}

export interface Office {
  /** Carpeta del worktree: la oficina del empleado. */
  path: string
  branch: string
}

/** Raíz del repositorio que contiene `dir`. Falla si no es un repo git. */
export async function repoRoot(dir: string): Promise<string> {
  return git(dir, 'rev-parse', '--show-toplevel')
}

/**
 * Crea la oficina de un empleado: un git worktree propio sobre una rama nueva
 * `orquest/<id>`, para que varios agentes trabajen a la vez sin pisarse.
 * Los worktrees viven junto al repo, en `<repo>.orquest/<id>`, fuera del árbol
 * de trabajo principal.
 */
export async function createOffice(repo: string, employeeId: string, base = 'HEAD'): Promise<Office> {
  const root = await repoRoot(repo)
  const path = join(dirname(root), `${root.split(/[\\/]/).pop()}.orquest`, employeeId)
  const branch = `orquest/${employeeId}`
  await mkdir(dirname(path), { recursive: true })
  await git(root, 'worktree', 'add', '-b', branch, path, base)
  return { path, branch }
}

/** Quita la oficina. La rama se conserva: ahí está la entrega. */
export async function removeOffice(repo: string, office: Office, force = false): Promise<void> {
  const root = await repoRoot(repo)
  await git(root, 'worktree', 'remove', ...(force ? ['--force'] : []), office.path)
}

export interface FileChange {
  status: string
  path: string
}

/** Archivos tocados en la oficina (git status --porcelain), para el drawer. */
export async function officeChanges(office: Office): Promise<FileChange[]> {
  const out = await git(office.path, 'status', '--porcelain', '--untracked-files=all')
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim(), path: line.slice(3) }))
}
