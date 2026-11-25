import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../db/connection.js';
import { MAX_ITEM_QUANTITY } from '../validation.js';
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  type CreateOrderInput,
  type Order,
  type OrderEvent,
  type OrderItem,
  type OrderStatus,
  type Product,
  type StockMovement,
} from '../types.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ActorInfo {
  id: number;
  username: string;
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  stock: number;
  created_at: string;
}

interface OrderRow {
  id: number;
  reference: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  status: OrderStatus;
  version: number;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
}

interface OrderEventRow {
  id: number;
  order_id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_user_id: number | null;
  actor_username: string | null;
  reason: string | null;
  created_at: string;
}

interface StockMovementRow {
  id: number;
  product_id: number;
  delta: number;
  reason: string;
  order_id: number | null;
  actor_user_id: number | null;
  created_at: string;
}

interface IdempotencyRow {
  request_hash: string;
  response_status: number;
  response_body: string;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    priceCents: row.price_cents,
    stock: row.stock,
    createdAt: row.created_at,
  };
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    sku: row.sku,
    productName: row.product_name,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    lineTotalCents: row.unit_price_cents * row.quantity,
  };
}

function mapOrderEvent(row: OrderEventRow): OrderEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

function mapStockMovement(row: StockMovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    delta: row.delta,
    reason: row.reason,
    orderId: row.order_id,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
  };
}

function mapOrder(row: OrderRow, items: OrderItem[], events: OrderEvent[]): Order {
  return {
    id: row.id,
    reference: row.reference,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    notes: row.notes,
    status: row.status,
    version: row.version,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    events,
  };
}

