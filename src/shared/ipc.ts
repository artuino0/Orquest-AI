/** Contrato entre el proceso principal y los paneles. La UI solo pide y muestra. */
import type { ProjectSummary, Slot, Task } from '../core/board.js'
import type { CliStatus } from '../core/detect.js'
import type { Check, Dossier, Manual, Role, Stats } from '../core/library.js'
import type { Employee } from '../core/employees.js'
import type { Effort, ProviderId } from '../core/providers.js'
import type { EmployeeState } from '../core/state.js'
import type { StudioSnapshot } from '../core/studio.js'
import type { FileChange } from '../core/worktree.js'

export type { Check, Dossier, Manual, Role, Stats }
export type { CliStatus, Effort, Employee, EmployeeState, FileChange, ProjectSummary, ProviderId, Slot, StudioSnapshot, Task }

export interface BossRequest {
  provider: ProviderId
  model?: string
  effort?: Effort
  goal: string
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
  detectClis(): Promise<CliStatus[]>
  /** Modelos que ofrece cada CLI lista, según ella misma. Tarda más que detectClis: se pide aparte. */
  cliModels(): Promise<Partial<Record<ProviderId, string[]>>>
  pickRepo(): Promise<string | null>
  /** Qué hay guardado de cada repo, para la lista de recientes; null si nunca se abrió aquí. */
  projectSummaries(repos: string[]): Promise<(ProjectSummary | null)[]>
  /** Abre una página en el navegador del sistema (guías de instalación). */
  openExternal(url: string): Promise<void>

  // Proyecto, jefe y tablero.
  openProject(repo: string): Promise<StudioSnapshot>
  hireBoss(req: BossRequest): Promise<void>
  sayToBoss(text: string): Promise<void>
  approveTemplate(slots: SlotEdit[]): Promise<void>
  mergeTask(id: string): Promise<void>
  returnTask(id: string, notes: string): Promise<void>
  taskDiff(id: string): Promise<string>
  // Biblioteca del estudio: expedientes y manuales (compartidos entre proyectos).
  library(): Promise<LibraryView>
  saveDossier(d: Dossier): Promise<void>
  saveManual(m: Manual): Promise<void>
  checkSlots(slots: { provider: ProviderId; model?: string; role: string }[]): Promise<Check[]>

  // Oficina dibujada en el modo creativo: una por estudio. El renderer sabe qué significa.
  loadOffice(): Promise<unknown>
  saveOffice(office: unknown): Promise<void>

  onBoard(cb: (s: StudioSnapshot) => void): () => void
  onNotice(cb: (text: string) => void): () => void

  // Empleados vivos.
  fire(id: string): Promise<void>
  /** Manda a descansar: traspaso, reinicio con contexto limpio y de vuelta. */
  rest(id: string): Promise<void>
  journal(id: string): Promise<string>
  list(): Promise<Employee[]>
  scrollback(id: string): Promise<string>
  changes(id: string): Promise<FileChange[]>
  diff(id: string, path: string): Promise<string>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  onData(cb: (id: string, data: string) => void): () => void
  onState(cb: (id: string, state: EmployeeState) => void): () => void
  onHired(cb: (e: Employee) => void): () => void
}
