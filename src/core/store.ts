/**
 * Estado del estudio en SQLite local (node:sqlite, sin módulos nativos).
 * Por ahora guarda una foto del tablero por proyecto; las tablas por entidad
 * llegan cuando haya consultas que las pidan (historial de expedientes, fase 3).
 */
import { DatabaseSync } from 'node:sqlite'
import type { BoardSnapshot } from './board.js'
import type { Dossier, HistoryEvent, LibraryStore, Manual } from './library.js'

export class StudioStore implements LibraryStore {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        repo TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dossiers (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (provider, model)
      );
      CREATE TABLE IF NOT EXISTS manuals (
        role TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        role TEXT NOT NULL,
        project TEXT NOT NULL,
        task_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        first_try INTEGER
      );
      CREATE INDEX IF NOT EXISTS history_provider ON history (provider, model);
    `)
  }

  load(repo: string): BoardSnapshot | undefined {
    const row = this.db.prepare('SELECT board FROM projects WHERE repo = ?').get(repo) as { board: string } | undefined
    return row ? (JSON.parse(row.board) as BoardSnapshot) : undefined
  }

  save(repo: string, board: BoardSnapshot) {
    this.db
      .prepare(
        `INSERT INTO projects (repo, board, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(repo) DO UPDATE SET board = excluded.board, updated_at = excluded.updated_at`,
      )
      .run(repo, JSON.stringify(board), Date.now())
  }

  // ── Biblioteca: expedientes, manuales e historial (compartidos entre proyectos) ──

  loadDossiers(): Dossier[] {
    return (this.db.prepare('SELECT data FROM dossiers').all() as { data: string }[]).map((r) => JSON.parse(r.data))
  }

  saveDossier(d: Dossier) {
    this.db
      .prepare('INSERT INTO dossiers (provider, model, data) VALUES (?, ?, ?) ON CONFLICT(provider, model) DO UPDATE SET data = excluded.data')
      .run(d.provider, d.model, JSON.stringify(d))
  }

  loadManuals(): Manual[] {
    return (this.db.prepare('SELECT data FROM manuals').all() as { data: string }[]).map((r) => JSON.parse(r.data))
  }

  saveManual(m: Manual) {
    this.db.prepare('INSERT INTO manuals (role, data) VALUES (?, ?) ON CONFLICT(role) DO UPDATE SET data = excluded.data').run(m.role, JSON.stringify(m))
  }

  loadHistory(): HistoryEvent[] {
    const rows = this.db.prepare('SELECT * FROM history ORDER BY id').all() as Record<string, unknown>[]
    return rows.map((r) => ({
      at: r.at as number,
      provider: r.provider as HistoryEvent['provider'],
      model: r.model as string,
      role: r.role as string,
      project: r.project as string,
      taskId: r.task_id as string,
      outcome: r.outcome as HistoryEvent['outcome'],
      firstTry: r.first_try === null ? undefined : r.first_try === 1,
    }))
  }

  addHistory(e: HistoryEvent) {
    this.db
      .prepare('INSERT INTO history (at, provider, model, role, project, task_id, outcome, first_try) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.at, e.provider, e.model, e.role, e.project, e.taskId, e.outcome, e.firstTry === undefined ? null : e.firstTry ? 1 : 0)
  }

  close() {
    this.db.close()
  }
}
