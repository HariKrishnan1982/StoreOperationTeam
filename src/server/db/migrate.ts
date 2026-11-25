import type { DatabaseSync } from 'node:sqlite';
import { createDatabase, withTransaction } from './connection.js';

interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_core_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_seq (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          next_val INTEGER NOT NULL DEFAULT 1001
        );

        INSERT OR IGNORE INTO order_seq (id, next_val) VALUES (1, 1001);

        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'General',
          price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
          stock INTEGER NOT NULL CHECK (stock >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reference TEXT NOT NULL UNIQUE,
          customer_name TEXT,
          customer_phone TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'Placed' CHECK (status IN ('Placed', 'Packed', 'Shipped', 'Cancelled')),
          total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          sku TEXT NOT NULL,
          product_name TEXT NOT NULL,
          unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          UNIQUE (order_id, product_id)
        );

        CREATE TABLE IF NOT EXISTS idempotency_keys (
          key TEXT PRIMARY KEY,
          request_hash TEXT NOT NULL,
          response_status INTEGER NOT NULL,
          response_body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('Admin', 'Operator', 'Warehouse')),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf_token TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      `);
    },
  },
  {
    version: 2,
    name: 'audit_trail_and_optimistic_locking',
    up: (db) => {
      const cols = db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === 'version')) {
        db.exec('ALTER TABLE orders ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS order_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          from_status TEXT,
          to_status TEXT NOT NULL CHECK (to_status IN ('Placed', 'Packed', 'Shipped', 'Cancelled')),
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_username TEXT,
          reason TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id),
          delta INTEGER NOT NULL,
          reason TEXT NOT NULL,
          order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON stock_movements(order_id);
      `);
    },
  },
  {
    version: 3,
    name: 'security_hardening_sessions_idempotency',
    up: (db) => {
      const sessionCols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{
        name: string;
      }>;
      if (!sessionCols.some((c) => c.name === 'last_active_at')) {
        db.exec('ALTER TABLE sessions ADD COLUMN last_active_at TEXT;');
        db.exec('UPDATE sessions SET last_active_at = created_at WHERE last_active_at IS NULL;');
      }

      const idemCols = db.prepare('PRAGMA table_info(idempotency_keys)').all() as Array<{
        name: string;
      }>;
      if (!idemCols.some((c) => c.name === 'user_id')) {
        db.exec(`
          DROP TABLE IF EXISTS idempotency_keys;
          CREATE TABLE idempotency_keys (
            user_id INTEGER NOT NULL DEFAULT 0,
            key TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            response_status INTEGER NOT NULL,
            response_body TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            expires_at TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
          );
          CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys(expires_at);
        `);
      }
    },
  },
];

export function runMigrations(db: DatabaseSync): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const appliedRows = db
    .prepare('SELECT version FROM schema_version ORDER BY version ASC')
    .all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  let newlyApplied = 0;
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    withTransaction(db, () => {
      migration.up(db);
      db.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name
      );
    });
    newlyApplied++;
  }

  return newlyApplied;
}

export function ensureSchema(db: DatabaseSync): void {
  runMigrations(db);
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '');

if (isMain) {
  const db = createDatabase();
  try {
    const count = runMigrations(db);
    console.log(`SQLite migrations complete (${count} new migration(s) applied).`);
  } finally {
    db.close();
  }
}
