import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { createDatabase } from '../src/server/db/connection.js';
import { DEMO_USERS, seedDatabase } from '../src/server/db/seed.js';

interface AuthSessionHelper {
  cookie: string;
  csrfToken: string;
}

async function loginAs(
  app: ReturnType<typeof createApp>,
  username: string,
  password: string
): Promise<AuthSessionHelper> {
  const res = await request(app).post('/api/auth/login').send({ username, password }).expect(200);

  const rawCookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookies) ? rawCookies[0] : rawCookies;
  const cookie = cookieHeader.split(';')[0];
  return {
    cookie,
    csrfToken: res.body.csrfToken as string,
  };
}

describe('Store Ops Console API & Hardening (SQLite)', () => {
  let dbPath: string;
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;
  let adminAuth: AuthSessionHelper;

  beforeAll(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-ops-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = createDatabase(dbPath);
    app = createApp(db);
  });

  beforeEach(async () => {
    seedDatabase(db, { reset: true, includeSampleOrders: false });
    const admin = DEMO_USERS.find((u) => u.role === 'Admin')!;
    adminAuth = await loginAs(app, admin.username, admin.password);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('places a multi-item order and deducts stock atomically', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
    const tape = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-104');

    expect(scanner.stock).toBe(5);
    expect(tape.stock).toBe(24);

    const createRes = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({
        customerName: 'Samira Patel',
        customerPhone: '555-0111',
        items: [
          { productId: scanner.id, quantity: 2 },
          { productId: tape.id, quantity: 3 },
        ],
      })
      .expect(201);

    const order = createRes.body.order;
    expect(order.reference).toBe('ORD-1001');
    expect(order.status).toBe('Placed');
    expect(order.totalCents).toBe(scanner.priceCents * 2 + tape.priceCents * 3);
    expect(order.items).toHaveLength(2);

    const updatedProductsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const updatedScanner = updatedProductsRes.body.products.find(
      (p: { sku: string }) => p.sku === 'SKU-101'
    );
    const updatedTape = updatedProductsRes.body.products.find(
      (p: { sku: string }) => p.sku === 'SKU-104'
    );

    expect(updatedScanner.stock).toBe(3);
    expect(updatedTape.stock).toBe(21);
  });

  it('rejects a multi-item order if one item is out of stock and leaves all stock unchanged', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const productA = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
    const productB = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-102');

    const failRes = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({
        items: [
          { productId: productA.id, quantity: 2 },
          { productId: productB.id, quantity: 1 },
        ],
      })
      .expect(409);

    expect(failRes.body.error.code).toBe('INSUFFICIENT_STOCK');

    const ordersRes = await request(app)
      .get('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(ordersRes.body.orders).toHaveLength(0);

    const afterProductsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const afterA = afterProductsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
    expect(afterA.stock).toBe(5);
  });

  it('restores stock once on cancellation and rejects repeated cancellation', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const productA = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

    const createRes = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ items: [{ productId: productA.id, quantity: 2 }] })
      .expect(201);

    const orderId = createRes.body.order.id;

    const cancelRes = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Cancelled', reason: 'Customer changed mind' })
      .expect(200);
    expect(cancelRes.body.order.status).toBe('Cancelled');

    let checkProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(
      checkProducts.body.products.find((p: { id: number }) => p.id === productA.id).stock
    ).toBe(5);

    const repeatCancelRes = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Cancelled', reason: 'Duplicate cancel' })
      .expect(409);
    expect(repeatCancelRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    checkProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(
      checkProducts.body.products.find((p: { id: number }) => p.id === productA.id).stock
    ).toBe(5);
  });

  it('rejects skipped or invalid state transitions on the server', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const productA = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

    const createRes = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ items: [{ productId: productA.id, quantity: 1 }] })
      .expect(201);
    const orderId = createRes.body.order.id;

    const skipRes = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Shipped' })
      .expect(409);
    expect(skipRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Packed' })
      .expect(200);
    await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Shipped' })
      .expect(200);

    const cancelShippedRes = await request(app)
      .post(`/api/orders/${orderId}/status`)
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ status: 'Cancelled', reason: 'Too late to cancel' })
      .expect(409);
    expect(cancelShippedRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const afterProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(
      afterProducts.body.products.find((p: { id: number }) => p.id === productA.id).stock
    ).toBe(4);
  });

  it('persists orders, stock, and sessions across database close and reopen (restart)', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const productA = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

    const createRes = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({ items: [{ productId: productA.id, quantity: 2 }] })
      .expect(201);
    const reference = createRes.body.order.reference;

    db.close();
    db = createDatabase(dbPath);
    seedDatabase(db, { reset: false, includeSampleOrders: false });
    app = createApp(db);

    const ordersAfterRestart = await request(app)
      .get(`/api/orders?search=${reference}`)
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(ordersAfterRestart.body.orders).toHaveLength(1);
    expect(ordersAfterRestart.body.orders[0].reference).toBe(reference);

    const productsAfterRestart = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(
      productsAfterRestart.body.products.find((p: { sku: string }) => p.sku === 'SKU-101').stock
    ).toBe(3);
  });

  it('handles 10 concurrent orders for a 5-stock item without overselling or negative stock', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
    expect(scanner.stock).toBe(5);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/api/orders')
          .set('Cookie', adminAuth.cookie)
          .set('X-CSRF-Token', adminAuth.csrfToken)
          .send({ items: [{ productId: scanner.id, quantity: 1 }] })
      )
    );

    const succeeded = responses.filter((r) => r.status === 201);
    const failed = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(5);
    for (const fail of failed) {
      expect(fail.body.error.code).toBe('INSUFFICIENT_STOCK');
    }

    const afterProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const afterScanner = afterProducts.body.products.find(
      (p: { sku: string }) => p.sku === 'SKU-101'
    );
    expect(afterScanner.stock).toBe(0);

    const ordersRes = await request(app)
      .get('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(ordersRes.body.orders).toHaveLength(5);
  });

  it('validates inputs with Zod and returns unified 400 error responses', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

    const badPayloads = [
      { items: [] },
      { items: [{ productId: scanner.id, quantity: 1.5 }] },
      { items: [{ productId: scanner.id, quantity: -2 }] },
      { items: [{ productId: scanner.id, quantity: 5000 }] },
      { items: [{ productId: 999999, quantity: 1 }] },
      { notes: 'x'.repeat(501), items: [{ productId: scanner.id, quantity: 1 }] },
      { customerPhone: 'abc-not-phone', items: [{ productId: scanner.id, quantity: 1 }] },
    ];

    for (const payload of badPayloads) {
      const res = await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send(payload)
        .expect(400);
      expect(res.body.error).toBeDefined();
      expect(typeof res.body.error.code).toBe('string');
      expect(typeof res.body.error.message).toBe('string');
    }

    const badId = await request(app)
      .get('/api/orders/not-a-number')
      .set('Cookie', adminAuth.cookie)
      .expect(400);
    expect(badId.body.error.code).toBe('VALIDATION_ERROR');

    const badStatus = await request(app)
      .get('/api/orders?status=Unknown')
      .set('Cookie', adminAuth.cookie)
      .expect(400);
    expect(badStatus.body.error.code).toBe('VALIDATION_ERROR');

    const badJson = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Content-Type', 'application/json')
      .send('{"items": [')
      .expect(400);
    expect(badJson.body.error.code).toBe('INVALID_JSON');
  });

  it('supports Idempotency-Key to prevent duplicate orders on retries and detects conflicts', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

    const key = 'idem-key-001';
    const payload = { items: [{ productId: scanner.id, quantity: 2 }] };

    const first = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const retry = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);

    expect(retry.body.order.id).toBe(first.body.order.id);
    expect(retry.body.order.reference).toBe(first.body.order.reference);

    const afterProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(afterProducts.body.products.find((p: { id: number }) => p.id === scanner.id).stock).toBe(
      3
    );

    const conflict = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .set('Idempotency-Key', key)
      .send({ items: [{ productId: scanner.id, quantity: 1 }] })
      .expect(422);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
  });

  it('computes exact integer-cent totals across multiple line items and merged duplicates', async () => {
    const productsRes = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
    const tape = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-104');

    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', adminAuth.cookie)
      .set('X-CSRF-Token', adminAuth.csrfToken)
      .send({
        items: [
          { productId: scanner.id, quantity: 2 },
          { productId: tape.id, quantity: 3 },
          { productId: scanner.id, quantity: 1 },
        ],
      })
      .expect(201);

    const order = res.body.order;
    expect(order.items).toHaveLength(2);
    const scannerItem = order.items.find((i: { productId: number }) => i.productId === scanner.id);
    expect(scannerItem.quantity).toBe(3);
    expect(scannerItem.lineTotalCents).toBe(scanner.priceCents * 3);
    expect(Number.isInteger(order.totalCents)).toBe(true);
    expect(order.totalCents).toBe(scanner.priceCents * 3 + tape.priceCents * 3);

    const afterProducts = await request(app)
      .get('/api/products')
      .set('Cookie', adminAuth.cookie)
      .expect(200);
    expect(afterProducts.body.products.find((p: { id: number }) => p.id === scanner.id).stock).toBe(
      2
    );
  });

  it('sets security headers, X-Request-Id, and enforces strict CORS', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');

    const corsRes = await request(app)
      .get('/api/products')
      .set('Origin', 'https://evil.example.com')
      .expect(403);
    expect(corsRes.body.error.code).toBe('CORS_FORBIDDEN');
  });

  describe('Authentication, Roles, CSRF & Throttling', () => {
    it('returns 401 UNAUTHORIZED on every protected route when unauthenticated', async () => {
      const checks = [
        request(app).get('/api/auth/me'),
        request(app).post('/api/auth/logout'),
        request(app).get('/api/products'),
        request(app).get('/api/orders'),
        request(app).get('/api/orders/1'),
        request(app)
          .post('/api/orders')
          .send({ items: [{ productId: 1, quantity: 1 }] }),
        request(app).post('/api/orders/1/status').send({ status: 'Packed' }),
      ];

      const results = await Promise.all(checks);
      for (const res of results) {
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('enforces Operator and Warehouse role permissions with 403 FORBIDDEN', async () => {
      const operatorUser = DEMO_USERS.find((u) => u.role === 'Operator')!;
      const warehouseUser = DEMO_USERS.find((u) => u.role === 'Warehouse')!;

      const operatorAuth = await loginAs(app, operatorUser.username, operatorUser.password);
      const warehouseAuth = await loginAs(app, warehouseUser.username, warehouseUser.password);

      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', operatorAuth.cookie)
        .expect(200);
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

      // Operator can create an order
      const createdRes = await request(app)
        .post('/api/orders')
        .set('Cookie', operatorAuth.cookie)
        .set('X-CSRF-Token', operatorAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 1 }] })
        .expect(201);
      const orderId = createdRes.body.order.id;

      // Operator CANNOT pack/ship/cancel
      const opPackRes = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', operatorAuth.cookie)
        .set('X-CSRF-Token', operatorAuth.csrfToken)
        .send({ status: 'Packed' })
        .expect(403);
      expect(opPackRes.body.error.code).toBe('FORBIDDEN');

      // Warehouse CANNOT create orders
      const whCreateRes = await request(app)
        .post('/api/orders')
        .set('Cookie', warehouseAuth.cookie)
        .set('X-CSRF-Token', warehouseAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 1 }] })
        .expect(403);
      expect(whCreateRes.body.error.code).toBe('FORBIDDEN');

      // Warehouse CAN pack/ship/cancel
      await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', warehouseAuth.cookie)
        .set('X-CSRF-Token', warehouseAuth.csrfToken)
        .send({ status: 'Packed' })
        .expect(200);
    });

    it('enforces CSRF tokens on state-changing routes and invalidates sessions on logout', async () => {
      const missingCsrf = await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .send({ items: [{ productId: 1, quantity: 1 }] })
        .expect(403);
      expect(missingCsrf.body.error.code).toBe('CSRF_INVALID');

      const wrongCsrf = await request(app)
        .post('/api/orders/1/status')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', 'wrong-token')
        .send({ status: 'Packed' })
        .expect(403);
      expect(wrongCsrf.body.error.code).toBe('CSRF_INVALID');

      // Logout without CSRF fails
      await request(app).post('/api/auth/logout').set('Cookie', adminAuth.cookie).expect(403);

      // Logout with CSRF succeeds and invalidates session
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .expect(200);

      await request(app).get('/api/auth/me').set('Cookie', adminAuth.cookie).expect(401);
    });

    it('throttles repeated login attempts with 429 LOGIN_RATE_LIMIT_EXCEEDED', async () => {
      const throttledApp = createApp(db, { loginRateLimitMax: 3 });

      for (let i = 0; i < 3; i++) {
        const res = await request(throttledApp)
          .post('/api/auth/login')
          .send({ username: 'admin', password: 'WrongPassword!' })
          .expect(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }

      const blocked = await request(throttledApp)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'WrongPassword!' })
        .expect(429);
      expect(blocked.body.error.code).toBe('LOGIN_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Phase 3: Audit Trail, Stock Movements, Migrations & Optimistic Locking', () => {
    it('tracks applied migrations in schema_version', () => {
      const rows = db
        .prepare('SELECT version, name FROM schema_version ORDER BY version ASC')
        .all() as Array<{ version: number; name: string }>;
      expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
    });

    it('requires a cancellation reason and records full order_events and stock_movements', async () => {
      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 2 }] })
        .expect(201);
      const orderId = createRes.body.order.id;
      expect(createRes.body.order.version).toBe(1);
      expect(createRes.body.order.events).toHaveLength(1);
      expect(createRes.body.order.events[0].toStatus).toBe('Placed');

      // Missing cancellation reason -> 400 VALIDATION_ERROR
      const missingReason = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ status: 'Cancelled' })
        .expect(400);
      expect(missingReason.body.error.code).toBe('VALIDATION_ERROR');

      // Pack then cancel with reason
      const packed = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ status: 'Packed', expectedVersion: 1 })
        .expect(200);
      expect(packed.body.order.version).toBe(2);

      const cancelled = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          status: 'Cancelled',
          reason: 'Customer requested cancellation',
          expectedVersion: 2,
        })
        .expect(200);

      expect(cancelled.body.order.version).toBe(3);
      expect(cancelled.body.order.events).toHaveLength(3);
      expect(cancelled.body.order.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
        'Placed',
        'Packed',
        'Cancelled',
      ]);
      expect(cancelled.body.order.events[2].reason).toBe('Customer requested cancellation');
      expect(cancelled.body.order.events[2].actorUsername).toBe('admin');

      // Check stock_movements via API
      const movementsRes = await request(app)
        .get(`/api/stock-movements?productId=${scanner.id}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(movementsRes.body.movements).toHaveLength(2);
      expect(movementsRes.body.movements[0]).toMatchObject({
        productId: scanner.id,
        delta: 2,
        reason: 'ORDER_CANCELLED',
        orderId,
      });
      expect(movementsRes.body.movements[1]).toMatchObject({
        productId: scanner.id,
        delta: -2,
        reason: 'ORDER_PLACED',
        orderId,
      });
    });

    it('rejects stale expectedVersion with 409 OPTIMISTIC_LOCK_CONFLICT', async () => {
      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 1 }] })
        .expect(201);
      const orderId = createRes.body.order.id;

      // Staff A packs the order (version 1 -> 2)
      await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ status: 'Packed', expectedVersion: 1 })
        .expect(200);

      // Staff B tries to act with stale expectedVersion: 1 -> 409 OPTIMISTIC_LOCK_CONFLICT
      const conflictRes = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ status: 'Cancelled', reason: 'Stale action', expectedVersion: 1 })
        .expect(409);

      expect(conflictRes.body.error.code).toBe('OPTIMISTIC_LOCK_CONFLICT');
    });
  });

  describe('Phase 4: Inventory, Pagination, Customer Lookup, Order Editing, Dashboard & CSV', () => {
    it('allows Admin to create, update price, and adjust stock with reason, and blocks non-Admins', async () => {
      const op = DEMO_USERS.find((u) => u.role === 'Operator')!;
      const opAuth = await loginAs(app, op.username, op.password);

      await request(app)
        .post('/api/products')
        .set('Cookie', opAuth.cookie)
        .set('X-CSRF-Token', opAuth.csrfToken)
        .send({ sku: 'SKU-999', name: 'Blocked Item', priceCents: 1000, stock: 5 })
        .expect(403);

      const created = await request(app)
        .post('/api/products')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          sku: 'SKU-108',
          name: 'Thermal Labels Roll',
          category: 'Supplies',
          priceCents: 2500,
          stock: 10,
        })
        .expect(201);
      const productId = created.body.product.id;

      const updated = await request(app)
        .patch(`/api/products/${productId}`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ priceCents: 2750 })
        .expect(200);
      expect(updated.body.product.priceCents).toBe(2750);

      const adjusted = await request(app)
        .post(`/api/products/${productId}/adjust-stock`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ delta: -3, reason: 'Damaged in transit' })
        .expect(200);
      expect(adjusted.body.product.stock).toBe(7);

      // Cannot adjust below zero
      await request(app)
        .post(`/api/products/${productId}/adjust-stock`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ delta: -20, reason: 'Too much shrinkage' })
        .expect(409);

      const movements = await request(app)
        .get(`/api/stock-movements?productId=${productId}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(movements.body.movements).toHaveLength(2);
      expect(movements.body.movements[0]).toMatchObject({
        delta: -3,
        reason: 'Damaged in transit',
      });
    });

    it('supports customer lookup, sorting, date-range filtering, and pagination', async () => {
      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      const tape = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-104');
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

      await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          customerName: 'Alice Mercer',
          customerPhone: '555-9901',
          items: [{ productId: tape.id, quantity: 1 }],
        })
        .expect(201);

      await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          customerName: 'Bob Vance',
          customerPhone: '555-8802',
          items: [{ productId: scanner.id, quantity: 2 }],
        })
        .expect(201);

      await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          customerName: 'Clara Oswald',
          customerPhone: '555-7703',
          items: [{ productId: tape.id, quantity: 3 }],
        })
        .expect(201);

      // Search by customer name & phone
      const byName = await request(app)
        .get('/api/orders?search=Alice')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(byName.body.orders).toHaveLength(1);
      expect(byName.body.orders[0].customerName).toBe('Alice Mercer');

      const byPhone = await request(app)
        .get('/api/orders?search=555-8802')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(byPhone.body.orders).toHaveLength(1);
      expect(byPhone.body.orders[0].customerName).toBe('Bob Vance');

      // Pagination & sorting
      const page1 = await request(app)
        .get('/api/orders?sortBy=totalCents&sortDir=desc&page=1&pageSize=2')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(page1.body.orders).toHaveLength(2);
      expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(page1.body.orders[0].customerName).toBe('Bob Vance');

      const page2 = await request(app)
        .get('/api/orders?sortBy=totalCents&sortDir=desc&page=2&pageSize=2')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(page2.body.orders).toHaveLength(1);

      // Date range filter (today)
      const today = new Date().toISOString().slice(0, 10);
      const dateFiltered = await request(app)
        .get(`/api/orders?dateFrom=${today}&dateTo=${today}`)
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(dateFiltered.body.orders).toHaveLength(3);
    });

    it('edits a Placed order with atomic stock reconciliation and rejects editing Packed orders', async () => {
      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');
      const tape = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-104');

      const createRes = await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 2 }] })
        .expect(201);
      const order = createRes.body.order;

      // Edit: change scanner 2 -> 4, add tape 1
      const editedRes = await request(app)
        .patch(`/api/orders/${order.id}`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          items: [
            { productId: scanner.id, quantity: 4 },
            { productId: tape.id, quantity: 1 },
          ],
          expectedVersion: order.version,
        })
        .expect(200);

      expect(editedRes.body.order.version).toBe(2);
      expect(editedRes.body.order.totalCents).toBe(scanner.priceCents * 4 + tape.priceCents);

      const afterProducts = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(
        afterProducts.body.products.find((p: { id: number }) => p.id === scanner.id).stock
      ).toBe(1);
      expect(afterProducts.body.products.find((p: { id: number }) => p.id === tape.id).stock).toBe(
        23
      );

      // Pack order -> editing must be rejected with 409
      await request(app)
        .post(`/api/orders/${order.id}/status`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ status: 'Packed' })
        .expect(200);

      await request(app)
        .patch(`/api/orders/${order.id}`)
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({ items: [{ productId: scanner.id, quantity: 1 }] })
        .expect(409);
    });

    it('returns dashboard summary and exports orders as CSV', async () => {
      const productsRes = await request(app)
        .get('/api/products')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      const scanner = productsRes.body.products.find((p: { sku: string }) => p.sku === 'SKU-101');

      await request(app)
        .post('/api/orders')
        .set('Cookie', adminAuth.cookie)
        .set('X-CSRF-Token', adminAuth.csrfToken)
        .send({
          customerName: 'Dana Scully',
          items: [{ productId: scanner.id, quantity: 1 }],
        })
        .expect(201);

      const dashRes = await request(app)
        .get('/api/dashboard')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(dashRes.body.dashboard.todayOrdersCount).toBe(1);
      expect(dashRes.body.dashboard.todayRevenueCents).toBe(scanner.priceCents);
      expect(dashRes.body.dashboard.countsByStatus.Placed).toBe(1);
      expect(dashRes.body.dashboard.lowStockProducts.length).toBeGreaterThanOrEqual(1);

      const csvRes = await request(app)
        .get('/api/orders/export.csv')
        .set('Cookie', adminAuth.cookie)
        .expect(200);
      expect(csvRes.headers['content-type']).toContain('text/csv');
      expect(csvRes.text).toContain('Reference,Status,Customer Name');
      expect(csvRes.text).toContain('ORD-1001');
      expect(csvRes.text).toContain('Dana Scully');
    });
  });
});
