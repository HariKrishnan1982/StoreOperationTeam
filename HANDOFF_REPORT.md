# Handoff Report — Store Ops Console

## 1. PHASE STATUS

### Phase 1: Hardening and correctness
1. Concurrency tests: **DONE** — 10 simultaneous `POST /api/orders` against 5-unit `SKU-101` (`tests/orders.test.ts`).
2. Input validation (Zod): **DONE** — Bodies, query params, path params, and `Idempotency-Key` validated in `src/server/validation.ts` and `src/server/app.ts`; tested in `tests/orders.test.ts`.
3. Unified error format: **DONE** — Global Express error handler in `src/server/app.ts` returns `{ error: { code, message, details? } }`.
4. Idempotency: **DONE** — Per-user `Idempotency-Key` header backed by `idempotency_keys` (`(user_id, key)` PK, 24h `expires_at`, `422` on payload mismatch) in `src/server/services/orderService.ts`; tested in `tests/orders.test.ts` and `tests/security.test.ts`.
5. Money safety: **DONE** — Integer cents end-to-end (`priceCents`, `unitPriceCents`, `lineTotalCents`, `totalCents`) with `Number.isSafeInteger` checks and merged-duplicate tests in `tests/orders.test.ts`.
6. Security basics: **DONE** — `helmet`, `express-rate-limit` (with `TRUST_PROXY` support), `32kb` JSON body limit, strict CORS allowlist, and prepared SQL statements (`src/server/app.ts`, `tests/ops.test.ts`).

### Phase 2: Authentication and roles
1. Hashed passwords & session cookies: **DONE** — `bcryptjs` password hashes in `users` table and `httpOnly` (`SameSite=Lax`, `Secure` in production) cookie `store_ops_sid` in `sessions` table (`src/server/services/authService.ts`).
2. Roles (`Admin`, `Operator`, `Warehouse`): **DONE** — Server-side `requireRole(...)` in `src/server/app.ts` and role-based tab/button hiding in `src/client/App.tsx`.
3. CSRF protection, login throttling, logout, session lifecycle: **DONE** — `X-CSRF-Token` verified with `crypto.timingSafeEqual`, `loginLimiter` (`429`), session rotation on login, 30m idle / 8h absolute expiry, `POST /api/auth/change-password` invalidating other sessions, and `POST /api/auth/logout` (`tests/security.test.ts`).
4. Seed one demo user per role & production guard: **DONE** — `admin`, `operator`, `warehouse` seeded in `src/server/db/seed.ts`; `assertProductionSafety` refuses startup in production with default demo passwords unless `ALLOW_DEMO_USERS=true` (`tests/security.test.ts`).
5. 401/403 tests on every route: **DONE** — Dynamic authorization matrix test in `tests/security.test.ts` verifies all 17 registered `/api` routes across `Unauthenticated`, `Operator`, `Warehouse`, and `Admin`.

### Phase 3: Audit trail and data model improvements
1. `order_events` table: **DONE** — Written inside the same transaction on creation and every status change (`src/server/services/orderService.ts`).
2. Required cancellation reason & timeline UI: **DONE** — Zod `.superRefine` in `src/server/validation.ts` (`>= 3` chars) and Status Timeline in `src/client/App.tsx`.
3. `stock_movements` table: **DONE** — Written on `ORDER_PLACED`, `ORDER_CANCELLED`, `ORDER_EDITED`, `INITIAL_STOCK`, and manual adjustments; exposed via `GET /api/stock-movements`.
4. Versioned migrations (`schema_version`): **DONE** — Ordered migrations `v1`, `v2`, and `v3` in `src/server/db/migrate.ts`; idempotency across DB restart verified in `tests/reliability.test.ts`.
5. Optimistic locking (`version` on `orders`): **DONE** — Incremented on update/transition and checked via `expectedVersion` (`409 OPTIMISTIC_LOCK_CONFLICT`), including simultaneous edit vs status-change test in `tests/reliability.test.ts`.

