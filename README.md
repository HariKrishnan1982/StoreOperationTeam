# Store Ops Console — Phone Order Intake & Fulfilment

A browser-based operations console for store staff taking orders over the phone. Built with **Node.js, TypeScript, Express, SQLite (`node:sqlite`), and React (Vite)**.

## Features

1. **Create Orders**
   - Displays a seeded product catalogue (7 products, including an out-of-stock item `SKU-102` at `0` units and `SKU-101` at `5` units) with live stock badges.
   - Add multiple products, adjust quantities, enter optional caller name/phone/notes, see live line totals and grand total, and submit.
2. **Find, Filter, Edit & Export Orders**
   - Search orders by reference (`ORD-1001`), customer name, or phone number; filter by status and date range; sort by date or total; paginate results (`page` / `pageSize`).
   - Edit `Placed` orders (`Admin` / `Operator`) to adjust item quantities with atomic stock reconciliation.
   - Detail view showing customer info, line items, quantities, unit prices, subtotals, total, status, full event timeline, and a **Print Packing Slip** view.
   - **Export CSV** (`GET /api/orders/export.csv`) for filtered order lists.
3. **Manage Fulfilment & Inventory**
   - Supports `Placed → Packed → Shipped`.
   - Orders can be cancelled from `Placed` or `Packed` only.
   - Skipped, backward, or repeated transitions are rejected by the server (`409 Conflict`).
   - **Dashboard** (`GET /api/dashboard`): Today's orders, today's & total revenue, status breakdown, and low-stock alerts (`≤ 3` units).
   - **Inventory Management** (`Admin` only): Add new products, edit prices, and adjust stock (`restock` / `shrinkage`) with a mandatory reason.
4. **Data Consistency, Hardening & Audit Trail**
   - All order placements run inside a `BEGIN IMMEDIATE` SQLite transaction with atomic conditional stock updates (`WHERE id = ? AND stock >= ?`).
   - If any item in a multi-item order lacks stock, the entire transaction rolls back and all stock remains unchanged.
   - Cancelling a `Placed` or `Packed` order requires a cancellation reason (≥ 3 chars) and restores stock **exactly once**; repeating cancellation is rejected and never double-restores stock.
   - Every order creation and status change writes an immutable `order_events` row (displayed as a timeline on the order detail view) and every stock change writes a `stock_movements` ledger row (`GET /api/stock-movements`).
   - Optimistic locking via an order `version` column (`expectedVersion`) returns `409 OPTIMISTIC_LOCK_CONFLICT` if two staff members act on the same order concurrently.
   - Versioned SQLite migrations tracked in `schema_version`.
   - Supports optional `Idempotency-Key` header on `POST /api/orders` (stored in `idempotency_keys` with request-hash verification) to prevent duplicate orders on retries or double-clicks.
   - Strict **Zod** validation on all request bodies, query params, and path params, returning unified `{ error: { code, message, details? } }` responses.
   - Security middleware: `helmet`, `/api` rate limiting (`express-rate-limit`), `32kb` JSON body limit, and strict CORS allowlist.
   - Data persists in `./data/store_ops.db` (WAL mode) across app restarts.

---

## Prerequisites

- **Node.js** 22.5+ (tested on Node.js v26.13.1 LTS — uses built-in `node:sqlite`, so no external database server is required).

---

## Demo Accounts (Synthetic Credentials)

The seed script creates one synthetic user per role (passwords hashed with `bcryptjs`, sessions stored in SQLite with `httpOnly` cookies and `X-CSRF-Token` protection):

| Role | Username | Password | Permissions |
| --- | --- | --- | --- |
| **Admin** | `admin` | `AdminPass123!` | Create orders, view orders, pack/ship/cancel |
| **Operator** | `operator` | `OperatorPass123!` | Create orders, view orders (read-only) |
| **Warehouse** | `warehouse` | `WarehousePass123!` | View orders, pack/ship/cancel |

---

## Setup & Database

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional):**
   Copy `.env.example` to `.env` to customize server port, database path, session secret, CORS origins, or log level:
   ```env
   NODE_ENV=development
   PORT=3001
   DB_PATH=./data/store_ops.db
   SESSION_SECRET=change-me-to-a-long-random-secret-at-least-32-chars
   CORS_ORIGINS=http://localhost:5173,http://localhost:3001
   LOG_LEVEL=info
   COOKIE_SECURE=false
   ALLOW_DEMO_USERS=false
   BACKUP_RETENTION=7
   ```
   *(In `production`, `SESSION_SECRET` must be at least 32 characters and non-default, and seeded demo users are blocked unless `ALLOW_DEMO_USERS=true`.)*

3. **Migrate & Seed the Database:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   *(The server also auto-seeds on first startup if the `products` table is empty.)*

   To reset all orders and restore the initial synthetic catalogue:
   ```bash
   npm run db:reset
   ```

---

## Running the App

### Development Mode (API + Vite HMR)
```bash
npm run dev
```
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### Production Build & Start
```bash
npm run build
npm start
```
Serves both the API and the built React UI on `http://localhost:3001`.

---

## Automated Tests

### Unit & Integration Tests (Vitest + Supertest + React Testing Library)
```bash
npm test
```

