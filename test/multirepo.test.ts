import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CliStatus } from '../src/core/detect.js'
import { listGroupDocuments } from '../src/core/documents.js'
import { EmployeeManager, type Pty, type Spawner } from '../src/core/employees.js'
import { checkGroup, checkRepo } from '../src/core/repo.js'
import { StudioStore } from '../src/core/store.js'
import { BOSS_ID, Studio } from '../src/core/studio.js'

/**
 * Un proyecto que no es un repositorio sino una carpeta que agrupa varios
 * (`back` y `front`, cada uno con su git; la raíz sin git): el jefe trabaja en
 * la raíz, cada tarea es de un repositorio y cada empleado recibe copia solo de
 * los que le tocan.
 */

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

function makeRepo(dir: string, name: string) {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@orquest.dev')
  git(dir, 'config', 'user.name', 'Orquest')
  // Que el resultado no dependa de cómo tenga los saltos de línea quien corre la prueba.
  git(dir, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(dir, 'README.md'), `# ${name}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'inicio')
}

const dirs: string[] = []
/** Carpeta sin git con dos repositorios dentro. */
function makeGroup(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-varios-')))
  dirs.push(root)
  makeRepo(join(root, 'back'), 'back')
  makeRepo(join(root, 'front'), 'front')
  return root
}

/** CLI de mentira: queda lista enseguida y guarda lo que se le escribe, dónde arrancó y con qué argumentos. */
const typed = new Map<string, string>()
const cwds = new Map<string, string>()
const launched = new Map<string, string[]>()
const fakeSpawn: Spawner = (_file, args, o) => {
  const id = o.env.ORQUEST_EMPLOYEE_ID
  typed.set(id, '')
  cwds.set(id, o.cwd)
  launched.set(id, args)
  let onData: (d: string) => void = () => {}
  let onExit: (e: { exitCode: number }) => void = () => {}
  const pty: Pty = {
    pid: 1,
    onData: (cb) => {
      onData = cb
      setTimeout(() => onData('\x1b[2J\x1b[H> \r\n? for shortcuts · ⏎ send'), 5)
    },
    onExit: (cb) => (onExit = cb),
    write: (d) => typed.set(id, typed.get(id) + d),
    resize: () => {},
    kill: () => onExit({ exitCode: 0 }),
  }
  return pty
}

const CLIS: CliStatus[] = [{ id: 'claude', name: 'Claude Code', installed: true, session: true, version: '2' }]

let studio: Studio | undefined
afterEach(async () => {
  studio?.shutdown()
  studio = undefined
  for (const d of dirs.splice(0)) {
    // Las bitácoras se escriben sin esperar: un hecho rezagado vuelve a crear la carpeta recién borrada. Se
    // insiste hasta que ya no aparece (y en Windows git puede tardar en soltarla: por eso los reintentos).
    for (let tries = 0; tries < 6; tries++) {
      rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      await new Promise((r) => setTimeout(r, 150))
      if (!existsSync(d)) break
    }
  }
})

async function open(repo: string, group = true, store?: StudioStore) {
  const manager = new EmployeeManager(fakeSpawn, { quietMs: 20, settleMs: 0 })
  const s = await new Studio({ repo, group, manager, store, detect: async () => CLIS, mcpUrl: (t) => `http://127.0.0.1:1/mcp/${t}`, replyTimeoutMs: 2000, submitDelayMs: 0 }).init()
  studio = s
  const boss = (tool: string, args: Record<string, unknown> = {}) => s.call({ kind: 'boss' }, tool, args)
  const as = (id: string) => (tool: string, args: Record<string, unknown> = {}) => s.call({ kind: 'employee', id }, tool, args)
  /** Contrata al jefe y levanta un empleado por puesto; devuelve el id de cada uno. */
  const hire = async (...roles: string[]) => {
    await s.hireBoss({ provider: 'claude', goal: 'Tienda con API y página' })
    s.board.propose(roles.map((role) => ({ role, provider: 'claude' as const })), () => true)
    s.approveTemplate(s.board.slots.map((x) => ({ id: x.id, role: x.role, provider: x.provider })))
    const ids: string[] = []
    for (const role of roles) {
      await boss('levantar_empleado', { puesto: role })
      ids.push(s.board.staff.find((m) => m.role === role)!.id)
    }
    return ids
  }
  /** Lo que Orquest le ha dicho a alguien. */
  const told = (id: string) => s.board.messages.filter((m) => m.to === id).map((m) => m.text)
  return { s, manager, boss, as, hire, told }
}

/** Espera a que algo pase, sin depender de qué tan ocupada esté la máquina. */
async function until(check: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 40))
  expect(check()).toBe(true)
}

