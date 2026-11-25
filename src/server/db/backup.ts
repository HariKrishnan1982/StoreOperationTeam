import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { createDatabase } from './connection.js';

export function backupDatabase(
  sourcePath: string = config.databasePath,
  backupsDir: string = path.resolve(process.cwd(), 'backups'),
  retention: number = config.backupRetention
): { destPath: string; pruned: string[] } {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destPath = path.join(backupsDir, `store_ops-${stamp}.db`);

  const db = createDatabase(sourcePath);
  try {
    const escaped = destPath.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}';`);
  } finally {
    db.close();
  }

  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith('store_ops-') && f.endsWith('.db'))
    .sort()
    .reverse();

  const pruned: string[] = [];
  for (const oldFile of files.slice(retention)) {
    const full = path.join(backupsDir, oldFile);
    fs.rmSync(full, { force: true });
    pruned.push(oldFile);
  }

  return { destPath, pruned };
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '');

if (isMain) {
  const { destPath, pruned } = backupDatabase();
  console.log(`SQLite backup created at: ${destPath} (pruned ${pruned.length} old backup(s))`);
}