### Phase 4: Features staff will actually need
1. Inventory management (Admin only): **DONE** — `POST /api/products`, `PATCH /api/products/:id`, `POST /api/products/:id/adjust-stock` (`src/server/services/inventoryService.ts`, `src/client/components/InventoryView.tsx`).
2. Pagination, sorting, date-range filter: **DONE** — Server-side `page`, `pageSize`, `sortBy`, `sortDir`, `dateFrom`, `dateTo` in `listOrders` (`src/server/services/orderService.ts`) and `src/client/App.tsx`.
3. Customer lookup: **DONE** — `search` matches `reference`, `customer_name`, or `customer_phone` in `listOrders`.
4. Order editing while `Placed`: **DONE** — `PATCH /api/orders/:id` (`editPlacedOrder` in `src/server/services/orderService.ts`) with atomic stock reconciliation.
5. Low-stock indicator & dashboard: **DONE** — `GET /api/dashboard` (`getDashboardSummary` in `src/server/services/inventoryService.ts` using `STORE_TIMEZONE`) and `src/client/components/DashboardView.tsx`.
6. CSV export & printable packing slip: **DONE** — `GET /api/orders/export.csv` (`listAllOrdersForExport` + `ordersToCsv` with formula-injection escaping, tested with 255+ orders) and `src/client/components/PackingSlipModal.tsx` (`@media print`).

### Phase 5: Frontend quality
1. Skeletons, toasts, confirmation dialogs: **DONE** — `src/client/components/Skeleton.tsx`, `.toast-region` in `src/client/App.tsx`, and `src/client/components/ConfirmDialog.tsx` for Ship and Cancel.
2. Inline validation & double-submit prevention: **DONE** — Inline phone/notes/reason validation and `disabled` submit states in `src/client/App.tsx`.
3. Accessibility: **DONE** — `role="dialog"`, `aria-modal`, `Escape` handling, focus trap (`PackingSlipModal`), focus restoration, `aria-invalid`, `focus-visible` outlines, and WCAG AA palette (`src/client/styles.css`).
4. Responsive tablet layout: **DONE** — `@media (max-width: 1024px)` and `@media (max-width: 960px)` rules in `src/client/styles.css`.
5. React Testing Library & Playwright E2E: **DONE** — `tests/App.ui.test.tsx` (3 tests) and `e2e/orders.spec.ts` (1 full happy + cancel + inventory E2E test).

### Phase 6 & 7: Operations, Cleanup & Gaps
1. Structured logging (`pino`) + redaction + request ID + `/api/health`: **DONE** — `src/server/logger.ts`, `pinoHttp` with `X-Request-Id`, `GET /api/health` (`tests/orders.test.ts`, `tests/security.test.ts`).
2. Validated env config & `.env.example`: **DONE** — `src/server/config.ts` (`PORT`, `DB_PATH`, `SESSION_SECRET`, `NODE_ENV`, `CORS_ORIGINS`, `COOKIE_SECURE`, `TRUST_PROXY`, `STORE_TIMEZONE`, `BACKUP_RETENTION`, `ALLOW_DEMO_USERS`).
3. Automated SQLite backup & restore + scheduled cleanup: **DONE** — `src/server/db/backup.ts` (`VACUUM INTO`, retention pruning), `cleanupExpiredRecords` on startup + hourly in `src/server/index.ts`, tested in `tests/ops.test.ts`.
4. Dead code removal & `npm audit` upgrade: **DONE** — Removed `src/server/db/pool.ts`, `pg`, `@types/pg`; `depcheck` clean; upgraded `vite` 8 / `vitest` 5 / `@vitejs/plugin-react` 6 / `jest-dom` 8 (`0` vulnerabilities in `npm audit`).
5. ESLint, Prettier, TypeScript strict mode: **DONE** — `npm run lint`, `npm run format:check`, and `npm run typecheck` all pass.