/** Copias (worktrees) que un repositorio tiene apuntadas, con su rama: `ruta → rama`. */
function copies(repo: string): Record<string, string> {
  const out: Record<string, string> = {}
  let path = ''
  for (const line of git(repo, 'worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice(9).replace(/\\/g, '/').toLowerCase()
    else if (line.startsWith('branch ')) out[path] = line.slice(7).replace('refs/heads/', '')
  }
  return out
}
const key = (path: string) => path.replace(/\\/g, '/').toLowerCase()

describe('proyecto con varios repositorios', () => {
  it('la carpeta se abre como un solo proyecto: el jefe trabaja en la raíz y ve los repositorios', async () => {
    const root = makeGroup()
    expect(await checkRepo(root)).toMatchObject({ state: 'no-repo', inside: [join(root, 'back'), join(root, 'front')] })
    expect(await checkGroup(root)).toEqual({ repos: [{ name: 'back', path: join(root, 'back') }, { name: 'front', path: join(root, 'front') }], empty: [] })

    const { s, boss } = await open(root)
    expect(s.root).toBe(root)
    expect(s.snapshot()).toMatchObject({ repo: root, repos: [{ name: 'back' }, { name: 'front' }] })

    await s.hireBoss({ provider: 'claude', goal: 'Tienda con API y página' })
    // Su terminal arranca en la raíz, que sigue sin git: nadie la convirtió en repositorio.
    expect(cwds.get(BOSS_ID)).toBe(root)
    expect(existsSync(join(root, '.git'))).toBe(false)
    // Y se le explica cómo está armado el proyecto.
    const prompt = launched.get(BOSS_ID)!.join(' ')
    expect(prompt).toContain('agrupa varios repositorios')
    expect(prompt).toContain(`back (${join(root, 'back')})`)
    expect(prompt).toContain('en asignar_tarea indica repositorio')

    const view = JSON.parse(await boss('leer_proyecto'))
    expect(view.repo).toBe(root)
    expect(view.repositorios).toEqual([
      { nombre: 'back', ruta: join(root, 'back'), rama: 'main' },
      { nombre: 'front', ruta: join(root, 'front'), rama: 'main' },
    ])
  }, 60_000)

  it('una tarea sin repositorio, o con uno que no existe, se rechaza con su motivo', async () => {
    const root = makeGroup()
    const { s, boss, hire } = await open(root)
    const [ana] = await hire('backend')

    await expect(boss('asignar_tarea', { empleado: ana, titulo: 'API de productos' })).rejects.toThrow(/di a cuál pertenece la tarea con repositorio \(back, front\)/)
    await expect(boss('asignar_tarea', { empleado: ana, titulo: 'API de productos', repositorio: 'movil' })).rejects.toThrow(/No existe el repositorio "movil" en este proyecto\. Los que hay: back, front\./)
    // Nada quedó a medias: ni tarea ni copia.
    expect(s.board.tasks).toEqual([])
    const office = join(root, '.orquest', 'oficinas', ana)
    expect(existsSync(office)).toBe(true)
    expect(existsSync(join(office, 'back'))).toBe(false)
    expect(existsSync(join(office, 'front'))).toBe(false)
  }, 60_000)

  it('cada empleado recibe copia solo de lo suyo; se entrega, se integra y se desocupa por repositorio', async () => {
    const root = makeGroup()
    const back = join(root, 'back')
    const front = join(root, 'front')
    const { s, manager, boss, as, hire, told } = await open(root)
    const notices: string[] = []
    s.on('notice', (n) => notices.push(n))
    const [ana, beto] = await hire('backend', 'frontend')
    const frontStart = git(front, 'rev-parse', 'HEAD')

    // Su oficina es una carpeta dentro de la raíz, no una copia de nada: ahí arranca su terminal.
    const office = join(root, '.orquest', 'oficinas', ana)
    const betoOffice = join(root, '.orquest', 'oficinas', beto)
    expect(manager.get(ana)!.office).toEqual({ path: office, branch: `orquest/${ana}` })
    expect(cwds.get(ana)).toBe(office)
    expect(existsSync(join(office, '.git'))).toBe(false)
    expect(existsSync(join(office, 'back'))).toBe(false)
    await until(() => typed.get(ana)!.includes('tu oficina no es uno de ellos'))
    expect(typed.get(ana)).toContain(`front (${front})`)

    // Con su primera tarea de back le llega su copia de back, en su rama; de front, nada.
    expect(await boss('asignar_tarea', { empleado: ana, titulo: 'API de productos', descripcion: 'GET /productos', repositorio: 'back' })).toBe(`T1 → ${ana}: ready. Repositorio: back.`)
    expect(s.board.task('T1').repo).toBe('back')
    expect(copies(back)[key(join(office, 'back'))]).toBe(`orquest/${ana}`)
    expect(git(join(office, 'back'), 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(`orquest/${ana}`)
    expect(readFileSync(join(office, 'back', 'README.md'), 'utf8')).toBe('# back\n')
    expect(existsSync(join(office, 'front'))).toBe(false)
    expect(Object.values(copies(front))).toEqual(['main'])
    expect(told(ana).at(-1)).toContain(`en el repositorio back: se trabaja en ${join(office, 'back')}`)

    // Una tarea de front que depende de la de back: espera, pero ya tiene dónde trabajarla.
    expect(await boss('asignar_tarea', { empleado: beto, titulo: 'Página de productos', repositorio: 'front', depende_de: ['T1'] })).toContain('esperando a T1')
    expect(existsSync(join(betoOffice, 'front', '.git'))).toBe(true)
    expect(existsSync(join(betoOffice, 'back'))).toBe(false)
    expect(JSON.parse(await boss('leer_proyecto')).tareas).toMatchObject([{ id: 'T1', repositorio: 'back' }, { id: 'T2', repositorio: 'front' }])

    // Ana lee su tarea (le dice en qué carpeta trabaja y dónde leer lo demás), cambia un archivo y entrega.
    const task = JSON.parse(await as(ana)('leer_tarea'))
    expect(task).toMatchObject({ id: 'T1', repositorio: 'back', carpeta: join(office, 'back'), otros_repositorios_solo_lectura: [{ repositorio: 'front', ruta: front }] })
    writeFileSync(join(office, 'back', 'api.js'), 'export const productos = []\n')
    // En su panel, los archivos salen con el repositorio al frente.
    expect(await s.changes(ana)).toEqual([{ status: '??', path: 'back/api.js' }])
    expect(await s.fileDiff(ana, 'back/api.js')).toContain('+export const productos = []')
    await as(ana)('entregar', { reporte: 'GET /productos devuelve []' })

    // El commit quedó en su rama del repositorio back; front ni se enteró.
    expect(git(back, 'log', '-1', '--format=%s', `orquest/${ana}`)).toBe('T1: API de productos')
    expect(git(back, 'show', `orquest/${ana}:api.js`)).toBe('export const productos = []')
    expect(s.board.task('T1').delivery?.diffStat).toContain('api.js')
    expect(await s.diff('T1')).toContain('+export const productos = []')
    expect(existsSync(join(back, 'api.js'))).toBe(false)
    expect(git(front, 'rev-parse', 'HEAD')).toBe(frontStart)
    expect(git(front, 'branch', '--list', `orquest/${ana}`)).toBe('')
    expect(git(front, 'status', '--porcelain')).toBe('')

    // El jefe aprueba y el usuario integra: el cambio llega a la rama principal de back y solo ahí.
    expect(await boss('revisar_entrega', { tarea: 'T1', decision: 'aprobar' })).toContain('bandeja del usuario')
    expect((await s.merge('T1')).map((t) => t.id)).toEqual(['T2'])
    expect(readFileSync(join(back, 'api.js'), 'utf8')).toBe('export const productos = []\n')
    expect(git(back, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
    expect(git(back, 'log', '-1', '--format=%s')).toBe(`T1: API de productos (${ana})`)
    expect(existsSync(join(front, 'api.js'))).toBe(false)
    expect(git(front, 'rev-parse', 'HEAD')).toBe(frontStart)

    // La tarea de front se libera: su dependencia es de otro repositorio, así que no hay merge que hacer, solo dónde leerla.
    const released = told(beto).find((m) => m.includes('Tu dependencia T1'))!
    expect(released).toContain(`ya está integrada en main del repositorio back`)
    expect(released).toContain(`Léela en ${back}`)
    expect(released).toContain('GET /productos devuelve []')
    expect(released).not.toContain('git merge')
    // Y le llega a su terminal tal cual.
    await until(() => typed.get(beto)!.includes(released))
    expect(JSON.parse(await as(beto)('leer_tarea'))).toMatchObject({ id: 'T2', carpeta: join(betoOffice, 'front'), dependencias: [{ id: 'T1', repositorio: 'back', estado: 'merged' }] })

    // Una segunda tarea de Ana, ahora en front, le agrega esa copia sin tocar la de back.
    const backCopy = git(join(office, 'back'), 'rev-parse', 'HEAD')
    expect(await boss('asignar_tarea', { empleado: ana, titulo: 'Botón de compra', repositorio: 'front' })).toContain('Repositorio: front.')
    expect(copies(front)[key(join(office, 'front'))]).toBe(`orquest/${ana}`)
    expect(readFileSync(join(office, 'front', 'README.md'), 'utf8')).toBe('# front\n')
    expect(git(join(office, 'back'), 'rev-parse', 'HEAD')).toBe(backCopy)
    expect(git(join(office, 'back'), 'status', '--porcelain')).toBe('')
    expect(existsSync(join(office, 'back', 'api.js'))).toBe(true)

    // Dependencia dentro del mismo repositorio: esa sí se trae con git merge, en la copia de ese repositorio.
    await boss('asignar_tarea', { empleado: beto, titulo: 'Carrito', repositorio: 'front', depende_de: ['T3'] })
    expect(JSON.parse(await as(ana)('leer_tarea'))).toMatchObject({ id: 'T3', repositorio: 'front', carpeta: join(office, 'front') })
    writeFileSync(join(office, 'front', 'boton.js'), 'export const boton = 1\n')
    await as(ana)('entregar', { reporte: 'botón listo' })
    expect(git(front, 'log', '-1', '--format=%s', `orquest/${ana}`)).toBe('T3: Botón de compra')
    expect(await s.diff('T3')).toContain('+export const boton = 1')
    await boss('revisar_entrega', { tarea: 'T3', decision: 'aprobar' })
    expect((await s.merge('T3')).map((t) => t.id)).toEqual(['T4'])
    expect(existsSync(join(front, 'boton.js'))).toBe(true)
    expect(existsSync(join(back, 'boton.js'))).toBe(false)
    const same = told(beto).find((m) => m.includes('Tu dependencia T3'))!
    expect(same).toContain(`Tráela a tu copia de ese repositorio (${join(betoOffice, 'front')}) con: git merge main`)

    // Los documentos de cada repositorio salen con su carpeta al frente, junto a los planes del jefe (que viven en la raíz).
    await boss('guardar_plan', { titulo: 'Plan de la tienda', contenido: '1. Backend arma la API de productos.\n2. Frontend la consume.' })
    const docs = await listGroupDocuments(root, s.repos)
    expect(docs.map((d) => d.path).sort()).toEqual(['.orquest/planes/plan-de-la-tienda.md', 'back/README.md', 'front/README.md'])
    expect(docs.find((d) => d.plan)?.path).toBe('.orquest/planes/plan-de-la-tienda.md')
    expect(await s.changes(BOSS_ID)).toEqual([])

    // Despedida con todo integrado: sus copias se quitan de los dos repositorios y sus ramas quedan.
    await s.fire(ana)
    expect(existsSync(join(office, 'back'))).toBe(false)
    expect(existsSync(join(office, 'front'))).toBe(false)
    expect(existsSync(office)).toBe(false)
    expect(copies(back)[key(join(office, 'back'))]).toBeUndefined()
    expect(copies(front)[key(join(office, 'front'))]).toBeUndefined()
    expect(git(back, 'branch', '--list', `orquest/${ana}`)).toContain(`orquest/${ana}`)
    expect(git(front, 'branch', '--list', `orquest/${ana}`)).toContain(`orquest/${ana}`)
    // Pedir el diff de quien ya se fue no truena aunque su copia no exista: se lee desde el repositorio (ya integrada, no le añade nada).
    expect(await s.diff('T1')).toBe('')
    expect(s.board.task('T1').status).toBe('merged')

    // A quien se va dejando trabajo sin entregar se le conserva la oficina.
    writeFileSync(join(betoOffice, 'front', 'pagina.js'), 'export const pagina = 1\n')
    await s.fire(beto)
    expect(existsSync(join(betoOffice, 'front', 'pagina.js'))).toBe(true)
    expect(notices.at(-1)).toContain('se conserva: tiene 1 archivo sin entregar')
  }, 120_000)

  it('QA revisa en su copia del repositorio de la tarea; una tarea sin empezar se puede pasar de repositorio', async () => {
    const root = makeGroup()
    const back = join(root, 'back')
    const { s, boss, as, hire } = await open(root)
    const [ana, quique] = await hire('backend', 'qa')
    const office = join(root, '.orquest', 'oficinas', ana)
    const qaOffice = join(root, '.orquest', 'oficinas', quique)

    await boss('asignar_tarea', { empleado: ana, titulo: 'API de productos', repositorio: 'back' })
    await as(ana)('leer_tarea')
    writeFileSync(join(office, 'back', 'api.js'), 'export const productos = []\n')
    await as(ana)('entregar', { reporte: 'lista' })

    // La revisión es del mismo repositorio que la tarea, y a QA le llega su copia de ese y nada más.
    await boss('mandar_a_qa', { tarea: 'T1', empleado_qa: quique, instrucciones: 'prueba que liste' })
    expect(s.board.task('T2')).toMatchObject({ kind: 'qa', repo: 'back' })
    expect(copies(back)[key(join(qaOffice, 'back'))]).toBe(`orquest/${quique}`)
    expect(existsSync(join(qaOffice, 'front'))).toBe(false)
    expect(JSON.parse(await as(quique)('leer_tarea'))).toMatchObject({ id: 'T2', carpeta: join(qaOffice, 'back'), revisa_a: { id: 'T1', repositorio: 'back', rama: `orquest/${ana}` } })
    // En su copia puede traer la rama de quien entregó para probarla.
    git(join(qaOffice, 'back'), '-c', 'user.name=QA', '-c', 'user.email=qa@orquest.dev', 'merge', '-q', `orquest/${ana}`)
    expect(existsSync(join(qaOffice, 'back', 'api.js'))).toBe(true)
    await as(quique)('entregar', { reporte: 'lista productos', veredicto: 'pasa' })
    expect(await boss('revisar_entrega', { tarea: 'T1', decision: 'aprobar' })).toContain('bandeja del usuario')
    await s.merge('T1')
    expect(existsSync(join(back, 'api.js'))).toBe(true)

    // Una entrega sin cambios se cierra sola, mirando el repositorio de la tarea (no la raíz, que no tiene git).
    await boss('asignar_tarea', { empleado: ana, titulo: 'Revisar el README', repositorio: 'back' })
    await as(ana)('leer_tarea')
    await as(ana)('entregar', { reporte: 'está bien' })
    expect(await boss('revisar_entrega', { tarea: 'T3', decision: 'aprobar' })).toContain('no traía cambios que integrar')

    // El jefe se equivocó de repositorio: mientras la tarea no empiece, se corrige y llega la copia que faltaba.
    await boss('asignar_tarea', { empleado: ana, titulo: 'Botón', repositorio: 'back' })
    expect(existsSync(join(office, 'front'))).toBe(false)
    expect(await boss('asignar_tarea', { tarea_id: 'T4', repositorio: 'front' })).toContain('Repositorio: front.')
    expect(s.board.task('T4').repo).toBe('front')
    expect(existsSync(join(office, 'front', '.git'))).toBe(true)
    await as(ana)('leer_tarea')
    await expect(boss('asignar_tarea', { tarea_id: 'T4', repositorio: 'back' })).rejects.toThrow(/T4 ya empezó en front; no se le puede cambiar de repositorio/)
  }, 90_000)

  it('al reabrir, cada quien vuelve a su carpeta con sus copias como las dejó', async () => {
    const root = makeGroup()
    const store = new StudioStore(':memory:')
    const first = await open(root, true, store)
    const [ana] = await first.hire('backend')
    await first.boss('asignar_tarea', { empleado: ana, titulo: 'API de productos', repositorio: 'back' })
    await first.as(ana)('leer_tarea')
    const office = join(root, '.orquest', 'oficinas', ana)
    writeFileSync(join(office, 'back', 'api.js'), 'export const productos = []\n')
    first.s.shutdown()
    cwds.clear()

    const { s, as } = await open(root, true, store)
    expect(s.board.task('T1')).toMatchObject({ repo: 'back', status: 'in_progress' })
    expect(s.resumable).toHaveLength(2)
    await s.resume()
    expect(cwds.get(BOSS_ID)).toBe(root)
    expect(cwds.get(ana)).toBe(office)
    // Su copia sigue ahí con lo que tenía a medias, y lo entrega en back.
    expect(JSON.parse(await as(ana)('leer_tarea'))).toMatchObject({ id: 'T1', carpeta: join(office, 'back') })
    expect(readFileSync(join(office, 'back', 'api.js'), 'utf8')).toBe('export const productos = []\n')
    await as(ana)('entregar', { reporte: 'lista' })
    expect(git(join(root, 'back'), 'show', `orquest/${ana}:api.js`)).toBe('export const productos = []')
    expect(existsSync(join(office, 'front'))).toBe(false)
  }, 60_000)

  it('un repositorio de dentro sin commits no deja abrir el proyecto, y dice cuál', async () => {
    const root = makeGroup()
    mkdirSync(join(root, 'movil'))
    git(join(root, 'movil'), 'init', '-q', '-b', 'main')
    expect(await checkGroup(root)).toMatchObject({ repos: [{ name: 'back' }, { name: 'front' }, { name: 'movil' }], empty: ['movil'] })
    await expect(open(root)).rejects.toThrow(/El repositorio movil todavía no tiene ningún commit/)
    // Una carpeta sin repositorios dentro tampoco es un proyecto de varios.
    const loose = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-suelta-')))
    dirs.push(loose)
    await expect(open(loose)).rejects.toThrow(/no tiene repositorios dentro/)
  }, 60_000)

  it('un `git init` vacío en la carpeta que los agrupa se ignora y no se toca', async () => {
    const root = makeGroup()
    git(root, 'init', '-q', '-b', 'main')
    expect(await checkRepo(root)).toMatchObject({ state: 'no-commits', inside: [join(root, 'back'), join(root, 'front')] })

    const { s, boss, hire } = await open(root)
    const [ana] = await hire('backend')
    await boss('asignar_tarea', { empleado: ana, titulo: 'API', repositorio: 'back' })
    const office = join(root, '.orquest', 'oficinas', ana)
    // Su copia es de back, no de la raíz; y la raíz sigue sin un solo commit.
    expect(copies(join(root, 'back'))[key(join(office, 'back'))]).toBe(`orquest/${ana}`)
    expect(() => git(root, 'rev-parse', '--verify', '--quiet', 'HEAD')).toThrow()
    expect(s.repos.map((r) => r.name)).toEqual(['back', 'front'])
  }, 60_000)

  it('con un solo repositorio todo sigue igual: `repositorio` no cuenta y la oficina es la copia', async () => {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'orquest-uno-')))
    dirs.push(root)
    makeRepo(root, 'tienda')
    const { s, manager, boss, as, hire, told } = await open(root, false)
    const [ana] = await hire('backend')
    expect(s.snapshot().repos).toBeUndefined()
    expect(launched.get(BOSS_ID)!.join(' ')).not.toContain('agrupa varios repositorios')
    expect(manager.get(BOSS_ID)!.office.branch).toBe('main')

    expect(await boss('asignar_tarea', { empleado: ana, titulo: 'API', repositorio: 'loquesea' })).toBe(`T1 → ${ana}: ready.`)
    expect(s.board.task('T1').repo).toBeUndefined()
    expect(told(ana).at(-1)).toBe('[Orquest] Tienes una tarea nueva (T1: API). Usa leer_tarea.')
    const view = JSON.parse(await boss('leer_proyecto'))
    expect(view.repositorios).toBeUndefined()
    expect('repositorio' in view.tareas[0]).toBe(false)

    // La oficina es el worktree, como siempre.
    const office = manager.get(ana)!.office
    expect(existsSync(join(office.path, '.git'))).toBe(true)
    const task = JSON.parse(await as(ana)('leer_tarea'))
    expect('carpeta' in task || 'repositorio' in task).toBe(false)
    writeFileSync(join(office.path, 'api.js'), 'export const productos = []\n')
    await as(ana)('entregar', { reporte: 'lista' })
    await boss('revisar_entrega', { tarea: 'T1', decision: 'aprobar' })
    await s.merge('T1')
    expect(readFileSync(join(root, 'api.js'), 'utf8')).toBe('export const productos = []\n')
  }, 60_000)
})
