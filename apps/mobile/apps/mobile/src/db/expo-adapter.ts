import type { DbAdapter, RunResult, SqlValue } from '@nutai/db-adapter'
import * as SQLite from 'expo-sqlite'

/**
 * The expo-sqlite implementation of the shared DbAdapter interface.
 *
 * This file lives in apps/mobile and NOT in @nutai/db-adapter, deliberately.
 * `packages/*` must stay importable under bare Node with zero React Native
 * surface (PLAN.md §4.1) so the eval harness can run the real pipeline; an
 * `import 'expo-sqlite'` in that package would fail the node-purity gate. This
 * app is the only place allowed to hold React Native imports.
 *
 * The Node implementation lives at @nutai/db-adapter/node. Both satisfy the same
 * interface, which is what makes "it worked in the harness" mean something on
 * device.
 */
class ExpoDbAdapter implements DbAdapter {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async all<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return (await this.db.getAllAsync(sql, params as SQLite.SQLiteBindValue[])) as T[]
  }

  async get<T = Record<string, SqlValue>>(sql: string, params: readonly SqlValue[] = []): Promise<T | null> {
    return ((await this.db.getFirstAsync(sql, params as SQLite.SQLiteBindValue[])) as T | null) ?? null
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<RunResult> {
    const r = await this.db.runAsync(sql, params as SQLite.SQLiteBindValue[])
    return { changes: r.changes, lastInsertRowId: r.lastInsertRowId }
  }

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql)
  }

  async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
    let result!: T
    await this.db.withTransactionAsync(async () => {
      result = await fn(this)
    })
    return result
  }

  async close(): Promise<void> {
    await this.db.closeAsync()
  }
}

/** The writable user database. */
export async function openUserDb(): Promise<DbAdapter> {
  const db = await SQLite.openDatabaseAsync('user.db')
  await db.execAsync('PRAGMA foreign_keys = ON;')
  return new ExpoDbAdapter(db)
}

/**
 * The read-only bundled nutrition corpus.
 *
 * Copied out of the asset bundle to writable storage on first run, because FTS5
 * needs somewhere to put its temporary files. It is still never written by the
 * app — the copy exists for SQLite's benefit, not ours, and a corpus update
 * replaces the file wholesale rather than mutating it.
 */
export async function openNutritionDb(): Promise<DbAdapter> {
  const db = await SQLite.openDatabaseAsync('nutrition.db')
  return new ExpoDbAdapter(db)
}
