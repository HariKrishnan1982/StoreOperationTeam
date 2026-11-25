# Project Progress & Architecture Summary — Store Ops Console

## 1. Overview
This project is a full-stack, browser-based **Store Operations Console** built for staff who take phone orders and manage warehouse fulfilment. It replaces ad-hoc spreadsheets with a single web interface backed by a transactional SQLite database (`node:sqlite`), ensuring stock levels, order states, and totals remain consistent across the UI, API, and persisted storage.

All core requirements, Phases 1–6, automated test suites (Vitest API, React Testing Library UI, Playwright E2E), production build, and CI/Docker tooling have been completed.

### Phase-by-Phase Summary
- **Core Foundation:** Seeded 7-item catalogue (`SKU-101` at 5 units, `SKU-102` at 0 units), atomic `BEGIN IMMEDIATE` stock deduction, `Placed → Packed → Shipped / Cancelled` state machine, search/filter, and SQLite persistence.
- **Phase 1 (Hardening & Correctness):** Zod validation, unified `{ error: { code, message, details? } }` responses, `Idempotency-Key` deduplication, 10x concurrency tests, integer-cent math, `helmet`, rate limiting, `32kb` body limit, and strict CORS.
- **Phase 2 (Auth & Roles):** `bcryptjs` password hashing, `httpOnly` session cookies, `Admin` / `Operator` / `Warehouse` RBAC, `X-CSRF-Token` validation, login throttling, logout, and seeded demo users.
- **Phase 3 (Audit Trail & Locking):** `schema_version` migrations, `order_events` timeline, mandatory cancellation reason, `stock_movements` ledger, and `orders.version` optimistic locking.
- **Phase 4 (Staff Features):** Admin inventory management, server-side pagination/sorting/date-range/customer lookup, `Placed` order editing, operations dashboard with low-stock alerts, CSV export, and printable packing slips.
- **Phase 5 (Frontend Quality):** Loading skeletons, floating toast region, accessible `ConfirmDialog` for `Ship` & `Cancel`, inline validation, WCAG AA contrast, tablet responsiveness, React Testing Library tests, and Playwright E2E tests.
- **Phase 6 (Operations & Delivery):** `pino` structured logging with `X-Request-Id` and PII/secret redaction, Zod env config, `npm run db:backup` + restore test, `Dockerfile` (non-root `node`) + `docker-compose.yml`, GitHub Actions CI, ESLint, and Prettier.
- **Phase 7 (Cleanup & Gaps):** Removed `pg`/`@types/pg`/`pool.ts`, fixed CSV 100-row truncation (tested with 255+ orders), added `TRUST_PROXY`, hourly `cleanupExpiredRecords`, `PackingSlipModal` focus-trap/Escape, `STORE_TIMEZONE`, and upgraded `vite` 8 / `vitest` 5 (`0` audit vulnerabilities).
- **Phase 8 (Multi-Page IA & UI/UX Redesign):** Grounded in `docs/DESIGN_PRINCIPLES.md`, `docs/DESIGN_DECISIONS.md`, `docs/IA.md`, and `docs/DESIGN.md`. Rebuilt the client with `react-router` v7 (`React.lazy` code-split routes), `AppShell`/`PublicLayout`, `RequireAuth`/`RequireRole` guards, 23 shared primitives (`src/client/components/`), 15 pages (`src/client/pages/`), Express SPA fallback, two Playwright critique rounds (`docs/DESIGN_REVIEW.md`), `@axe-core/playwright` WCAG 2.0 AA across all 15 routes (Light & Dark), and keyboard-only + guard E2E tests.
- **Phase 9 (Deployment Readiness):** CI Docker build + `/api/health` smoke test, `npm run db:create-admin`, `docs/DEPLOYMENT.md`, and `docs/DEMO_SCRIPT.md`.

---

## 2. Tech Stack
- **Runtime:** Node.js v26.13.1 LTS (TypeScript)
- **Backend:** Express (`src/server/`)
- **Database:** Built-in SQLite via `node:sqlite` (`DatabaseSync`, WAL mode, foreign keys enabled, persisted to `./data/store_ops.db`)
- **Frontend:** React 18 + Vite + Lucide icons (`src/client/`)
- **Testing:** Vitest + Supertest (`tests/orders.test.ts`)

---

## 3. What Has Been Built

