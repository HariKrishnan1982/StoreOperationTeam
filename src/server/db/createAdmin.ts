import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { createDatabase, withTransaction } from './connection.js';
import { ensureSchema } from './migrate.js';

export function createOrResetAdmin(
  db: DatabaseSync,
  username: string,
  password: string,
  displayName = 'Store Admin'
): void {
  if (!username.trim() || password.length < 12) {
    throw new Error('Username must be non-empty and password must be at least 12 characters.');
  }

  ensureSchema(db);
  const rounds = process.env.NODE_ENV === 'test' || process.env.VITEST ? 4 : 10;
  const hash = bcrypt.hashSync(password, rounds);

  withTransaction(db, () => {
    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')
      .get(username.trim()) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        "UPDATE users SET password_hash = ?, display_name = ?, role = 'Admin' WHERE id = ?"
      ).run(hash, displayName.trim(), existing.id);
    } else {
      db.prepare(
        "INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'Admin')"
      ).run(username.trim(), displayName.trim(), hash);
    }
  });
}

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '');

if (isMain) {
  const username = parseArg('--username') || process.env.ADMIN_USERNAME || '';
  const password = parseArg('--password') || process.env.ADMIN_PASSWORD || '';
  const displayName = parseArg('--name') || 'Store Admin';

  const db = createDatabase();
  try {
    createOrResetAdmin(db, username, password, displayName);
    console.log(`Admin user "${username}" created/updated successfully.`);
  } finally {
    db.close();
  }
}
