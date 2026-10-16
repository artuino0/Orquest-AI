/** Contrato entre el proceso principal y los paneles. La UI solo pide y muestra. */
import type { UpdateInfo } from '../core/update.js'
import type { GroupCheck, ProjectRepo, RepoCheck } from '../core/repo.js'
import type { Lang } from '../core/i18n.js'
import type { ProjectSummary, Slot, Task } from '../core/board.js'
import type { CliStatus, Requirement } from '../core/detect.js'
import type { Check, Dossier, Manual, Role, Stats } from '../core/library.js'
import type { Employee, BlockKind } from '../core/employees.js'
import type { Effort, ProviderId } from '../core/providers.js'
import type { Account } from '../core/accounts.js'
import type { Activity } from '../core/activity.js'
import type { Capture } from '../core/captures.js'
import type { ProjectDocument } from '../core/documents.js'
import type { InstalledTool } from '../core/skills.js'
import type { EmployeeState } from '../core/state.js'
import type { StudioSnapshot } from '../core/studio.js'
import type { FileChange } from '../core/worktree.js'
import type { FileEntry, FileSides, FileText } from '../core/files.js'
import type { RecentProject } from '../core/recents.js'
import type { MobileStatus } from '../core/mobile.js'

export type { Check, Dossier, Manual, Role, Stats }
export type { Activity, Capture, InstalledTool, ProjectDocument }
export type { FileEntry, FileSides, FileText, RecentProject }
export type { Requirement, CliStatus, Effort, Employee, EmployeeState, FileChange, ProjectSummary, ProviderId, Slot, StudioSnapshot, Task }

export interface BossRequest {
  /** Cómo se llama; sin nombre es "Jefe". */
  name?: string
  provider: ProviderId
  model?: string
  effort?: Effort
  /** Cuenta del proveedor (carpeta de su sesión); sin ella, la principal. */
  account?: string
  goal: string
  /** El jefe autoriza las preguntas de permiso de su equipo (no las suyas ni los merges). */
  approveForTeam?: boolean
}

/** Expediente con su historial contigo, para la UI. */
export interface DossierView extends Dossier {
  stats: Stats
}

export interface LibraryView {
  dossiers: DossierView[]
  manuals: Manual[]
}

export type SlotEdit = Partial<Slot> & Pick<Slot, 'role' | 'provider'>

export interface OrquestApi {
  /** El idioma de la app y si lo eligió el usuario (si no, es el de su sistema). */
  language(): Promise<{ lang: Lang; chosen: boolean }>
  /** Fija el idioma elegido por el usuario. Lo que Orquest les diga a los agentes desde ahora va en ese idioma. */
  setLanguage(lang: Lang): Promise<void>
  /** La versión instalada de la app (0.3.1). */
  version(): Promise<string>
  /** Si hay una versión más nueva publicada: cuál y de dónde bajar su instalador. */
  checkUpdate(): Promise<UpdateInfo | null>
  detectClis(): Promise<CliStatus[]>
  /** Lo que hace falta instalado además de las CLIs (git). */
  requirements(): Promise<Requirement[]>
  /** Modelos que ofrece cada CLI lista, según ella misma. Tarda más que detectClis: se pide aparte. */
  cliModels(): Promise<Partial<Record<ProviderId, string[]>>>
  /** Cuentas de cada CLI en esta máquina, con lo que llevan usado de su límite. */
  accounts(): Promise<Account[]>
  /** Acceso desde el celular: estado, prenderlo o apagarlo, código para emparejar, quitar un dispositivo, detalle en los avisos. */
  mobileStatus(): Promise<MobileStatus>
  /** Lo que la oficina de píxel acaba de recibir (estado o evento), para que el celular vea la misma. */
  officeFeed(root: string, msg: Record<string, unknown>): Promise<void>
  mobileEnable(on: boolean): Promise<MobileStatus>
  mobileCode(): Promise<MobileStatus>
  mobileRevoke(id: string): Promise<MobileStatus>
  mobileDetail(on: boolean): Promise<MobileStatus>
  pickRepo(): Promise<string | null>
  /** Si la carpeta se puede abrir tal cual o le falta ser repositorio o tener un commit. */
  checkRepo(path: string): Promise<RepoCheck>
  /** La deja lista: la inicia como repositorio si hace falta y guarda el primer commit. */
  prepareRepo(path: string): Promise<void>
  /** Crea dentro de una carpeta sin git los repositorios que va a agrupar (uno por nombre), listos para usarse. */
  createGroup(path: string, names: string[]): Promise<string[]>
  /** Los repositorios que agrupa una carpeta y cuáles aún no tienen commits: con eso se sabe si se abre como un solo proyecto. */
  checkGroup(path: string): Promise<GroupCheck>
  /** Qué hay guardado de cada repo, para la lista de recientes; null si nunca se abrió aquí. */
  projectSummaries(repos: string[]): Promise<(ProjectSummary | null)[]>
  /** Proyectos abiertos en esta máquina, lo más reciente primero (en la carpeta de la app). */
  recents(): Promise<RecentProject[]>
  touchRecent(entry: RecentProject): Promise<RecentProject[]>
  /** Lo quita de la lista; su carpeta no se toca. */
  removeRecent(path: string): Promise<RecentProject[]>
  /** Trae lo que una versión anterior guardaba en el navegador. */
  importRecents(entries: RecentProject[]): Promise<RecentProject[]>
  /** Abre una página en el navegador del sistema (guías de instalación). */
  openExternal(url: string): Promise<void>
  /** Algo espera al usuario: si la ventana no está al frente, parpadea en la barra de tareas. */
  attention(): Promise<void>