### 3.1 Database Layer (`src/server/db/`)
- **`src/server/db/connection.ts`**
  - `createDatabase(dbPath?)`: Opens/creates the SQLite database file, enables `PRAGMA foreign_keys = ON`, `PRAGMA journal_mode = WAL`, and `PRAGMA busy_timeout = 5000`.
  - `withTransaction(db, fn)`: Wraps multi-step operations in `BEGIN IMMEDIATE ... COMMIT` with automatic `ROLLBACK` on error.
- **`src/server/db/migrate.ts`**
  - Versioned migrations (`runMigrations(db)`) tracked in `schema_version`:
    - `v1`: `order_seq`, `products`, `orders`, `order_items`, `idempotency_keys`, `users`, `sessions`.
    - `v2`: `orders.version` (optimistic locking), `order_events` (status audit timeline), `stock_movements` (inventory ledger).
- **`src/server/db/seed.ts`**
  - Seeds 7 synthetic products (`SYNTHETIC_CATALOGUE`), including:
    - `SKU-101` — Wireless Barcode Scanner (`$89.00`, stock `5`)
    - `SKU-102` — Thermal Receipt Printer (`$145.00`, stock `0` — out-of-stock item)
    - `SKU-103` — USB-C Label Maker (`$64.50`, stock `12`)
    - `SKU-104` — Heavy-Duty Packing Tape (6-Pack) (`$18.00`, stock `24`)
    - `SKU-105` — Corrugated Shipping Boxes (25-Pack) (`$32.50`, stock `8`)
    - `SKU-106` — Anti-Static Bubble Wrap Roll (`$22.00`, stock `15`)
    - `SKU-107` — Digital Postal Scale (50kg) (`$54.00`, stock `3`)
  - Also seeds 2 initial sample orders (`Packed` and `Placed`) when the database is empty or reset (`npm run db:reset`).

### 3.2 Backend API, Auth, Validation & Security (`src/server/`)
- **`src/server/services/authService.ts`**:
  - Password verification using `bcryptjs`, session creation (`sessions` table with 8-hour TTL and per-session `csrf_token`), and session lookup/deletion.
