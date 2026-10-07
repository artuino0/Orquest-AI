/**
 * Estado del estudio en SQLite local (node:sqlite, sin módulos nativos).
 * Por ahora guarda una foto del tablero por proyecto; las tablas por entidad
 * llegan cuando haya consultas que las pidan (historial de expedientes, fase 3).
 */
import { DatabaseSync } from 'node:sqlite'
import type { BoardSnapshot } from './board.js'

export class StudioStore {
  private db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        repo TEXT PRIMARY KEY,
        board TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
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

  close() {
    this.db.close()
  }
}