  // Proyecto, jefe y tablero.
  /** `group`: la carpeta no es un repositorio sino que agrupa varios, y se abre como un solo proyecto. */
  openProject(repo: string, group?: boolean): Promise<StudioSnapshot>
  /** Retoma a quienes estaban al cerrar (StudioSnapshot.resumable) o decide no hacerlo. */
  resumeProject(): Promise<void>
  skipResume(): Promise<void>
  hireBoss(req: BossRequest): Promise<void>
  /** Enciende o apaga que el jefe autorice los permisos de su equipo. */
  setTeamApproval(on: boolean): Promise<void>
  /** Que un empleado levante su versión para verla funcionando; avisa con sus direcciones. */
  requestReview(id: string): Promise<void>
  /** Ya se vio: que la apague. */
  stopReview(id: string): Promise<void>
  sayToBoss(text: string): Promise<void>
  /** Detiene al jefe (Esc). Si lo detuviste recién enviado, devuelve tu mensaje para corregirlo. */
  stopBoss(): Promise<{ restored?: string }>
  /** Contesta una pregunta pendiente del jefe (P1, P2…). */
  answerQuestion(id: string, text: string): Promise<void>
  approveTemplate(slots: SlotEdit[]): Promise<void>
  /** Cambia modelo y esfuerzo de alguien (al jefe, también el proveedor): deja su traspaso y vuelve a entrar con lo nuevo. */
  retune(id: string, change: { provider?: ProviderId; model?: string; effort?: Effort; account?: string }): Promise<void>
  mergeTask(id: string): Promise<void>
  returnTask(id: string, notes: string): Promise<void>
  /** Descarta una entrega: no se integra y sale de la rama de quien la hizo. */
  discardTask(id: string, reason?: string): Promise<'reset' | 'reverted' | 'failed' | 'none'>
  taskDiff(id: string): Promise<string>
  // Biblioteca del estudio: expedientes y manuales (compartidos entre proyectos).
  library(): Promise<LibraryView>
  saveDossier(d: Dossier): Promise<void>
  saveManual(m: Manual): Promise<void>
  /** Skills y servidores MCP instalados en esta máquina (y en el proyecto abierto), para elegir en cada manual. */
  installedTools(): Promise<InstalledTool[]>
  checkSlots(slots: { provider: ProviderId; model?: string; role: string }[]): Promise<Check[]>

  // Oficina dibujada en el modo creativo: una por estudio. El renderer sabe qué significa.
  loadOffice(): Promise<unknown>
  saveOffice(office: unknown): Promise<void>