- **`src/server/validation.ts`**: Zod schemas for `orderIdParamSchema`, `listOrdersQuerySchema`, `createOrderBodySchema`, `transitionOrderBodySchema`, `idempotencyKeySchema`, and `loginBodySchema`.
- **`src/server/types.ts`**: Defines `UserRole` (`Admin`, `Operator`, `Warehouse`), `AuthUser`, `OrderStatus`, `Product`, `Order`, `OrderItem`, and `ALLOWED_TRANSITIONS`.
- **`src/server/services/inventoryService.ts`**:
  - `createProduct`, `updateProduct`, `adjustProductStock` (with mandatory reason + `stock_movements`), and `getDashboardSummary` (today's orders/revenue, status counts, low-stock items).
- **`src/server/services/orderService.ts`**:
  - `listProducts`, `listOrders` (customer name/phone/reference search, date-range filter, sorting, pagination), `getOrderById`, `createOrder` (atomic stock deduction + `Idempotency-Key`), `editPlacedOrder` (atomic stock reconciliation for `Placed` orders), `transitionOrderStatus` (state machine + once-only stock restoration + optimistic locking), and `ordersToCsv`.
- **`src/server/app.ts` & `src/server/index.ts`**:
  - Auth & RBAC endpoints: `POST /api/auth/login` (with dedicated `loginLimiter`), `GET /api/auth/me`, `POST /api/auth/logout`.
  - Inventory & Dashboard endpoints (Admin-protected writes): `GET /api/dashboard`, `POST /api/products`, `PATCH /api/products/:id`, `POST /api/products/:id/adjust-stock`, `GET /api/stock-movements`.
  - Order endpoints: `GET /api/orders/export.csv`, `GET /api/orders`, `GET /api/orders/:id`, `POST /api/orders`, `PATCH /api/orders/:id`, `POST /api/orders/:id/status`.
  - Middleware: `requireAuth` (`401`), `requireCsrf` (`403` via `crypto.timingSafeEqual` on `X-CSRF-Token`), `requireRole` (`403`), `helmet()`, strict `cors()`, `/api` `express-rate-limit`, `express.json({ limit: '32kb' })`, and global unified error handler.

### 3.3 Frontend Console (`src/client/`)
- **`src/client/App.tsx`**, **`src/client/api.ts`**, **`src/client/styles.css`**, **`src/client/types.ts`**, **`src/client/components/`**:
  - **Create Order tab:** Displays the catalogue with live stock badges, quantity steppers, inline phone/notes validation, double-submit guards, and `Idempotency-Key` headers.
  - **Orders tab:** Search by reference, customer name, or phone; filter by status and date range; sort and paginate; export CSV; edit `Placed` orders; view status timeline; print packing slips (`PackingSlipModal.tsx`).
  - **Dashboard tab (`DashboardView.tsx`):** Today's orders, today's & total revenue, status breakdown, and low-stock alerts.
  - **Inventory tab (`InventoryView.tsx`):** Admin-only product creation, price editing, and stock adjustments with mandatory reason.
  - **UX & Accessibility (`ConfirmDialog.tsx`, `Skeleton.tsx`):** Loading skeletons, floating toast notifications (`role="status"` / `role="alert"`), accessible confirmation dialogs for `Ship` and `Cancel` (focus management, `Escape` to close), WCAG AA contrast, and tablet-responsive layout (`<= 1024px`).

### 3.4 Operations, Tooling & Delivery
- **Structured Logging & Config (`src/server/logger.ts`, `src/server/config.ts`):** Zod-validated environment configuration (`.env.example`) and `pino` / `pino-http` JSON logging with `X-Request-Id` on every request, plus `GET /api/health`.
- **Backup & Restore (`src/server/db/backup.ts`):** `npm run db:backup` creates consistent `VACUUM INTO` snapshots in `./backups/`, with restore steps documented in `README.md`.
- **Containers & CI (`Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`):** Multi-stage Node 24 Alpine Docker build, persistent volumes, healthcheck, and GitHub Actions CI (`lint`, `build`, `test`).
- **Code Quality (`eslint.config.js`, `.prettierrc`, `tsconfig*.json`):** TypeScript `strict: true`, ESLint (`@eslint/js`, `typescript-eslint`, `react-hooks`), and Prettier.

---

## 4. Verification & Test Status

### 4.1 Automated Integration & UI Tests (`npm test`)
Executed via `npm test` (Vitest + Supertest + React Testing Library) — **5 files, 42/42 passing**:
- `tests/orders.test.ts` (**21 passed**): Atomic placement, insufficient-stock rollback, once-only cancellation, invalid transitions, DB restart persistence, 10x concurrency, Zod validation, `Idempotency-Key`, merged duplicates, security/CORS/request-id, `401`/`403` RBAC, CSRF, `429` login throttle, `schema_version`, `order_events`/`stock_movements`, `409` optimistic lock, Admin inventory, customer lookup/pagination/sort/date-range, `Placed` order edit, dashboard & CSV.
- `tests/security.test.ts` (**7 passed**): CSV formula injection, XSS escaping, dynamic 17-route Authorization Matrix, session rotation/idle expiry/password change, per-user `Idempotency-Key` + `422` + expiry, `pino` log redaction, production demo-user startup guard.
- `tests/reliability.test.ts` (**3 passed**): Mid-suite DB restart migration idempotency (`v1`→`v3`), simultaneous edit vs status change `409` conflict, and 200-request load smoke test.
- `tests/ops.test.ts` (**7 passed**): Production `SESSION_SECRET` fail-fast, `VACUUM INTO` backup + retention + restore, 255-order CSV export without truncation, `TRUST_PROXY` IP rate limiting + general `429` + `413`, `cleanupExpiredRecords`, `STORE_TIMEZONE` dashboard, and `createOrResetAdmin`.
- `tests/App.ui.test.tsx` (**4 passed**): Order draft + inline phone validation, `Ship` / `Cancel` confirmation dialogs, `DashboardPage` + `Placed` order editing, and route/role guards.

### 4.2 Frontend UI & End-to-End Tests
- **React Testing Library (`tests/App.ui.test.tsx` — 4/4 passing):** Multi-page `MemoryRouter` tests for order intake, confirmation dialogs, order editing, and route/role guards.
- **Playwright E2E (`e2e/orders.spec.ts`, `e2e/guards-and-keyboard.spec.ts`, `e2e/a11y.spec.ts` — 5/5 passing):** Happy/cancel/inventory paths, role guard redirects, keyboard-only full order flow, and `@axe-core/playwright` WCAG 2.0 AA checks across all 15 routes in Light and Dark mode.

---

## 5. Available Scripts
- `npm run dev` — Run Express API (`3001`) and Vite dev server (`5173`) concurrently.
- `npm run build` — Build production client and server bundles.
- `npm start` — Start the production server on `http://localhost:3001`.
- `npm run db:migrate` — Ensure SQLite schema is created.
- `npm run db:seed` — Seed initial catalogue and sample orders (if empty).
- `npm run db:reset` — Wipe and re-seed `./data/store_ops.db`.
- `npm test` — Run all Vitest integration tests.