### Phase 8 (Replacement): Multi-Page IA & UI/UX Redesign ("Ledger & Label")
1. Grounded design principles & IA: **DONE** — `docs/DESIGN_PRINCIPLES.md`, `docs/DESIGN_DECISIONS.md`, `docs/IA.md`, `docs/DESIGN.md`.
2. Multi-page React Router v7 SPA & Express SPA fallback: **DONE** — `src/client/App.tsx` (`React.lazy` routes), `src/client/layouts/` (`AppShell.tsx`, `PublicLayout.tsx`), `src/client/guards/RouteGuards.tsx`, 15 pages (`src/client/pages/`), 23 shared primitives (`src/client/components/`), and `src/server/app.ts` SPA fallback.
3. Two-round Playwright self-critique & WCAG 2.0 AA verification: **DONE** — `docs/DESIGN_REVIEW.md` (14 flaws fixed across Round 1 & Round 2), `docs/screenshots/` (`r1-*`, `r2-*` at `1440px`, `1024px`, `768px`, and dark mode), `e2e/a11y.spec.ts` (`0` violations across all 15 routes in Light & Dark), and `e2e/guards-and-keyboard.spec.ts`.

### Phase 9: Deployment Readiness
1. Dockerfile (non-root `USER node`, `/api/health` healthcheck) & `docker-compose.yml`: **PARTIAL (UNVERIFIED locally)** — Authored; Docker is not installed locally, so CI workflow runs `docker build` + `/api/health` container smoke test.
2. Push-ready GitHub Actions CI: **DONE (UNVERIFIED on runner)** — `.github/workflows/ci.yml` runs `npm ci`, `npm audit --omit=dev`, `lint`, `format:check`, `typecheck`, `build`, `test`, `test:e2e`, and Docker smoke test.
3. Deployment docs & non-demo admin creation: **DONE** — `docs/DEPLOYMENT.md` and `src/server/db/createAdmin.ts` (`npm run db:create-admin`, tested in `tests/ops.test.ts`).
4. 3-minute demo script: **DONE** — `docs/DEMO_SCRIPT.md`.

---

## 2. CURRENT ARCHITECTURE

### Tech Stack & Versions
- **Runtime:** Node.js `v26.13.1`, npm `11.20.0`, TypeScript `^5.6.3` (`strict: true`)
- **Backend:** Express `^4.21.1`, `node:sqlite` (`DatabaseSync`, WAL mode), Zod `^4.6.7`, `bcryptjs` `^3.0.3`, `cookie-parser` `^1.4.7`, `helmet` `^8.3.0`, `express-rate-limit` `^8.7.5`, `cors` `^2.8.5`, `pino` `^10.4.0`, `pino-http` `^11.0.0`
- **Frontend:** React `^18.3.1`, `react-router` `^7.0.0`, Vite `8.3.8`, `@vitejs/plugin-react` `^6.3.0`, `lucide-react` `^0.460.0`, `@fontsource/fraunces`, `@fontsource/inter`, `@fontsource/ibm-plex-mono`
- **Testing & Lint:** Vitest `5.1.2`, Supertest `^7.0.0`, React Testing Library `^16.3.3`, `@testing-library/jest-dom` `8.0.0`, Playwright `^1.65.1`, `@axe-core/playwright`, ESLint `^10.15.0`, Prettier `^3.10.1`

### Folder Structure
- `src/server/`: `index.ts`, `app.ts`, `config.ts`, `logger.ts`, `types.ts`, `validation.ts`
  - `db/`: `connection.ts`, `migrate.ts`, `seed.ts`, `backup.ts`, `createAdmin.ts`
  - `services/`: `authService.ts`, `orderService.ts`, `inventoryService.ts`
