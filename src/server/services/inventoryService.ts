import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from '../db/connection.js';
import type { OrderStatus, Product } from '../types.js';
import { AppError, type ActorInfo } from './orderService.js';

export const LOW_STOCK_THRESHOLD = 3;

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  price_cents: number;
  stock: number;
  created_at: string;
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

export function createProduct(
  db: DatabaseSync,
  input: {
    sku: string;
    name: string;
    category?: string;
    priceCents: number;
    stock: number;
  },
  actor?: ActorInfo
): Product {
  return withTransaction(db, () => {
    const existing = db
      .prepare('SELECT id FROM products WHERE UPPER(sku) = UPPER(?)')
      .get(input.sku.trim()) as { id: number } | undefined;

    if (existing) {
      throw new AppError(409, 'DUPLICATE_SKU', `Product with SKU "${input.sku}" already exists.`);
    }

    const row = db
      .prepare(
        `INSERT INTO products (sku, name, category, price_cents, stock)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, sku, name, category, price_cents, stock, created_at`
      )
      .get(
        input.sku.trim(),
        input.name.trim(),
        input.category?.trim() || 'General',
        input.priceCents,
        input.stock
      ) as unknown as ProductRow;

    if (input.stock > 0) {
      db.prepare(
        `INSERT INTO stock_movements (product_id, delta, reason, order_id, actor_user_id)
         VALUES (?, ?, 'INITIAL_STOCK', NULL, ?)`
      ).run(row.id, input.stock, actor?.id ?? null);
    }

    return mapProduct(row);
  });
}

export function updateProduct(
  db: DatabaseSync,
  productId: number,
  input: { name?: string; category?: string; priceCents?: number }
): Product {
  return withTransaction(db, () => {
    const existing = db
      .prepare(
        'SELECT id, sku, name, category, price_cents, stock, created_at FROM products WHERE id = ?'
      )
      .get(productId) as ProductRow | undefined;

    if (!existing) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product #${productId} was not found.`);
    }

    const updated = db
      .prepare(
        `UPDATE products
         SET name = ?, category = ?, price_cents = ?
         WHERE id = ?
         RETURNING id, sku, name, category, price_cents, stock, created_at`
      )
      .get(
        input.name?.trim() ?? existing.name,
        input.category?.trim() ?? existing.category,
        input.priceCents ?? existing.price_cents,
        productId
      ) as unknown as ProductRow;

    return mapProduct(updated);
  });
}

export function adjustProductStock(
  db: DatabaseSync,
  productId: number,
  delta: number,
  reason: string,
  actor?: ActorInfo
): Product {
  return withTransaction(db, () => {
    const existing = db
      .prepare(
        'SELECT id, sku, name, category, price_cents, stock, created_at FROM products WHERE id = ?'
      )
      .get(productId) as ProductRow | undefined;

    if (!existing) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product #${productId} was not found.`);
    }

    if (existing.stock + delta < 0) {
      throw new AppError(
        409,
        'INSUFFICIENT_STOCK',
        `Cannot reduce stock for ${existing.name} by ${Math.abs(delta)} (current stock: ${existing.stock}).`
      );
    }

    const updated = db
      .prepare(
        `UPDATE products
         SET stock = stock + ?
         WHERE id = ? AND stock + ? >= 0
         RETURNING id, sku, name, category, price_cents, stock, created_at`
      )
      .get(delta, productId, delta) as unknown as ProductRow | undefined;

    if (!updated) {
      throw new AppError(
        409,
        'INSUFFICIENT_STOCK',
        'Stock adjustment failed due to concurrent update.'
      );
    }

    db.prepare(
      `INSERT INTO stock_movements (product_id, delta, reason, order_id, actor_user_id)
       VALUES (?, ?, ?, NULL, ?)`
    ).run(productId, delta, reason.trim(), actor?.id ?? null);

    return mapProduct(updated);
  });
}

export interface DashboardSummary {
  todayOrdersCount: number;
  todayRevenueCents: number;
  totalOrdersCount: number;
  totalRevenueCents: number;
  countsByStatus: Record<OrderStatus, number>;
  lowStockThreshold: number;
  lowStockProducts: Product[];
  storeTimezone: string;
}

function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getDashboardSummary(db: DatabaseSync, storeTimezone = 'UTC'): DashboardSummary {
  const todayLocal = formatDateInTimezone(new Date(), storeTimezone);

  // Fetch recent orders (last 48h UTC covers any timezone's "today") and filter by storeTimezone
  const cutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const recentRows = db
    .prepare(
      `SELECT status, total_cents, created_at
       FROM orders
       WHERE created_at >= ?`
    )
    .all(cutoffIso) as Array<{ status: OrderStatus; total_cents: number; created_at: string }>;

  let todayOrdersCount = 0;
  let todayRevenueCents = 0;
  for (const r of recentRows) {
    if (formatDateInTimezone(new Date(r.created_at), storeTimezone) === todayLocal) {
      todayOrdersCount++;
      if (r.status !== 'Cancelled') {
        todayRevenueCents += r.total_cents;
      }
    }
  }

  const totalRow = db
    .prepare(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total_cents ELSE 0 END), 0) AS revenue
       FROM orders`
    )
    .get() as { count: number; revenue: number };

  const statusRows = db
    .prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status')
    .all() as Array<{ status: OrderStatus; count: number }>;

  const countsByStatus: Record<OrderStatus, number> = {
    Placed: 0,
    Packed: 0,
    Shipped: 0,
    Cancelled: 0,
  };
  for (const row of statusRows) {
    countsByStatus[row.status] = row.count;
  }

  const lowStockRows = db
    .prepare(
      `SELECT id, sku, name, category, price_cents, stock, created_at
       FROM products
       WHERE stock <= ?
       ORDER BY stock ASC, id ASC`
    )
    .all(LOW_STOCK_THRESHOLD) as unknown as ProductRow[];

  return {
    todayOrdersCount,
    todayRevenueCents,
    totalOrdersCount: totalRow.count,
    totalRevenueCents: totalRow.revenue,
    countsByStatus,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
    lowStockProducts: lowStockRows.map(mapProduct),
    storeTimezone,
  };
}
