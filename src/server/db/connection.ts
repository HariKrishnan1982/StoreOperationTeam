import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const { DatabaseSync: SqliteDatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

dotenv.config();

export function createDatabase(dbPath?: string): DatabaseSync {
  const resolvedPath =
    dbPath || process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'store_ops.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new SqliteDatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return db;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback error if transaction was not active
    }
    throw err;
  }
}