- `src/client/`: `main.tsx`, `App.tsx`, `api.ts`, `types.ts`, `styles.css`, `vite-env.d.ts`
  - `components/`: 23 shared primitives (`Badge`, `Breadcrumbs`, `Button`, `Card`, `Checkbox`, `ConfirmDialog`, `Dialog`, `EmptyState`, `Field`, `IconButton`, `Input`, `PageHeader`, `Pagination`, `Select`, `Skeleton`, `Stat`, `StatusDot`, `Stepper`, `Table`, `Tabs`, `Textarea`, `Timeline`, `Toast`)
  - `context/`: `AppContext.tsx`
  - `guards/`: `RouteGuards.tsx`
  - `layouts/`: `AppShell.tsx`, `PublicLayout.tsx`
  - `pages/`: 15 pages (`HomePage`, `LoginPage`, `ForbiddenPage`, `NotFoundPage`, `DashboardPage`, `OrdersPage`, `NewOrderPage`, `OrderDetailPage`, `PackingSlipPage`, `InventoryPage`, `InventoryFormPage`, `StockMovementsPage`, `AccountPage`, `HelpPage`, `ComponentGalleryPage`)
  - `utils/`: `format.ts`
- `tests/`: `orders.test.ts`, `security.test.ts`, `reliability.test.ts`, `ops.test.ts`, `App.ui.test.tsx`
- `e2e/`: `orders.spec.ts`, `guards-and-keyboard.spec.ts`, `a11y.spec.ts`
- `docs/`: `DESIGN_PRINCIPLES.md`, `DESIGN_DECISIONS.md`, `IA.md`, `DESIGN.md`, `DESIGN_REVIEW.md`, `DEMO_SCRIPT.md`, `DEPLOYMENT.md`, `screenshots/` (`r1-*.png`, `r2-*.png`)
- Root config/ops: `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `eslint.config.js`, `.prettierrc`, `playwright.config.ts`, `vitest.config.ts`, `vite.config.ts`, `.env.example`, `README.md`, `PROJECT_SUMMARY.md`, `CHANGELOG.md`, `HANDOFF_REPORT.md`

### Database Schema (SQLite via `src/server/db/migrate.ts`)
- **`schema_version`**: `version INTEGER PK`, `name TEXT NOT NULL`, `applied_at TEXT NOT NULL` (`v1`: `initial_core_schema`, `v2`: `audit_trail_and_optimistic_locking`, `v3`: `security_hardening_sessions_idempotency`)
- **`order_seq`**: `id INTEGER PK CHECK (id = 1)`, `next_val INTEGER NOT NULL DEFAULT 1001`
- **`products`**: `id INTEGER PK`, `sku TEXT NOT NULL UNIQUE`, `name TEXT NOT NULL`, `category TEXT NOT NULL DEFAULT 'General'`, `price_cents INTEGER NOT NULL CHECK (>= 0)`, `stock INTEGER NOT NULL CHECK (>= 0)`, `created_at TEXT NOT NULL`
- **`orders`**: `id INTEGER PK`, `reference TEXT NOT NULL UNIQUE`, `customer_name TEXT`, `customer_phone TEXT`, `notes TEXT`, `status TEXT NOT NULL CHECK IN ('Placed','Packed','Shipped','Cancelled')`, `version INTEGER NOT NULL DEFAULT 1`, `total_cents INTEGER NOT NULL CHECK (>= 0)`, `created_at TEXT`, `updated_at TEXT`
- **`order_items`**: `id INTEGER PK`, `order_id INTEGER FK->orders(id) CASCADE`, `product_id INTEGER FK->products(id)`, `sku TEXT`, `product_name TEXT`, `unit_price_cents INTEGER CHECK (>= 0)`, `quantity INTEGER CHECK (> 0)`, `UNIQUE(order_id, product_id)`
- **`idempotency_keys`**: `user_id INTEGER NOT NULL DEFAULT 0`, `key TEXT NOT NULL`, `request_hash TEXT NOT NULL`, `response_status INTEGER NOT NULL`, `response_body TEXT NOT NULL`, `created_at TEXT`, `expires_at TEXT NOT NULL`, `PRIMARY KEY (user_id, key)`
- **`users`**: `id INTEGER PK`, `username TEXT NOT NULL UNIQUE`, `display_name TEXT NOT NULL`, `password_hash TEXT NOT NULL`, `role TEXT NOT NULL CHECK IN ('Admin','Operator','Warehouse')`, `created_at TEXT`
- **`sessions`**: `id TEXT PK`, `user_id INTEGER FK->users(id) CASCADE`, `csrf_token TEXT NOT NULL`, `expires_at TEXT NOT NULL`, `last_active_at TEXT`, `created_at TEXT`
- **`order_events`**: `id INTEGER PK`, `order_id INTEGER FK->orders(id) CASCADE`, `from_status TEXT`, `to_status TEXT NOT NULL`, `actor_user_id INTEGER FK->users(id) SET NULL`, `actor_username TEXT`, `reason TEXT`, `created_at TEXT`
- **`stock_movements`**: `id INTEGER PK`, `product_id INTEGER FK->products(id)`, `delta INTEGER NOT NULL`, `reason TEXT NOT NULL`, `order_id INTEGER FK->orders(id) SET NULL`, `actor_user_id INTEGER FK->users(id) SET NULL`, `created_at TEXT`

### Authorization Matrix & API Routes (`src/server/app.ts`)
| Method | Path | Unauth | Operator | Warehouse | Admin | Request / Response |
| --- | --- | --- | --- | --- | --- | --- |
| `GET` | `/api/health` | `200` | `200` | `200` | `200` | `{ status, uptimeSeconds, timestamp }` |
| `POST` | `/api/auth/login` | `200`/`400`/`401` | `200`/`400`/`401` | `200`/`400`/`401` | `200`/`400`/`401` | `{ username, password }` -> `{ user, csrfToken }` + cookie |
| `GET` | `/api/auth/me` | `401` | `200` | `200` | `200` | `{ user, csrfToken }` |
| `POST` | `/api/auth/logout` | `401` | `200` (CSRF) | `200` (CSRF) | `200` (CSRF) | `{ ok: true }` |
| `POST` | `/api/auth/change-password` | `401` | `200`/`400` (CSRF) | `200`/`400` (CSRF) | `200`/`400` (CSRF) | `{ currentPassword, newPassword }` -> `{ ok: true }` |
| `GET` | `/api/dashboard` | `401` | `200` | `200` | `200` | `{ dashboard }` |
| `GET` | `/api/products` | `401` | `200` | `200` | `200` | `{ products }` |
| `POST` | `/api/products` | `401` | `403` | `403` | `201`/`400` (CSRF) | `{ sku, name, category?, priceCents, stock }` -> `{ product }` |
| `PATCH` | `/api/products/:id` | `401` | `403` | `403` | `200`/`400` (CSRF) | `{ name?, category?, priceCents? }` -> `{ product }` |
| `POST` | `/api/products/:id/adjust-stock` | `401` | `403` | `403` | `200`/`400` (CSRF) | `{ delta, reason }` -> `{ product }` |
| `GET` | `/api/stock-movements` | `401` | `200` | `200` | `200` | `?productId=` -> `{ movements }` |
| `GET` | `/api/orders/export.csv` | `401` | `200` | `200` | `200` | Order query filters -> `text/csv` attachment |
| `GET` | `/api/orders` | `401` | `200` | `200` | `200` | `?search,status,dateFrom,dateTo,sortBy,sortDir,page,pageSize` -> `{ orders, pagination }` |
| `GET` | `/api/orders/:id` | `401` | `200` | `200` | `200` | `{ order }` |
| `POST` | `/api/orders` | `401` | `201`/`400` (CSRF) | `403` | `201`/`400` (CSRF) | `{ customerName?, customerPhone?, notes?, items }` + `Idempotency-Key` -> `{ order }` |
| `PATCH` | `/api/orders/:id` | `401` | `200`/`400` (CSRF) | `403` | `200`/`400` (CSRF) | `{ customerName?, customerPhone?, notes?, items, expectedVersion? }` -> `{ order }` |
| `POST` | `/api/orders/:id/status` | `401` | `403` | `200`/`400` (CSRF) | `200`/`400` (CSRF) | `{ status, reason?, expectedVersion? }` -> `{ order }` |

All errors return `{ error: { code, message, details? } }`.

---

## 3. VERIFICATION

- **`npm run lint`** (`eslint .`): **PASSED** (0 errors, 0 warnings).
- **`npm run format:check`** (`prettier --check`): **PASSED** ("All matched files use Prettier code style!").
- **`npm run typecheck`** (`tsc --noEmit`): **PASSED** (0 errors).
- **`npm run build`** (`vite build && tsc -p tsconfig.server.json`): **PASSED** (`705ms`; `dist/client/index.html` 0.43 kB, CSS `18.51 kB` / `4.05 kB` gzip vs pre-replacement `21.36 kB` / `4.50 kB` gzip; main JS `195.98 kB` / `64.27 kB` gzip + 16 `React.lazy` chunks `0.69 kB`–`7.00 kB`; `dist/server/` compiled).
- **`npm test`** (`vitest run`): **PASSED** — 5 test files, **42/42 tests passed**:
  - `tests/ops.test.ts`: **7 passed**
  - `tests/orders.test.ts`: **21 passed**
  - `tests/security.test.ts`: **7 passed**
  - `tests/reliability.test.ts`: **3 passed**
  - `tests/App.ui.test.tsx`: **4 passed** (order intake + inline phone validation, `Ship` & `Cancel` dialogs, Dashboard + `Placed` order editing, and route/role guards).
- **`npm run test:e2e`** (`playwright test`): **PASSED** — **5/5 passed** (`27.9s`):
  - `e2e/a11y.spec.ts` (**2 passed**): `@axe-core/playwright` WCAG 2.0 AA across all 15 routes in Light & Dark mode (`0` serious/critical violations).
  - `e2e/guards-and-keyboard.spec.ts` (**2 passed**): unauthenticated `?next=` + role guard redirects (`/forbidden`), and keyboard-only `create -> pack -> ship` + `create -> cancel`.
  - `e2e/orders.spec.ts` (**1 passed**): happy path, cancel path, and Admin inventory add + stock adjustment.
- **`npm audit`**: **0 vulnerabilities** (`found 0 vulnerabilities` across 396 packages).
- **`depcheck`**: **PASSED** (`No depcheck issue`).
- **NOT TESTED / UNVERIFIED:**
  - `Dockerfile` build and `docker compose up` (no Docker installed locally).
  - `.github/workflows/ci.yml` execution on GitHub Actions.

---

## 4. KEY DECISIONS AND CHANGES

- **SQLite (`node:sqlite`) instead of PostgreSQL:** Used Node v26 built-in `node:sqlite` (`DatabaseSync`) with `BEGIN IMMEDIATE` transactions and `PRAGMA journal_mode = WAL`. Dead `pg` / `@types/pg` / `src/server/db/pool.ts` removed in Phase 7.
- **`createRequire` for `node:sqlite` (`src/server/db/connection.ts`):** Loaded via `createRequire(import.meta.url)('node:sqlite')` for Vite/Vitest compatibility.
- **Upgraded `vite` 8 / `vitest` 5 / `@vitejs/plugin-react` 6 / `jest-dom` 8:** Cleared all 6 `npm audit` vulnerabilities in devDependencies with zero test regressions.
- **CSV export pagination loop (`listAllOrdersForExport`):** Loops in 100-row pages so CSV exports never truncate at 100 rows.
- **`STORE_TIMEZONE` dashboard calculation:** Evaluates "today" in the configured IANA timezone (`Intl.DateTimeFormat('en-CA', { timeZone })`) rather than assuming UTC string prefix.

---

## 5. KNOWN ISSUES AND RISKS

1. **`SESSION_SECRET` not used for cookie signing:** `src/server/config.ts` validates `SESSION_SECRET` in production, while `authService.ts` stores random 32-byte session IDs in SQLite without HMAC signing.
2. **In-memory rate limiting:** `express-rate-limit` resets on process restart (single-instance deployment assumption).
3. **Unverified Docker & CI execution:** `Dockerfile`, `docker-compose.yml`, and `.github/workflows/ci.yml` are authored but have not been executed in a container or GitHub runner locally.

---

## 6. HOW TO RUN

- **Prerequisites:** Node.js 22.5+ (tested on `v26.13.1`).
- **Setup:**
  ```bash
  npm install
  cp .env.example .env
  npm run db:migrate
  npm run db:seed    # or npm run db:reset to wipe and re-seed
  ```
- **Environment variables (`.env` / `.env.example`):**
  - `NODE_ENV=development` (`development|test|production`)
  - `PORT=3001`
  - `DB_PATH=./data/store_ops.db`
  - `SESSION_SECRET=change-me-to-a-long-random-secret-at-least-32-chars`
  - `CORS_ORIGINS=http://localhost:5173,http://localhost:3001`
  - `LOG_LEVEL=info`
  - `COOKIE_SECURE=false`
  - `ALLOW_DEMO_USERS=false`
  - `BACKUP_RETENTION=7`
  - `TRUST_PROXY=false`
  - `STORE_TIMEZONE=UTC`
