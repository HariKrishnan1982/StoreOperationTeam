import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { createDatabase } from '../src/server/db/connection.js';
import { runMigrations } from '../src/server/db/migrate.js';
import { DEMO_USERS, seedDatabase } from '../src/server/db/seed.js';

async function loginAs(
  app: ReturnType<typeof createApp>,
  username: string,
  password: string
): Promise<{ cookie: string; csrfToken: string }> {
  const res = await request(app).post('/api/auth/login').send({ username, password }).expect(200);
  const rawCookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies;
  return {
    cookie: cookieHeader.split(';')[0],
    csrfToken: res.body.csrfToken as string,
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

describe('Step C: Reliability & Load Smoke Tests', () => {
  let dbPath: string;
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-rel-'));
    dbPath = path.join(tmpDir, 'rel.db');
    db = createDatabase(dbPath);
    app = createApp(db, { loginRateLimitMax: 100 });
  });

  beforeEach(() => {
    seedDatabase(db, { reset: true, includeSampleOrders: false });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('restarts DB mid-suite and confirms migrations are idempotent from v1 to latest', async () => {
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const auth = await loginAs(app, admin.username, admin.password);

    const created = await request(app)
      .post('/api/orders')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ items: [{ productId: 1, quantity: 2 }] })
      .expect(201);

    // Close DB, reopen, re-run migrations
    db.close();
    db = createDatabase(dbPath);
    const newlyApplied = runMigrations(db);
    expect(newlyApplied).toBe(0);

    const versions = db
      .prepare('SELECT version FROM schema_version ORDER BY version ASC')
      .all() as Array<{ version: number }>;
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);

    app = createApp(db, { loginRateLimitMax: 100 });
    const fetched = await request(app)
      .get(`/api/orders/${created.body.order.id}`)
      .set('Cookie', auth.cookie)
      .expect(200);
    expect(fetched.body.order.reference).toBe(created.body.order.reference);
  });

  it('detects optimistic-lock conflict on simultaneous edit vs status change', async () => {
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const auth = await loginAs(app, admin.username, admin.password);

    const created = await request(app)
      .post('/api/orders')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ items: [{ productId: 4, quantity: 1 }] })
      .expect(201);

    const orderId = created.body.order.id;
    const version = created.body.order.version;
    expect(version).toBe(1);

    const [editRes, statusRes] = await Promise.all([
      request(app)
        .patch(`/api/orders/${orderId}`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrfToken)
        .send({ items: [{ productId: 4, quantity: 2 }], expectedVersion: version }),
      request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrfToken)
        .send({ status: 'Packed', expectedVersion: version }),
    ]);

    const statuses = [editRes.status, statusRes.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const conflictBody = editRes.status === 409 ? editRes.body : statusRes.body;
    expect(['OPTIMISTIC_LOCK_CONFLICT', 'INVALID_STATUS_TRANSITION']).toContain(
      conflictBody.error.code
    );
  });

  it('handles 200-request load smoke test across list and create endpoints within latency budget', async () => {
    // Increase product stock so 50 creates succeed cleanly
    db.prepare('UPDATE products SET stock = 500 WHERE id = 4').run();
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const auth = await loginAs(app, admin.username, admin.password);

    const latenciesMs: number[] = [];

    // 50 POST /api/orders in batches of 10
    for (let batch = 0; batch < 5; batch++) {
      await Promise.all(
        Array.from({ length: 10 }, async () => {
          const t0 = performance.now();
          await request(app)
            .post('/api/orders')
            .set('Cookie', auth.cookie)
            .set('X-CSRF-Token', auth.csrfToken)
            .send({ items: [{ productId: 4, quantity: 1 }] })
            .expect(201);
          latenciesMs.push(performance.now() - t0);
        })
      );
    }

    // 150 GET /api/orders in batches of 15
    for (let batch = 0; batch < 10; batch++) {
      await Promise.all(
        Array.from({ length: 15 }, async () => {
          const t0 = performance.now();
          await request(app)
            .get('/api/orders?page=1&pageSize=20')
            .set('Cookie', auth.cookie)
            .expect(200);
          latenciesMs.push(performance.now() - t0);
        })
      );
    }

    expect(latenciesMs).toHaveLength(200);
    const p95 = percentile(latenciesMs, 95);
    console.log(`Load smoke test (200 reqs): p95=${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(1000);
  });
});
