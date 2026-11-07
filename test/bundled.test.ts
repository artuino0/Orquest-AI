import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundledWorkspaceFiles } from '../src/core/bundled.js'
import { Board } from '../src/core/board.js'
import { EmployeeManager, type Spawner } from '../src/core/employees.js'
import { Studio } from '../src/core/studio.js'
import { setLang } from '../src/core/i18n.js'
import { defaultManual, Library, ROLES, type LibraryStore, type Manual } from '../src/core/library.js'
import { employeePrompt } from '../src/core/prompts.js'
import { listTools } from '../src/core/skills.js'
import { createOffice, placeWorkspaceFiles } from '../src/core/worktree.js'
import { DEPARTMENTS, departmentFor } from '../src/renderer/src/world/layout.js'

const dirs: string[] = []
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'orquest-bundled-')); dirs.push(d); return d }
const git = (dir: string, ...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
const put = (dir: string, rel: string, text: string | Uint8Array) => {
  const path = join(dir, rel)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}
function skill(root: string, lang = 'es', id = 'orquest-seguridad') {
  put(root, `${lang}/${id}/SKILL.md`, `---\nname: ${id}\ndescription: ${lang} descripción\n---\n# ${lang}`)
  put(root, `${lang}/${id}/references/stack.md`, lang)
  put(root, `${lang}/${id}/references/recurso.bin`, new Uint8Array([0, 255, 128]))
}
afterEach(() => {
  setLang('es')
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

describe('skills incluidas por puesto', () => {
  it.each(['desarrollo', 'backend', 'frontend', 'dba', 'infra'] as const)('%s recibe calidad y seguridad', (role) => {
    expect(defaultManual(role)).toMatchObject({ skills: ['orquest-clean-code', 'orquest-seguridad'], bundledSkills: true })
  })
  it('asigna las especialidades y enumera los puestos en la oficina', () => {
    expect(defaultManual('arquitecto').skills).toEqual(['orquest-arquitectura', 'orquest-seguridad'])
    expect(defaultManual('seguridad').skills).toEqual(['orquest-seguridad'])
    expect(defaultManual('qa').skills).toEqual(['orquest-qa'])
    expect(defaultManual('diseno').skills).toEqual([])
    expect(DEPARTMENTS).toEqual([...ROLES])
    expect(departmentFor('arquitecto')).toBe('arquitecto')
    expect(departmentFor('seguridad')).toBe('seguridad')
  })
  it('migra y guarda la marca, respetando una eliminación posterior', () => {
    let saved: Manual = { ...defaultManual('backend'), bundledSkills: undefined, skills: ['personal'] }
    const store: LibraryStore = {
      loadDossiers: () => [], saveDossier: () => {}, loadHistory: () => [], addHistory: () => {},
      loadManuals: () => [saved], saveManual: (m) => { saved = structuredClone(m) },
    }
    const library = new Library(store)
    expect(saved.skills).toEqual(['personal', 'orquest-clean-code', 'orquest-seguridad'])
    expect(saved.bundledSkills).toBe(true)
    library.saveManual({ ...library.manual('backend'), skills: [] })
    expect(new Library(store).manual('backend').skills).toEqual([])
    saved = { ...saved, bundledSkills: undefined, skills: ['orquest-qa'] }
    expect(new Library(store).manual('backend').skills).toEqual(['orquest-qa'])
  })
})

describe('skills en la oficina', () => {
  it('copia recursos completos en inglés, fuera de git, y usa español como respaldo', async () => {
    const root = temp(), repo = temp()
    skill(root); skill(root, 'en'); skill(root, 'es', 'orquest-qa')
    git(repo, 'init', '-q')
    git(repo, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.test', 'commit', '--allow-empty', '-qm', 'Inicio')
    const office = await createOffice(repo, 'seguridad')
    setLang('en')
    const files = await bundledWorkspaceFiles(root, ['orquest-seguridad', 'orquest-qa', 'personal', '../fuera'])
    expect(await placeWorkspaceFiles(office.path, files)).toEqual([])
    expect(readFileSync(join(office.path, '.claude/skills/orquest-seguridad/references/stack.md'), 'utf8')).toBe('en')
    expect(readFileSync(join(office.path, '.claude/skills/orquest-qa/references/stack.md'), 'utf8')).toBe('es')
    expect([...readFileSync(join(office.path, '.claude/skills/orquest-seguridad/references/recurso.bin'))]).toEqual([0, 255, 128])
    expect(git(office.path, 'status', '--porcelain')).toBe('')
    expect(git(office.path, 'check-ignore', '.claude/skills/orquest-seguridad/SKILL.md')).toContain('SKILL.md')
    setLang('es')
    expect(await placeWorkspaceFiles(office.path, await bundledWorkspaceFiles(root, ['orquest-seguridad']))).toEqual([])
    expect(readFileSync(join(office.path, '.claude/skills/orquest-seguridad/references/stack.md'), 'utf8')).toBe('es')
  })
  it('conserva una carpeta del proyecto completa, incluso si su SKILL.md coincide', async () => {
    const root = temp(), office = temp()
    skill(root)
    const files = await bundledWorkspaceFiles(root, ['orquest-seguridad'])
    put(office, '.claude/skills/orquest-seguridad/SKILL.md', files['.claude/skills/orquest-seguridad/SKILL.md'])
    expect(await placeWorkspaceFiles(office, files)).toEqual(['.claude/skills/orquest-seguridad'])
    expect(() => readFileSync(join(office, '.claude/skills/orquest-seguridad/references/stack.md'))).toThrow()
  })
  it('funciona en una oficina multi-repo que no es repositorio', async () => {
    const root = temp(), office = temp()
    skill(root)
    expect(await placeWorkspaceFiles(office, await bundledWorkspaceFiles(root, ['orquest-seguridad']))).toEqual([])
    expect(readFileSync(join(office, '.claude/skills/orquest-seguridad/references/stack.md'), 'utf8')).toBe('es')
  })
  it('lista las de Orquest con descripción e idioma sin requerir ~/.claude', async () => {
    const root = temp(), home = temp()
    expect(await listTools(undefined, home, root)).toEqual([])
    skill(root); skill(root, 'en')
    setLang('en')
    const tools = await listTools(undefined, home, root)
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ name: 'orquest-seguridad', kind: 'skill', description: 'en descripción' })
  })
  it('da rutas a Codex y conserva los nombres de las skills del usuario', () => {
    const m = { ...defaultManual('seguridad'), skills: ['orquest-seguridad', 'personal'] }
    const office = { path: '/oficina', branch: 'rama' }, me = { name: 'Ana', journal: '/bitacora' }
    const prompt = employeePrompt(m, office, me, 'mcp', undefined, 'codex')
    expect(prompt).toContain('.claude/skills/orquest-seguridad/SKILL.md, personal')
    expect(prompt).toContain('references/')
    expect(employeePrompt(m, office, me, 'mcp', undefined, 'claude')).toContain('skills de proyecto')
  })
})

describe('seguridad revisa mediante el flujo de QA', () => {
  it.each(['pass', 'fail'] as const)('aplica el veredicto %s y no requiere integrar la revisión', (verdict) => {
    const b = new Board()
    b.propose([{ role: 'backend', provider: 'claude' }, { role: 'seguridad', provider: 'codex' }], () => true)
    const slots = b.approve(b.slots.map((s) => ({ id: s.id, role: s.role, provider: s.provider })))
    for (const s of slots) b.hired(b.takeSlot(s.id), { id: s.role, role: s.role, provider: s.provider })
    const task = b.assign({ assignee: 'backend', title: 'Acceso', description: '' })
    b.start('backend'); b.deliver('backend', { report: 'Implementado', screenshots: [] })
    const review = b.toQa(task.id, 'seguridad', 'Revisar permisos')
    expect(() => b.deliver('seguridad', { report: 'Hallazgos', screenshots: [] })).toThrow(/veredicto/)
    b.deliver('seguridad', { report: 'Hallazgos', screenshots: [], verdict })
    expect(review.status).toBe('done')
    expect(task.status).toBe(verdict === 'pass' ? 'delivered' : 'in_progress')
    expect(task.qa?.verdict).toBe(verdict)
  })
})


describe('Studio instala las skills al contratar', () => {
  it.each([false, true])('prepara la oficina con group=%s para cualquier CLI', async (group) => {
    const root = temp(), repo = temp()
    skill(root)
    const repository = group ? join(repo, 'api') : repo
    mkdirSync(repository, { recursive: true })
    git(repository, 'init', '-q')
    git(repository, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@example.test', 'commit', '--allow-empty', '-qm', 'Inicio')
    const spawn: Spawner = () => ({ pid: 1, onData: () => {}, onExit: () => {}, write: () => {}, resize: () => {}, kill: () => {} })
    const manager = new EmployeeManager(spawn)
    const studio = await new Studio({ repo, group, manager, skillsDir: root, detect: async () => [{ id: 'codex', name: 'Codex', installed: true, session: true }], mcpUrl: () => 'http://localhost/mcp/prueba', submitDelayMs: 0 }).init()
    try {
      await studio.call({ kind: 'boss' }, 'proponer_plantilla', { puestos: [{ puesto: 'seguridad', proveedor: 'codex', nombre: 'Ana', motivo: 'Permisos' }] })
      const slot = studio.snapshot().slots[0]
      studio.approveTemplate([{ id: slot.id, role: slot.role, provider: slot.provider }])
      await studio.call({ kind: 'boss' }, 'levantar_empleado', { puesto: slot.id })
      const employee = manager.list()[0]
      expect(readFileSync(join(employee.office.path, '.claude/skills/orquest-seguridad/SKILL.md'), 'utf8')).toContain('orquest-seguridad')
      if (!group) expect(git(employee.office.path, 'status', '--porcelain')).toBe('')
    } finally { studio.shutdown() }
  })
})