function computeOrderRequestHash(
  customerName: string | null,
  customerPhone: string | null,
  notes: string | null,
  mergedQuantities: Map<number, number>
): string {
  const canonical = {
    customerName,
    customerPhone,
    notes,
    items: Array.from(mergedQuantities.entries())
      .sort(([a], [b]) => a - b)
      .map(([productId, quantity]) => ({ productId, quantity })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function listProducts(db: DatabaseSync): Product[] {
  const rows = db
    .prepare(
      'SELECT id, sku, name, category, price_cents, stock, created_at FROM products ORDER BY id ASC'
    )
    .all() as unknown as ProductRow[];
  return rows.map(mapProduct);
}

export function listStockMovements(db: DatabaseSync, productId?: number): StockMovement[] {
  if (productId !== undefined) {
    const rows = db
      .prepare(
        `SELECT id, product_id, delta, reason, order_id, actor_user_id, created_at
         FROM stock_movements
         WHERE product_id = ?
         ORDER BY id DESC`
      )
      .all(productId) as unknown as StockMovementRow[];
    return rows.map(mapStockMovement);
  }
  const rows = db
    .prepare(
      `SELECT id, product_id, delta, reason, order_id, actor_user_id, created_at
       FROM stock_movements
       ORDER BY id DESC`
    )
    .all() as unknown as StockMovementRow[];
  return rows.map(mapStockMovement);
}

export interface ListOrdersFilters {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'totalCents' | 'reference' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ListOrdersResult {
  orders: Order[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const SORT_COLUMN_MAP: Record<NonNullable<ListOrdersFilters['sortBy']>, string> = {
  createdAt: 'created_at',
  totalCents: 'total_cents',
  reference: 'reference',
  status: 'status',
};

export function listOrders(db: DatabaseSync, filters: ListOrdersFilters = {}): ListOrdersResult {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status && filters.status !== 'All') {
    if (!ORDER_STATUSES.includes(filters.status as OrderStatus)) {
      throw new AppError(400, 'INVALID_STATUS_FILTER', `Invalid status filter: ${filters.status}`);
    }
    conditions.push('status = ?');
    params.push(filters.status);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      "(UPPER(reference) LIKE UPPER(?) OR UPPER(COALESCE(customer_name, '')) LIKE UPPER(?) OR COALESCE(customer_phone, '') LIKE ?)"
    );
    params.push(term, term, term);
  }

  if (filters.dateFrom) {
    conditions.push('created_at >= ?');
    params.push(`${filters.dateFrom}T00:00:00.000Z`);
  }

  if (filters.dateTo) {
    conditions.push('created_at <= ?');
    params.push(`${filters.dateTo}T23:59:59.999Z`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortCol = SORT_COLUMN_MAP[filters.sortBy ?? 'createdAt'];
  const sortDir = (filters.sortDir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM orders ${whereClause}`)
    .get(...params) as { total: number };
  const total = countRow.total;

  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * pageSize;

  const orderRows = db
    .prepare(
      `SELECT id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at
       FROM orders
       ${whereClause}
       ORDER BY ${sortCol} ${sortDir}, id ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as unknown as OrderRow[];

  if (orderRows.length === 0) {
    return {
      orders: [],
      pagination: { page, pageSize, total, totalPages },
    };
  }

  const placeholders = orderRows.map(() => '?').join(', ');
  const orderIds = orderRows.map((o) => o.id);

  const itemRows = db
    .prepare(
      `SELECT id, order_id, product_id, sku, product_name, unit_price_cents, quantity
       FROM order_items
       WHERE order_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...orderIds) as unknown as OrderItemRow[];

  const eventRows = db
    .prepare(
      `SELECT id, order_id, from_status, to_status, actor_user_id, actor_username, reason, created_at
       FROM order_events
       WHERE order_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...orderIds) as unknown as OrderEventRow[];

  const itemsByOrderId = new Map<number, OrderItem[]>();
  for (const row of itemRows) {
    const list = itemsByOrderId.get(row.order_id) ?? [];
    list.push(mapOrderItem(row));
    itemsByOrderId.set(row.order_id, list);
  }

  const eventsByOrderId = new Map<number, OrderEvent[]>();
  for (const row of eventRows) {
    const list = eventsByOrderId.get(row.order_id) ?? [];
    list.push(mapOrderEvent(row));
    eventsByOrderId.set(row.order_id, list);
  }

  return {
    orders: orderRows.map((order) =>
      mapOrder(order, itemsByOrderId.get(order.id) ?? [], eventsByOrderId.get(order.id) ?? [])
    ),
    pagination: { page, pageSize, total, totalPages },
  };
}

export function getOrderById(db: DatabaseSync, orderId: number): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new AppError(400, 'INVALID_ORDER_ID', 'Order ID must be a positive integer.');
  }

  const orderRow = db
    .prepare(
      `SELECT id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at
       FROM orders
       WHERE id = ?`
    )
    .get(orderId) as OrderRow | undefined;

  if (!orderRow) {
    throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} was not found.`);
  }

  const itemRows = db
    .prepare(
      `SELECT id, order_id, product_id, sku, product_name, unit_price_cents, quantity
       FROM order_items
       WHERE order_id = ?
       ORDER BY id ASC`
    )
    .all(orderId) as unknown as OrderItemRow[];

  const eventRows = db
    .prepare(
      `SELECT id, order_id, from_status, to_status, actor_user_id, actor_username, reason, created_at
       FROM order_events
       WHERE order_id = ?
       ORDER BY id ASC`
    )
    .all(orderId) as unknown as OrderEventRow[];

  return mapOrder(orderRow, itemRows.map(mapOrderItem), eventRows.map(mapOrderEvent));
}

export function createOrder(
  db: DatabaseSync,
  input: CreateOrderInput,
  idempotencyKey?: string,
  actor?: ActorInfo
): { order: Order; replayed: boolean } {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError(400, 'EMPTY_ORDER', 'An order must contain at least one product.');
  }

  const mergedQuantities = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      throw new AppError(
        400,
        'INVALID_PRODUCT_ID',
        'Each item must have a valid positive productId.'
      );
    }
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_ITEM_QUANTITY
    ) {
      throw new AppError(
        400,
        'INVALID_QUANTITY',
        `Each item quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}.`
      );
    }
    const nextQty = (mergedQuantities.get(item.productId) ?? 0) + item.quantity;
    if (nextQty > MAX_ITEM_QUANTITY) {
      throw new AppError(
        400,
        'INVALID_QUANTITY',
        `Combined quantity for product #${item.productId} cannot exceed ${MAX_ITEM_QUANTITY}.`
      );
    }
    mergedQuantities.set(item.productId, nextQty);
  }

  const customerName = input.customerName?.trim() || null;
  const customerPhone = input.customerPhone?.trim() || null;
  const notes = input.notes?.trim() || null;
  const productIds = Array.from(mergedQuantities.keys()).sort((a, b) => a - b);
  const requestHash = idempotencyKey
    ? computeOrderRequestHash(customerName, customerPhone, notes, mergedQuantities)
    : null;
  const actorUserId = actor?.id ?? 0;

  return withTransaction(db, () => {
    if (idempotencyKey && requestHash) {
      db.prepare(
        "DELETE FROM idempotency_keys WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
      ).run();

      const existingIdem = db
        .prepare(
          'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE user_id = ? AND key = ?'
        )
        .get(actorUserId, idempotencyKey) as IdempotencyRow | undefined;

      if (existingIdem) {
        if (existingIdem.request_hash !== requestHash) {
          throw new AppError(
            422,
            'IDEMPOTENCY_KEY_CONFLICT',
            'Idempotency-Key was already used with a different order payload.'
          );
        }
        const parsed = JSON.parse(existingIdem.response_body) as { order: Order };
        return { order: parsed.order, replayed: true };
      }
    }

    const placeholders = productIds.map(() => '?').join(', ');
    const productRows = db
      .prepare(
        `SELECT id, sku, name, category, price_cents, stock, created_at
         FROM products
         WHERE id IN (${placeholders})
         ORDER BY id ASC`
      )
      .all(...productIds) as unknown as ProductRow[];

    const productsById = new Map(productRows.map((p) => [p.id, p]));

    for (const productId of productIds) {
      if (!productsById.has(productId)) {
        throw new AppError(400, 'PRODUCT_NOT_FOUND', `Product #${productId} does not exist.`);
      }
    }

    const shortages: Array<{
      productId: number;
      name: string;
      sku: string;
      requested: number;
      available: number;
    }> = [];

    for (const productId of productIds) {
      const product = productsById.get(productId)!;
      const requested = mergedQuantities.get(productId)!;
      if (product.stock < requested) {
        shortages.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          requested,
          available: product.stock,
        });
      }
    }

    if (shortages.length > 0) {
      const summary = shortages
        .map((s) => `${s.name} (requested ${s.requested}, available ${s.available})`)
        .join('; ');
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for: ${summary}`, {
        shortages,
      });
    }

    let totalCents = 0;
    const deductStmt = db.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?'
    );

    for (const productId of productIds) {
      const product = productsById.get(productId)!;
      const qty = mergedQuantities.get(productId)!;
      const lineTotal = product.price_cents * qty;
      totalCents += lineTotal;

      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalCents)) {
        throw new AppError(400, 'INVALID_TOTAL', 'Order total exceeds safe integer limits.');
      }

      const result = deductStmt.run(qty, productId, qty);
      if (result.changes !== 1) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${product.name}.`);
      }
    }

    const seqRow = db
      .prepare(
        'UPDATE order_seq SET next_val = next_val + 1 WHERE id = 1 RETURNING next_val - 1 AS seq'
      )
      .get() as { seq: number };
    const reference = `ORD-${seqRow.seq}`;

    const orderRow = db
      .prepare(
        `INSERT INTO orders (reference, customer_name, customer_phone, notes, status, version, total_cents)
         VALUES (?, ?, ?, ?, 'Placed', 1, ?)
         RETURNING id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at`
      )
      .get(reference, customerName, customerPhone, notes, totalCents) as unknown as OrderRow;

    const insertItemStmt = db.prepare(
      `INSERT INTO order_items (order_id, product_id, sku, product_name, unit_price_cents, quantity)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, order_id, product_id, sku, product_name, unit_price_cents, quantity`
    );

    const insertMovementStmt = db.prepare(
      `INSERT INTO stock_movements (product_id, delta, reason, order_id, actor_user_id)
       VALUES (?, ?, 'ORDER_PLACED', ?, ?)`
    );

    const createdItems: OrderItem[] = [];
    for (const productId of productIds) {
      const product = productsById.get(productId)!;
      const qty = mergedQuantities.get(productId)!;
      const itemRow = insertItemStmt.get(
        orderRow.id,
        product.id,
        product.sku,
        product.name,
        product.price_cents,
        qty
      ) as unknown as OrderItemRow;
      createdItems.push(mapOrderItem(itemRow));

      insertMovementStmt.run(product.id, -qty, orderRow.id, actor?.id ?? null);
    }

    const eventRow = db
      .prepare(
        `INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, actor_username, reason)
         VALUES (?, NULL, 'Placed', ?, ?, 'Order placed')
         RETURNING id, order_id, from_status, to_status, actor_user_id, actor_username, reason, created_at`
      )
      .get(orderRow.id, actor?.id ?? null, actor?.username ?? null) as unknown as OrderEventRow;

    const order = mapOrder(orderRow, createdItems, [mapOrderEvent(eventRow)]);

    if (idempotencyKey && requestHash) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO idempotency_keys (user_id, key, request_hash, response_status, response_body, expires_at)
         VALUES (?, ?, ?, 201, ?, ?)`
      ).run(actorUserId, idempotencyKey, requestHash, JSON.stringify({ order }), expiresAt);
    }

    return { order, replayed: false };
  });
}

export function transitionOrderStatus(
  db: DatabaseSync,
  orderId: number,
  targetStatus: OrderStatus,
  actor?: ActorInfo,
  reason?: string,
  expectedVersion?: number
): Order {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new AppError(400, 'INVALID_ORDER_ID', 'Order ID must be a positive integer.');
  }

  if (!ORDER_STATUSES.includes(targetStatus)) {
    throw new AppError(
      400,
      'INVALID_STATUS',
      `Status must be one of: ${ORDER_STATUSES.join(', ')}.`
    );
  }

  return withTransaction(db, () => {
    const existing = db
      .prepare(
        `SELECT id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at
         FROM orders
         WHERE id = ?`
      )
      .get(orderId) as OrderRow | undefined;

    if (!existing) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} was not found.`);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new AppError(
        409,
        'OPTIMISTIC_LOCK_CONFLICT',
        `Order ${existing.reference} was modified by another staff member (expected version ${expectedVersion}, current version ${existing.version}). Refresh and try again.`,
        {
          expectedVersion,
          currentVersion: existing.version,
        }
      );
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status];
    if (!allowed.includes(targetStatus)) {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition order ${existing.reference} from ${existing.status} to ${targetStatus}.`,
        {
          currentStatus: existing.status,
          requestedStatus: targetStatus,
          allowedNextStatuses: allowed,
        }
      );
    }

    const updatedOrder = db
      .prepare(
        `UPDATE orders
         SET status = ?, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND status = ? AND version = ?
         RETURNING id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at`
      )
      .get(targetStatus, orderId, existing.status, existing.version) as OrderRow | undefined;

    if (!updatedOrder) {
      throw new AppError(
        409,
        'OPTIMISTIC_LOCK_CONFLICT',
        'Order was modified concurrently. Refresh and try again.'
      );
    }

    db.prepare(
      `INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, actor_username, reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      existing.status,
      targetStatus,
      actor?.id ?? null,
      actor?.username ?? null,
      reason?.trim() || null
    );

    const itemRows = db
      .prepare(
        `SELECT id, order_id, product_id, sku, product_name, unit_price_cents, quantity
         FROM order_items
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .all(orderId) as unknown as OrderItemRow[];

    if (targetStatus === 'Cancelled') {
      const restoreStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      const movementStmt = db.prepare(
        `INSERT INTO stock_movements (product_id, delta, reason, order_id, actor_user_id)
         VALUES (?, ?, 'ORDER_CANCELLED', ?, ?)`
      );
      for (const item of itemRows) {
        restoreStmt.run(item.quantity, item.product_id);
        movementStmt.run(item.product_id, item.quantity, orderId, actor?.id ?? null);
      }
    }

    const eventRows = db
      .prepare(
        `SELECT id, order_id, from_status, to_status, actor_user_id, actor_username, reason, created_at
         FROM order_events
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .all(orderId) as unknown as OrderEventRow[];

    return mapOrder(updatedOrder, itemRows.map(mapOrderItem), eventRows.map(mapOrderEvent));
  });
}

