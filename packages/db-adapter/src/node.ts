import Database from 'better-sqlite3'
import type { DbAdapter, RunResult, SqlValue } from './types.js'

/**
 * The better-sqlite3 implementation. NODE ONLY.
 *
 * This file is never imported by apps/mobile. It is reachable as
 * `@nutai/db-adapter/node`, which the app does not import and Metro therefore
 * never resolves.
 *
 * Its whole reason to exist is the eval harness: the harness runs the REAL
 * resolver and the REAL gram engine against the golden set under Node, and
 * scoring raw model output instead would measure the wrong thing.
 */

/**
 * better-sqlite3 is synchronous. The shared interface is async because
 * expo-sqlite is. Wrapping sync calls in resolved promises costs a microtask and
 * keeps one honest interface instead of two divergent ones.
 */
class NodeDbAdapter implements DbAdapter {
  constructor(private readonly db: Database.Database) {}

  // Every method is declared `async` rather than returning Promise.resolve(...).
  //
  // That is not a style choice. better-sqlite3 throws SYNCHRONOUSLY on a
  // constraint violation, so `return Promise.resolve(stmt.run(...))` throws before
  // a promise ever exists — and a caller writing `db.run(...).catch(...)` against
  // an async-looking interface would never see it. `async` converts those throws
  // into rejections, so the interface behaves the way its type says it does.
  async all<T = Record<string, SqlValue>>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[]
  }

  async get<T = Record<string, SqlValue>>(
    sql: string,
    params: readonly SqlValue[] = [],
  ): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const info = this.db.prepare(sql).run(...params)
    return { changes: info.changes, lastInsertRowId: info.lastInsertRowid }
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }

  /**
   * better-sqlite3's own `transaction()` helper cannot wrap an async function —
   * it would commit before the promise settled. Drive the statements directly
   * instead, which is correct for an async body.
   */
  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    this.db.exec('BEGIN')
    try {
      const result = await fn(this)
      this.db.exec('COMMIT')
      return result
    } catch (err) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // A rollback failure must not mask the original error, which is the one
        // that explains what actually went wrong.
      }
      throw err
    }
  }

  async close(): Promise<void> {
    this.db.close()
  }
}

export interface OpenOptions {
  readonly?: boolean
  /** Enable WAL. Not meaningful for :memory:. */
  wal?: boolean
}

export function openNodeDb(filename: string, options: OpenOptions = {}): DbAdapter {
  const db = new Database(filename, options.readonly === true ? { readonly: true } : {})
  db.pragma('foreign_keys = ON')
  if (options.wal === true && filename !== ':memory:') {
    db.pragma('journal_mode = WAL')
  }
  return new NodeDbAdapter(db)
}

/** In-memory database, for tests and the harness. */
export function openMemoryDb(): DbAdapter {
  return openNodeDb(':memory:')
}