- **Backend API & DB (`tests/orders.test.ts` — 21 tests):** Atomic placement, insufficient-stock rollback, once-only cancellation, invalid state transitions, restart persistence, 10x concurrency, Zod validation, `Idempotency-Key`, integer-cent math, `helmet` + CORS, `401`/`403` RBAC, CSRF, login throttling, `schema_version` migrations, `order_events`, `stock_movements`, optimistic locking, Admin inventory management, customer lookup/pagination/sorting/date-range, `Placed` order editing, dashboard, and CSV export.
- **Frontend UI (`tests/App.ui.test.tsx` — 4 tests):** Order draft creation with inline phone validation, `Ship` / `Cancel` confirmation dialogs, `DashboardPage` + `Placed` order editing, and route/role guards.

### End-to-End Browser Tests (Playwright)
```bash
npm run build
npm run test:e2e
```
- **E2E (`e2e/orders.spec.ts`, `e2e/guards-and-keyboard.spec.ts`, `e2e/a11y.spec.ts` — 5 tests):**
  - Full happy path (`login → new order → pack → ship`), cancel path (`new order → cancel` with reason → stock restored), and Admin inventory add/adjust.
  - Route & role guards (`?next=` redirect, `Operator`/`Warehouse` → `/forbidden`).
  - Keyboard-only run-through (`create → pack → ship` and `create → cancel`).
  - `@axe-core/playwright` WCAG 2.0 AA accessibility audits across all 15 routes in both Light and Dark mode.

### Information Architecture & Design System ("Ledger & Label")
- Design principles, decisions, IA sitemap, design tokens, and two-round critique: [docs/DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md), [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md), [docs/IA.md](docs/IA.md), [docs/DESIGN.md](docs/DESIGN.md), [docs/DESIGN_REVIEW.md](docs/DESIGN_REVIEW.md)
- Multi-page screenshots (`1440px`, `1024px`, `768px`, and dark mode): `docs/screenshots/` (`r1-*.png`, `r2-*.png`)

| Client Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Product landing page, workflow overview, role breakdown, FAQ |
| `/login` | Public | Dedicated sign-in page with `?next=` return |
| `/forbidden`, `*` | Public | 403 access denied & 404 not found recovery pages |
| `/app` | Auth | Dashboard (today's KPIs, Placed queue, status counts, low-stock watch) |
| `/app/orders` | Auth | Orders list (status tabs, search, date range, sort, pagination, CSV) |
| `/app/orders/new` | Admin, Operator | Phone order intake with catalogue steppers & sticky summary |
| `/app/orders/:reference` | Auth | Order detail, primary next action, edit while Placed, timeline |
| `/app/orders/:reference/packing-slip` | Auth | Print-optimized packing slip without app chrome |
| `/app/inventory` | Auth (Admin edits) | Inventory table with low/out-of-stock emphasis |
| `/app/inventory/new`, `/app/inventory/:id` | Admin | Add/edit product, adjust stock with reason, product movement log |
| `/app/stock-movements` | Auth | Filterable stock movement audit log |
| `/app/account` | Auth | Profile, change password, session policy, Light/Dark preference |
| `/app/help` | Auth | Role cheat-sheet, status flow, keyboard shortcuts, support |

---

## Operations: Backup, Restore, Deployment, Docker & CI

### Deployment & Demo Script
- Production deployment guide (Fly.io / Render persistent volume, `TRUST_PROXY`, `COOKIE_SECURE=true`, `npm run db:create-admin`): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- 3-minute role-by-role demo walkthrough: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- Before/after UI screenshots: `docs/screenshots/`

### SQLite Backup & Restore
Create a consistent hot backup (using `VACUUM INTO`) into `./backups/`:
```bash
npm run db:backup
```
To restore from a backup file:
1. Stop the running server (`Ctrl+C` or `docker compose down`).
2. Remove the active WAL/SHM sidecar files if present (`data/store_ops.db-wal`, `data/store_ops.db-shm`).
3. Copy the chosen backup file over `./data/store_ops.db`:
   ```bash
   cp backups/store_ops-<timestamp>.db data/store_ops.db
   ```
4. Restart the server (`npm start` or `docker compose up -d`).

### Docker
```bash
docker compose up --build -d
```
Serves the console on `http://localhost:3001` with persistent `./data` and `./backups` volumes and a built-in `/api/health` healthcheck.

### Linting, Typecheck & Formatting
```bash
npm run lint
npm run typecheck
npm run format:check
```

### CI
GitHub Actions workflow at [ci.yml](.github/workflows/ci.yml) runs `npm ci`, `npm run lint`, `npm run build`, and `npm test` on push and pull requests.

---

## Walkthrough

1. **Create Order tab:** Browse the catalogue. Notice `Thermal Receipt Printer (SKU-102)` is marked **Out of Stock** and cannot be added. Add `2 × Wireless Barcode Scanner (SKU-101)` and `1 × Heavy-Duty Packing Tape (SKU-104)`, verify the live total, and click **Submit Order**.
2. **Confirmation & Stock Update:** A success banner appears with the generated reference (e.g. `ORD-1003`), and `SKU-101` stock drops immediately from `5` to `3`.
3. **Orders & Fulfilment tab:** Search by reference or filter by status (`Placed`, `Packed`, `Shipped`, `Cancelled`). Click an order to inspect its items, quantities, and total, then advance it (`Mark as Packed` → `Mark as Shipped`) or `Cancel Order` to restore stock.
