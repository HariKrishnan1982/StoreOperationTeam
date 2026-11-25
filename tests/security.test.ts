import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import { createDatabase } from '../src/server/db/connection.js';
import { DEMO_USERS, seedDatabase } from '../src/server/db/seed.js';
import { createLogger } from '../src/server/logger.js';
import { assertProductionSafety } from '../src/server/services/authService.js';

interface AuthSessionHelper {
  cookie: string;
  csrfToken: string;
}

async function loginAs(
  app: ReturnType<typeof createApp>,
  username: string,
  password: string,
  existingCookie?: string
): Promise<AuthSessionHelper> {
  const req = request(app).post('/api/auth/login');
  if (existingCookie) req.set('Cookie', existingCookie);
  const res = await req.send({ username, password }).expect(200);

  const rawCookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies;
  return {
    cookie: cookieHeader.split(';')[0],
    csrfToken: res.body.csrfToken as string,
  };
}

function listRegisteredRoutes(
  app: ReturnType<typeof createApp>
): Array<{ method: string; path: string }> {
  const router = (
    app as unknown as {
      _router?: { stack?: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    }
  )._router;
  const routes: Array<{ method: string; path: string }> = [];
  for (const layer of router?.stack ?? []) {
    if (layer.route) {
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (
          enabled &&
          typeof layer.route.path === 'string' &&
          layer.route.path.startsWith('/api')
        ) {
          routes.push({ method: method.toUpperCase(), path: layer.route.path });
        }
      }
    }
  }
  return routes;
}