- **Demo Credentials:**
  - `Admin`: `admin` / `AdminPass123!`
  - `Operator`: `operator` / `OperatorPass123!`
  - `Warehouse`: `warehouse` / `WarehousePass123!`
- **Commands:**
  - Dev (API `:3001` + Vite `:5173`): `npm run dev`
  - Prod build & start (`:3001`): `npm run build && npm start`
  - Lint / Format / Typecheck: `npm run lint`, `npm run format:check`, `npm run typecheck`
  - Tests: `npm test` (Vitest) and `npm run test:e2e` (Playwright)
  - Backup / Admin: `npm run db:backup`, `npm run db:create-admin -- --username <u> --password <p>`

---

## 7. RECOMMENDED NEXT STEPS

1. **Run `git push` to trigger GitHub Actions CI** — Verify `docker build` + `/api/health` smoke test, `npm audit`, and Playwright E2E on `ubuntu-latest`. **(S)**
2. **Sign session cookies with `SESSION_SECRET` (HMAC)** — Bind `SESSION_SECRET` directly to cookie integrity. **(S)**
3. **Verify `after-tablet-*.png` visual polish on physical iPad/tablet** — Automated `768x1024` screenshots are captured; touch ergonomics on hardware are `UNVERIFIED`. **(S)**
4. **Provision persistent volume on Fly.io or Render** — Follow `docs/DEPLOYMENT.md` with `TRUST_PROXY=1` and `COOKIE_SECURE=true`. **(M)**
5. **Run `npm run db:create-admin` on production volume** — Replace demo credentials before setting `ALLOW_DEMO_USERS=false`. **(S)**
6. **Schedule automated `npm run db:backup` cron/timer** — Back up `/app/data/store_ops.db` to off-host object storage. **(M)**
7. **Add `PackingSlipModal` Playwright test** — Exercise print modal `Escape` and focus-trap in a real browser. **(S)**
8. **Add multi-tab `OPTIMISTIC_LOCK_CONFLICT` Playwright E2E test** — Verify conflict banner UX in browser. **(S)**
9. **Add `change-password` UI modal** — Expose `POST /api/auth/change-password` in the topbar user menu. **(M)**
10. **Consider PostgreSQL migration if scaling beyond 1 instance** — Required if horizontal scaling is needed later. **(L)**