  onBoard(cb: (s: StudioSnapshot) => void): () => void
  onNotice(cb: (text: string) => void): () => void
  /** Botones del encabezado propio: la ventana no tiene marco del sistema. */
  windowControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>
  onWindowState(cb: (s: { maximized: boolean }) => void): () => void
  /** La app se está cerrando y espera el corte de cada agente. */
  onClosing(cb: (p: { asked: string[]; done: string[] }) => void): () => void
  /** Cierra ya, sin esperar los cortes que falten. */
  closeNow(): Promise<void>

  // Empleados vivos.
  fire(id: string): Promise<void>
  /** Manda a descansar: traspaso, reinicio con contexto limpio y de vuelta. */
  rest(id: string): Promise<void>
  /** Vuelve a sentar a alguien cuya CLI se cerró. */
  bringBack(id: string): Promise<void>
  /** Por qué está detenida una terminal, si es una pantalla conocida (confiar en la carpeta, actualizar, iniciar sesión). */
  blockedBy(id: string): Promise<BlockKind | null>
  /** Contesta desde la app la pantalla que lo detiene: confiar en la carpeta, o «ahora no» a la oferta de otro modelo. */
  answerBlock(id: string): Promise<void>
  /** Reinicia su terminal: conversación nueva, con sus instrucciones y su bitácora. */
  restart(id: string): Promise<void>
  journal(id: string): Promise<string>
  list(): Promise<Employee[]>
  scrollback(id: string): Promise<string>
  changes(id: string): Promise<FileChange[]>
  /** Imágenes que dejó en su oficina al probar, lo más reciente primero. */
  captures(id: string): Promise<Capture[]>
  capture(id: string, path: string): Promise<{ bytes: Uint8Array; type: string }>
  diff(id: string, path: string): Promise<string>
  /** Explorador: lo que hay en una carpeta de su oficina (`''` es la raíz). */
  tree(id: string, dir: string): Promise<FileEntry[]>
  /** Explorador: el texto de un archivo de su oficina. */
  fileText(id: string, path: string): Promise<FileText>
  /** Un archivo cambiado, antes y ahora, para verlos uno junto al otro. */
  fileSides(id: string, path: string): Promise<FileSides>
  /** Guarda lo editado en un archivo de su oficina; solo si su agente no trabaja y el archivo sigue como se abrió (`stamp`). */
  saveFile(id: string, path: string, text: string, stamp: string): Promise<{ stamp: string }>
  /** El texto del editor formateado con Prettier, con las opciones del proyecto. No toca el disco. */
  formatFile(id: string, path: string, text: string): Promise<string>
  // El explorador de la barra: la carpeta del proyecto abierto (no la oficina de alguien).
  projectTree(dir: string): Promise<FileEntry[]>
  projectFile(path: string): Promise<FileText>
  /** Lo cambiado o nuevo en el proyecto según git. */
  projectChanges(): Promise<FileChange[]>
  /** Guarda en la carpeta del proyecto; no mientras el jefe trabaja ni si el archivo cambió en disco. */
  saveProjectFile(path: string, text: string, stamp: string): Promise<{ stamp: string }>
  formatProjectFile(path: string, text: string): Promise<string>
  /** Le escribe un mensaje a alguien y se lo envía (texto, pausa y Enter, con reintento). */
  say(id: string, text: string): Promise<void>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  onData(cb: (id: string, data: string) => void): () => void
  onState(cb: (id: string, state: EmployeeState) => void): () => void
  /** Qué está haciendo quien trabaja (leído de su pantalla); null cuando para. */
  onActivity(cb: (id: string, activity: Activity | null) => void): () => void
  /** Su CLI avisa que no puede trabajar (modelo, saldo, límite); null cuando ya pudo. */
  onProblem(cb: (id: string, problem: string | null) => void): () => void
  /** Planes, notas y demás documentos de texto del proyecto abierto, lo más reciente primero. */
  documents(): Promise<ProjectDocument[]>
  documentText(path: string): Promise<string>
  onHired(cb: (e: Employee) => void): () => void
}

export type { GroupCheck, ProjectRepo, RepoCheck }
export type { BlockKind }
export type { UpdateInfo }