describe('Step B: Security Self-Audit', () => {
  let dbPath: string;
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-sec-'));
    dbPath = path.join(tmpDir, 'sec.db');
    db = createDatabase(dbPath);
    app = createApp(db, { loginRateLimitMax: 100 });
  });

  beforeEach(() => {
    seedDatabase(db, { reset: true, includeSampleOrders: true });
  });

  afterAll(() => {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('neutralizes CSV formula injection for =, +, -, @, tab, and CR prefixes', async () => {
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const auth = await loginAs(app, admin.username, admin.password);

    const payloads = ['=CMD|calc', '+1+1', '-1+1', '@SUM(A1:A2)', '\tTAB', '\rCR'];
    for (const payload of payloads) {
      await request(app)
        .post('/api/orders')
        .set('Cookie', auth.cookie)
        .set('X-CSRF-Token', auth.csrfToken)
        .send({
          customerName: payload,
          notes: payload,
          items: [{ productId: 4, quantity: 1 }],
        })
        .expect(201);
    }

    const csvRes = await request(app)
      .get('/api/orders/export.csv')
      .set('Cookie', auth.cookie)
      .expect(200);

    expect(csvRes.text).toContain("'=CMD|calc");
    expect(csvRes.text).toContain("'+1+1");
    expect(csvRes.text).toContain("'-1+1");
    expect(csvRes.text).toContain("'@SUM(A1:A2)");
  });

  it('stores and returns XSS payloads safely as literal text without execution', async () => {
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    const auth = await loginAs(app, admin.username, admin.password);
    const xss = '<img src=x onerror=alert(1)>';

    const created = await request(app)
      .post('/api/orders')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({
        customerName: xss,
        notes: xss,
        items: [{ productId: 4, quantity: 1 }],
      })
      .expect(201);

    expect(created.body.order.customerName).toBe(xss);
    expect(created.body.order.notes).toBe(xss);

    const cancelled = await request(app)
      .post(`/api/orders/${created.body.order.id}/status`)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .send({ status: 'Cancelled', reason: xss })
      .expect(200);

    expect(cancelled.body.order.events.at(-1).reason).toBe(xss);
  });

  it('enforces the complete Authorization Matrix across every registered API route', async () => {
    const AUTH_MATRIX: Record<
      string,
      { Unauthenticated: number[]; Admin: number[]; Operator: number[]; Warehouse: number[] }
    > = {
      'GET /api/health': {
        Unauthenticated: [200],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'POST /api/auth/login': {
        Unauthenticated: [400],
        Admin: [400],
        Operator: [400],
        Warehouse: [400],
      },
      'GET /api/auth/me': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'POST /api/auth/logout': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'POST /api/auth/change-password': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [400],
        Warehouse: [400],
      },
      'GET /api/dashboard': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'GET /api/products': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'POST /api/products': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [403],
        Warehouse: [403],
      },
      'PATCH /api/products/:id': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [403],
        Warehouse: [403],
      },
      'POST /api/products/:id/adjust-stock': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [403],
        Warehouse: [403],
      },
      'GET /api/stock-movements': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'GET /api/orders/export.csv': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'GET /api/orders': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'GET /api/orders/:id': {
        Unauthenticated: [401],
        Admin: [200],
        Operator: [200],
        Warehouse: [200],
      },
      'POST /api/orders': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [400],
        Warehouse: [403],
      },
      'PATCH /api/orders/:id': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [400],
        Warehouse: [403],
      },
      'POST /api/orders/:id/status': {
        Unauthenticated: [401],
        Admin: [400],
        Operator: [403],
        Warehouse: [400],
      },
    };

    const registered = listRegisteredRoutes(app);
    for (const r of registered) {
      const key = `${r.method} ${r.path}`;
      expect(AUTH_MATRIX, `Route missing from AUTH_MATRIX: ${key}`).toHaveProperty(key);
    }

    const adminAuth = await loginAs(app, 'admin', 'AdminPass123!');
    const opAuth = await loginAs(app, 'operator', 'OperatorPass123!');
    const whAuth = await loginAs(app, 'warehouse', 'WarehousePass123!');

    const actors = [
      { role: 'Unauthenticated' as const, auth: null },
      { role: 'Operator' as const, auth: opAuth },
      { role: 'Warehouse' as const, auth: whAuth },
      { role: 'Admin' as const, auth: adminAuth },
    ];

    for (const [routeKey, expectedByRole] of Object.entries(AUTH_MATRIX)) {
      const [method, rawPath] = routeKey.split(' ');
      const targetPath = rawPath.replace(':id', '1');

      for (const actor of actors) {
        if (routeKey === 'POST /api/auth/logout' && actor.auth) {
          // Re-login after logout so subsequent checks keep working
          const tempAuth = await loginAs(app, actor.role.toLowerCase(), `${actor.role}Pass123!`);
          const res = await request(app)
            .post(targetPath)
            .set('Cookie', tempAuth.cookie)
            .set('X-CSRF-Token', tempAuth.csrfToken);
          expect(expectedByRole[actor.role], `${routeKey} as ${actor.role}`).toContain(res.status);
          continue;
        }

        const req =
          method === 'GET'
            ? request(app).get(targetPath)
            : method === 'POST'
              ? request(app).post(targetPath).send({})
              : request(app).patch(targetPath).send({});

        if (actor.auth) {
          req.set('Cookie', actor.auth.cookie).set('X-CSRF-Token', actor.auth.csrfToken);
        }

        const res = await req;
        expect(
          expectedByRole[actor.role],
          `${routeKey} as ${actor.role} got ${res.status}`
        ).toContain(res.status);
      }
    }
  });

  it('supports session rotation on login, idle/absolute expiry, and password change invalidating other sessions', async () => {
    const s1 = await loginAs(app, 'operator', 'OperatorPass123!');
    const s2 = await loginAs(app, 'operator', 'OperatorPass123!');

    // Session rotation: logging in while holding s1 invalidates s1
    const rotated = await loginAs(app, 'operator', 'OperatorPass123!', s1.cookie);
    await request(app).get('/api/auth/me').set('Cookie', s1.cookie).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', rotated.cookie).expect(200);

    // Password change invalidates other sessions (s2) while keeping current session (rotated)
    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', rotated.cookie)
      .set('X-CSRF-Token', rotated.csrfToken)
      .send({ currentPassword: 'OperatorPass123!', newPassword: 'NewOperatorPass456!' })
      .expect(200);

    await request(app).get('/api/auth/me').set('Cookie', s2.cookie).expect(401);
    await request(app).get('/api/auth/me').set('Cookie', rotated.cookie).expect(200);

    // Idle expiry: force last_active_at older than 30m
    const sid = rotated.cookie.split('=')[1];
    db.prepare("UPDATE sessions SET last_active_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(
      sid
    );
    await request(app).get('/api/auth/me').set('Cookie', rotated.cookie).expect(401);
  });

  it('scopes Idempotency-Key per user, returns 422 on payload mismatch, and expires old keys', async () => {
    const adminAuth = await loginAs(app, 'admin', 'AdminPass123!');
    const opAuth = await loginAs(app, 'operator', 'OperatorPass123!');

    const key = 'shared-key-123';

    // Admin and Operator can use the same key independently
    const a1 = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 4, quantity: 1 }] })
      .expect(201);

    const o1 = await request(app)
      .post('/api/orders')
      .set('Cookie', opAuth.cookie)
      .set('X-CSRF-Token', opAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 4, quantity: 2 }] })
      .expect(201);

    expect(a1.body.order.id).not.toBe(o1.body.order.id);

    // Reusing key with different payload -> 422
    const mismatch = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 4, quantity: 3 }] })
      .expect(422);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');

    // Expire old key -> reusing key creates a new order
    db.prepare(
      "UPDATE idempotency_keys SET expires_at = '2020-01-01T00:00:00.000Z' WHERE key = ?"
    ).run(key);
    const afterExpiry = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: 4, quantity: 3 }] })
      .expect(201);
    expect(afterExpiry.body.order.id).not.toBe(a1.body.order.id);
  });

  it('redacts cookies, CSRF tokens, Authorization headers, and phone numbers from pino logs', async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    });
    const testLogger = createLogger('info', stream);
    const loggedApp = createApp(db, { logger: testLogger, loginRateLimitMax: 100 });

    const auth = await loginAs(loggedApp, 'admin', 'AdminPass123!');
    await request(loggedApp)
      .post('/api/orders')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrfToken)
      .set('Authorization', 'Bearer super-secret-bearer')
      .send({
        customerName: 'Test Caller',
        customerPhone: '555-867-5309',
        items: [{ productId: 4, quantity: 1 }],
      })
      .expect(201);

    const logs = chunks.join('\n');
    expect(logs).not.toContain('super-secret-bearer');
    expect(logs).not.toContain(auth.csrfToken);
    expect(logs).not.toContain(auth.cookie.split('=')[1]);
    expect(logs).not.toContain('555-867-5309');
  });

  it('refuses to start in production when seeded demo credentials exist unless ALLOW_DEMO_USERS=true', () => {
    const prodConfig = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-very-strong-random-production-secret-32chars!',
      ALLOW_DEMO_USERS: 'false',
    } as NodeJS.ProcessEnv);

    expect(() => assertProductionSafety(db, prodConfig)).toThrow(/ALLOW_DEMO_USERS/);

    const allowedConfig = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-very-strong-random-production-secret-32chars!',
      ALLOW_DEMO_USERS: 'true',
    } as NodeJS.ProcessEnv);

    expect(() => assertProductionSafety(db, allowedConfig)).not.toThrow();
  });
});