export function editPlacedOrder(
  db: DatabaseSync,
  orderId: number,
  input: CreateOrderInput & { expectedVersion?: number },
  actor?: ActorInfo
): Order {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new AppError(400, 'EMPTY_ORDER', 'An order must contain at least one product.');
  }

  const newQuantities = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      throw new AppError(
        400,
        'INVALID_PRODUCT_ID',
        'Each item must have a valid positive productId.'
      );
    }
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_ITEM_QUANTITY
    ) {
      throw new AppError(
        400,
        'INVALID_QUANTITY',
        `Each item quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}.`
      );
    }
    const nextQty = (newQuantities.get(item.productId) ?? 0) + item.quantity;
    if (nextQty > MAX_ITEM_QUANTITY) {
      throw new AppError(
        400,
        'INVALID_QUANTITY',
        `Combined quantity for product #${item.productId} cannot exceed ${MAX_ITEM_QUANTITY}.`
      );
    }
    newQuantities.set(item.productId, nextQty);
  }

  return withTransaction(db, () => {
    const existing = db
      .prepare(
        `SELECT id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at
         FROM orders
         WHERE id = ?`
      )
      .get(orderId) as OrderRow | undefined;

    if (!existing) {
      throw new AppError(404, 'ORDER_NOT_FOUND', `Order #${orderId} was not found.`);
    }

    if (existing.status !== 'Placed') {
      throw new AppError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only Placed orders can be edited (current status: ${existing.status}).`
      );
    }

    if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      throw new AppError(
        409,
        'OPTIMISTIC_LOCK_CONFLICT',
        `Order ${existing.reference} was modified by another staff member. Refresh and try again.`,
        { expectedVersion: input.expectedVersion, currentVersion: existing.version }
      );
    }

    const oldItems = db
      .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
      .all(orderId) as Array<{ product_id: number; quantity: number }>;

    const oldQuantities = new Map<number, number>();
    for (const row of oldItems) {
      oldQuantities.set(row.product_id, row.quantity);
    }

    const allProductIds = Array.from(
      new Set([...oldQuantities.keys(), ...newQuantities.keys()])
    ).sort((a, b) => a - b);

    const placeholders = allProductIds.map(() => '?').join(', ');
    const productRows = db
      .prepare(
        `SELECT id, sku, name, category, price_cents, stock, created_at
         FROM products
         WHERE id IN (${placeholders})
         ORDER BY id ASC`
      )
      .all(...allProductIds) as unknown as ProductRow[];
    const productsById = new Map(productRows.map((p) => [p.id, p]));

    for (const pid of newQuantities.keys()) {
      if (!productsById.has(pid)) {
        throw new AppError(400, 'PRODUCT_NOT_FOUND', `Product #${pid} does not exist.`);
      }
    }

    // Check stock for any net increases
    const shortages: Array<{
      productId: number;
      name: string;
      sku: string;
      requested: number;
      available: number;
    }> = [];

    for (const pid of allProductIds) {
      const oldQty = oldQuantities.get(pid) ?? 0;
      const newQty = newQuantities.get(pid) ?? 0;
      const deltaNeeded = newQty - oldQty;
      if (deltaNeeded > 0) {
        const product = productsById.get(pid)!;
        if (product.stock < deltaNeeded) {
          shortages.push({
            productId: product.id,
            name: product.name,
            sku: product.sku,
            requested: deltaNeeded,
            available: product.stock,
          });
        }
      }
    }

    if (shortages.length > 0) {
      const summary = shortages
        .map((s) => `${s.name} (additional ${s.requested}, available ${s.available})`)
        .join('; ');
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for: ${summary}`, {
        shortages,
      });
    }

    // Reconcile stock & record stock_movements
    const updateStockStmt = db.prepare(
      'UPDATE products SET stock = stock - ? WHERE id = ? AND stock - ? >= 0'
    );
    const movementStmt = db.prepare(
      `INSERT INTO stock_movements (product_id, delta, reason, order_id, actor_user_id)
       VALUES (?, ?, 'ORDER_EDITED', ?, ?)`
    );

    for (const pid of allProductIds) {
      const oldQty = oldQuantities.get(pid) ?? 0;
      const newQty = newQuantities.get(pid) ?? 0;
      const deltaNeeded = newQty - oldQty;
      if (deltaNeeded !== 0) {
        const res = updateStockStmt.run(deltaNeeded, pid, deltaNeeded);
        if (res.changes !== 1) {
          throw new AppError(409, 'INSUFFICIENT_STOCK', 'Stock reconciliation failed.');
        }
        movementStmt.run(pid, -deltaNeeded, orderId, actor?.id ?? null);
      }
    }

    // Replace order items & compute new total
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
    const insertItemStmt = db.prepare(
      `INSERT INTO order_items (order_id, product_id, sku, product_name, unit_price_cents, quantity)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, order_id, product_id, sku, product_name, unit_price_cents, quantity`
    );

    let totalCents = 0;
    const updatedItems: OrderItem[] = [];
    for (const pid of Array.from(newQuantities.keys()).sort((a, b) => a - b)) {
      const product = productsById.get(pid)!;
      const qty = newQuantities.get(pid)!;
      const lineTotal = product.price_cents * qty;
      totalCents += lineTotal;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalCents)) {
        throw new AppError(400, 'INVALID_TOTAL', 'Order total exceeds safe integer limits.');
      }
      const row = insertItemStmt.get(
        orderId,
        product.id,
        product.sku,
        product.name,
        product.price_cents,
        qty
      ) as unknown as OrderItemRow;
      updatedItems.push(mapOrderItem(row));
    }

    const updatedOrder = db
      .prepare(
        `UPDATE orders
         SET customer_name = ?, customer_phone = ?, notes = ?, total_cents = ?,
             version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND status = 'Placed' AND version = ?
         RETURNING id, reference, customer_name, customer_phone, notes, status, version, total_cents, created_at, updated_at`
      )
      .get(
        input.customerName?.trim() || null,
        input.customerPhone?.trim() || null,
        input.notes?.trim() || null,
        totalCents,
        orderId,
        existing.version
      ) as OrderRow | undefined;

    if (!updatedOrder) {
      throw new AppError(409, 'OPTIMISTIC_LOCK_CONFLICT', 'Order was modified concurrently.');
    }

    db.prepare(
      `INSERT INTO order_events (order_id, from_status, to_status, actor_user_id, actor_username, reason)
       VALUES (?, 'Placed', 'Placed', ?, ?, 'Order edited')`
    ).run(orderId, actor?.id ?? null, actor?.username ?? null);

    const eventRows = db
      .prepare(
        `SELECT id, order_id, from_status, to_status, actor_user_id, actor_username, reason, created_at
         FROM order_events
         WHERE order_id = ?
         ORDER BY id ASC`
      )
      .all(orderId) as unknown as OrderEventRow[];

    return mapOrder(updatedOrder, updatedItems, eventRows.map(mapOrderEvent));
  });
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function ordersToCsv(orders: Order[]): string {
  const header = [
    'Reference',
    'Status',
    'Customer Name',
    'Customer Phone',
    'Items',
    'Total ($)',
    'Created At',
    'Notes',
  ].join(',');

  const rows = orders.map((order) => {
    const itemsSummary = order.items.map((i) => `${i.quantity}x ${i.sku}`).join('; ');
    return [
      escapeCsvCell(order.reference),
      escapeCsvCell(order.status),
      escapeCsvCell(order.customerName),
      escapeCsvCell(order.customerPhone),
      escapeCsvCell(itemsSummary),
      escapeCsvCell((order.totalCents / 100).toFixed(2)),
      escapeCsvCell(order.createdAt),
      escapeCsvCell(order.notes),
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
}

export function listAllOrdersForExport(
  db: DatabaseSync,
  filters: Omit<ListOrdersFilters, 'page' | 'pageSize'> = {}
): Order[] {
  const all: Order[] = [];
  let page = 1;
  while (true) {
    const res = listOrders(db, { ...filters, page, pageSize: 100 });
    all.push(...res.orders);
    if (page >= res.pagination.totalPages || res.orders.length === 0) {
      break;
    }
    page++;
  }
  return all;
}
