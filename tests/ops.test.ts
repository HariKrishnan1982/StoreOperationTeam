import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { backupDatabase } from '../src/server/db/backup.js';
import { createDatabase } from '../src/server/db/connection.js';
import { createOrResetAdmin } from '../src/server/db/createAdmin.js';
import { DEMO_USERS, seedDatabase } from '../src/server/db/seed.js';
import { cleanupExpiredRecords, loginWithPassword } from '../src/server/services/authService.js';
import { getDashboardSummary } from '../src/server/services/inventoryService.js';
import { createOrder, listOrders } from '../src/server/services/orderService.js';

describe('Phase 6 & 7: Config, Backup, Cleanup, Proxy, CSV 250+, Limits & Timezone', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails fast in production when SESSION_SECRET is missing or weak', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/
    );

    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'short-secret',
      } as NodeJS.ProcessEnv)
    ).toThrow(/SESSION_SECRET/);

    const valid = loadConfig({
      NODE_ENV: 'production',
      PORT: '4000',
      DB_PATH: '/var/data/ops.db',
      SESSION_SECRET: 'a-very-strong-random-production-secret-32chars!',
      TRUST_PROXY: '1',
      STORE_TIMEZONE: 'America/New_York',
    } as NodeJS.ProcessEnv);

    expect(valid.port).toBe(4000);
    expect(valid.databasePath).toBe('/var/data/ops.db');
    expect(valid.cookieSecure).toBe(true);
    expect(valid.trustProxy).toBe(1);
    expect(valid.storeTimezone).toBe('America/New_York');
  });

  it('creates hot backups with retention pruning and restores database cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-backup-'));
    tempDirs.push(tmpDir);

    const dbPath = path.join(tmpDir, 'store_ops.db');
    const backupsDir = path.join(tmpDir, 'backups');

    const db = createDatabase(dbPath);
    seedDatabase(db, { reset: true, includeSampleOrders: false });
    const { order } = createOrder(db, { items: [{ productId: 1, quantity: 2 }] });
    db.close();

    const b1 = backupDatabase(dbPath, backupsDir, 2);
    await new Promise((r) => setTimeout(r, 15));
    const b2 = backupDatabase(dbPath, backupsDir, 2);
    await new Promise((r) => setTimeout(r, 15));
    const b3 = backupDatabase(dbPath, backupsDir, 2);

    expect(fs.existsSync(b1.destPath)).toBe(false);
    expect(fs.existsSync(b2.destPath)).toBe(true);
    expect(fs.existsSync(b3.destPath)).toBe(true);
    expect(b3.pruned).toHaveLength(1);

    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) {
        fs.rmSync(dbPath + suffix, { force: true });
      }
    }
    fs.copyFileSync(b3.destPath, dbPath);

    const restoredDb = createDatabase(dbPath);
    const ordersResult = listOrders(restoredDb, {});
    expect(ordersResult.orders).toHaveLength(1);
    expect(ordersResult.orders[0].reference).toBe(order.reference);
    restoredDb.close();
  });

  it('exports 250+ orders via CSV without 100-row truncation', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-csv-'));
    tempDirs.push(tmpDir);
    const db = createDatabase(path.join(tmpDir, 'csv.db'));
    seedDatabase(db, { reset: true, includeSampleOrders: false });
    db.prepare('UPDATE products SET stock = 1000 WHERE id = 4').run();

    for (let i = 0; i < 255; i++) {
      createOrder(db, { items: [{ productId: 4, quantity: 1 }] });
    }

    const app = createApp(db, { rateLimitMax: 1000 });
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: admin.username, password: admin.password })
      .expect(200);
    const rawCookies = loginRes.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookies) ? rawCookies[0] : rawCookies).split(';')[0];

    const csvRes = await request(app)
      .get('/api/orders/export.csv')
      .set('Cookie', cookie)
      .expect(200);

    const lines = csvRes.text.trim().split(/\r?\n/);
    expect(lines).toHaveLength(256); // 1 header + 255 orders
    db.close();
  });

  it('keys rate limiting on X-Forwarded-For when trustProxy is enabled and enforces general /api 429 and 413', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-lim-'));
    tempDirs.push(tmpDir);
    const db = createDatabase(path.join(tmpDir, 'lim.db'));
    seedDatabase(db, { reset: true, includeSampleOrders: false });

    const app = createApp(db, { trustProxy: 1, rateLimitMax: 3 });

    // IP 1 hits limit after 3 requests
    await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.10').expect(200);
    await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.10').expect(200);
    await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.10').expect(200);
    const limited = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '203.0.113.10')
      .expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

    // IP 2 is unaffected because trustProxy keys on real client IP
    await request(app).get('/api/health').set('X-Forwarded-For', '203.0.113.11').expect(200);

    // 413 payload-too-large (>32kb)
    const bigApp = createApp(db, { rateLimitMax: 100 });
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const loginRes = await request(bigApp)
      .post('/api/auth/login')
      .send({ username: admin.username, password: admin.password })
      .expect(200);
    const rawCookies = loginRes.headers['set-cookie'];
    const cookie = (Array.isArray(rawCookies) ? rawCookies[0] : rawCookies).split(';')[0];
    const csrf = loginRes.body.csrfToken as string;

    const huge = await request(bigApp)
      .post('/api/orders')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ notes: 'a'.repeat(40_000), items: [{ productId: 4, quantity: 1 }] })
      .expect(413);
    expect(huge.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    db.close();
  });

  it('cleans up expired sessions and expired idempotency keys while keeping active ones', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-clean-'));
    tempDirs.push(tmpDir);
    const db = createDatabase(path.join(tmpDir, 'clean.db'));
    seedDatabase(db, { reset: true, includeSampleOrders: false });

    db.prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, expires_at, last_active_at)
       VALUES ('expired-abs', 1, 'c', '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'),
              ('active-sess', 1, 'c', '2099-01-01T00:00:00.000Z', ?)`
    ).run(new Date().toISOString());

    db.prepare(
      `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body, expires_at)
       VALUES (1, 'old-key', 'h', 201, '{}', '2020-01-01T00:00:00.000Z'),
              (1, 'fresh-key', 'h', 201, '{}', '2099-01-01T00:00:00.000Z')`
    ).run();

    const result = cleanupExpiredRecords(db);
    expect(result.deletedSessions).toBe(1);
    expect(result.deletedIdempotencyKeys).toBe(1);

    const remainingSessions = db.prepare('SELECT id FROM sessions').all() as Array<{ id: string }>;
    expect(remainingSessions.map((s) => s.id)).toEqual(['active-sess']);
    db.close();
  });

  it('computes dashboard today counts using configurable STORE_TIMEZONE', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-tz-'));
    tempDirs.push(tmpDir);
    const db = createDatabase(path.join(tmpDir, 'tz.db'));
    seedDatabase(db, { reset: true, includeSampleOrders: false });

    createOrder(db, { items: [{ productId: 4, quantity: 1 }] });
    const summary = getDashboardSummary(db, 'America/New_York');
    expect(summary.storeTimezone).toBe('America/New_York');
    expect(summary.todayOrdersCount).toBe(1);
    db.close();
  });

  it('creates and resets a non-demo Admin user via createOrResetAdmin', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-adm-'));
    tempDirs.push(tmpDir);
    const db = createDatabase(path.join(tmpDir, 'adm.db'));

    createOrResetAdmin(db, 'prodadmin', 'StrongProdPass!123', 'Prod Lead');
    const session = loginWithPassword(db, 'prodadmin', 'StrongProdPass!123');
    expect(session.user.role).toBe('Admin');
    expect(session.user.displayName).toBe('Prod Lead');

    createOrResetAdmin(db, 'prodadmin', 'RotatedProdPass!456', 'Prod Lead');
    expect(() => loginWithPassword(db, 'prodadmin', 'StrongProdPass!123')).toThrow();
    const rotated = loginWithPassword(db, 'prodadmin', 'RotatedProdPass!456');
    expect(rotated.user.role).toBe('Admin');
    db.close();
  });
});
