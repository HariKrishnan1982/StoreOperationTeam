import type { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import type { UserRole } from '../types.js';
import { createDatabase, withTransaction } from './connection.js';
import { ensureSchema } from './migrate.js';

export interface SeedProduct {
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
}

export interface SeedUser {
  username: string;
  displayName: string;
  password: string;
  role: UserRole;
}

export const DEMO_USERS: SeedUser[] = [
  {
    username: 'admin',
    displayName: 'Store Admin',
    password: 'AdminPass123!',
    role: 'Admin',
  },
  {
    username: 'operator',
    displayName: 'Phone Operator',
    password: 'OperatorPass123!',
    role: 'Operator',
  },
  {
    username: 'warehouse',
    displayName: 'Warehouse Staff',
    password: 'WarehousePass123!',
    role: 'Warehouse',
  },
];

export const SYNTHETIC_CATALOGUE: SeedProduct[] = [
  {
    sku: 'SKU-101',
    name: 'Wireless Barcode Scanner',
    category: 'Hardware',
    priceCents: 8900,
    stock: 5,
  },
  {
    sku: 'SKU-102',
    name: 'Thermal Receipt Printer',
    category: 'Hardware',
    priceCents: 14500,
    stock: 0, // Out-of-stock item
  },
  {
    sku: 'SKU-103',
    name: 'USB-C Label Maker',
    category: 'Hardware',
    priceCents: 6450,
    stock: 12,
  },
  {
    sku: 'SKU-104',
    name: 'Heavy-Duty Packing Tape (6-Pack)',
    category: 'Supplies',
    priceCents: 1800,
    stock: 24,
  },
  {
    sku: 'SKU-105',
    name: 'Corrugated Shipping Boxes (25-Pack)',
    category: 'Packaging',
    priceCents: 3250,
    stock: 8,
  },
  {
    sku: 'SKU-106',
    name: 'Anti-Static Bubble Wrap Roll',
    category: 'Packaging',
    priceCents: 2200,
    stock: 15,
  },
  {
    sku: 'SKU-107',
    name: 'Digital Postal Scale (50kg)',
    category: 'Hardware',
    priceCents: 5400,
    stock: 3,
  },
];

function nextOrderReference(db: DatabaseSync): string {
  const row = db
    .prepare(
      'UPDATE order_seq SET next_val = next_val + 1 WHERE id = 1 RETURNING next_val - 1 AS seq'
    )
    .get() as { seq: number };
  return `ORD-${row.seq}`;
}

export function seedDatabase(
  db: DatabaseSync,
  options: { reset?: boolean; includeSampleOrders?: boolean } = {}
): void {
  const { reset = false, includeSampleOrders = true } = options;

  ensureSchema(db);

  withTransaction(db, () => {
    if (reset) {
      db.exec(`
        DELETE FROM sessions;
        DELETE FROM users;
        DELETE FROM idempotency_keys;
        DELETE FROM stock_movements;
        DELETE FROM order_events;
        DELETE FROM order_items;
        DELETE FROM orders;
        DELETE FROM products;
        DELETE FROM sqlite_sequence WHERE name IN ('users', 'stock_movements', 'order_events', 'order_items', 'orders', 'products');
        UPDATE order_seq SET next_val = 1001 WHERE id = 1;
      `);
    }

    // Seed demo users if users table is empty
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (userCount.count === 0) {
      const rounds = process.env.NODE_ENV === 'test' || process.env.VITEST ? 4 : 10;
      const insertUser = db.prepare(
        `INSERT INTO users (username, display_name, password_hash, role)
         VALUES (?, ?, ?, ?)`
      );
      for (const u of DEMO_USERS) {
        insertUser.run(u.username, u.displayName, bcrypt.hashSync(u.password, rounds), u.role);
      }
    }

    const countRow = db.prepare('SELECT COUNT(*) AS count FROM products').get() as {
      count: number;
    };
    if (countRow.count > 0) {
      return;
    }

    const insertProduct = db.prepare(
      `INSERT INTO products (sku, name, category, price_cents, stock)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const item of SYNTHETIC_CATALOGUE) {
      insertProduct.run(item.sku, item.name, item.category, item.priceCents, item.stock);
    }

    if (includeSampleOrders) {
      const getProduct = db.prepare(
        'SELECT id, sku, name, price_cents FROM products WHERE sku = ?'
      );
      const tape = getProduct.get('SKU-104') as
        { id: number; sku: string; name: string; price_cents: number } | undefined;
      const box = getProduct.get('SKU-105') as
        { id: number; sku: string; name: string; price_cents: number } | undefined;
      const label = getProduct.get('SKU-103') as
        { id: number; sku: string; name: string; price_cents: number } | undefined;

      if (tape && box && label) {
        const insertOrder = db.prepare(
          `INSERT INTO orders (reference, customer_name, customer_phone, notes, status, total_cents)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
        );
        const insertItem = db.prepare(
          `INSERT INTO order_items (order_id, product_id, sku, product_name, unit_price_cents, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`
        );

        const ord1 = insertOrder.get(
          nextOrderReference(db),
          'Maya Lin',
          '555-0142',
          'Leave at loading bay',
          'Packed',
          tape.price_cents * 2 + box.price_cents * 1
        ) as { id: number };
        insertItem.run(ord1.id, tape.id, tape.sku, tape.name, tape.price_cents, 2);
        insertItem.run(ord1.id, box.id, box.sku, box.name, box.price_cents, 1);

        const insertEvent = db.prepare(
          `INSERT INTO order_events (order_id, from_status, to_status, actor_username, reason)
           VALUES (?, ?, ?, ?, ?)`
        );
        insertEvent.run(ord1.id, null, 'Placed', 'operator', 'Phone order created');
        insertEvent.run(ord1.id, 'Placed', 'Packed', 'warehouse', 'Packed for dispatch');

        const ord2 = insertOrder.get(
          nextOrderReference(db),
          'Devon Brooks',
          '555-0198',
          'Call before courier dispatch',
          'Placed',
          label.price_cents * 1
        ) as { id: number };
        insertItem.run(ord2.id, label.id, label.sku, label.name, label.price_cents, 1);
        insertEvent.run(ord2.id, null, 'Placed', 'operator', 'Phone order created');
      }
    }
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop() || '');

if (isMain) {
  const reset = process.argv.includes('--reset');
  const db = createDatabase();
  try {
    seedDatabase(db, { reset });
    console.log(reset ? 'SQLite database reset and seeded.' : 'SQLite database seeded (if empty).');
  } finally {
    db.close();
  }
}
