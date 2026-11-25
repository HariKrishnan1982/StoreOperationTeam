# Changelog

All notable changes to the **Store Ops Console** are documented in this file by phase.

---

## [Phase 9] — Deployment Readiness
### Added
- Non-demo admin creation/reset script (`src/server/db/createAdmin.ts`, `npm run db:create-admin`) and unit test (`tests/ops.test.ts`).
- GitHub Actions CI Docker build + `/api/health` container smoke test and `npm audit --omit=dev --audit-level=high` (`.github/workflows/ci.yml`).
- Persistent-volume deployment guide (`docs/DEPLOYMENT.md`) and 3-minute role walkthrough (`docs/DEMO_SCRIPT.md`).

---

## [Phase 8 (Replacement)] — Multi-Page IA & UI/UX Redesign ("Ledger & Label")
### Added & Changed
- Grounded design system in [DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md), [DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md), [IA.md](docs/IA.md), and [DESIGN.md](docs/DESIGN.md).
- Rebuilt client as a multi-page `react-router` v7 SPA with `React.lazy` route code-splitting (`src/client/App.tsx`), `AppShell` / `PublicLayout` (`src/client/layouts/`), role guards (`src/client/guards/RouteGuards.tsx`), 15 dedicated pages (`src/client/pages/`), and 23 shared UI primitives (`src/client/components/`) plus `/app/dev/components` gallery.
- Updated Express SPA fallback in `src/server/app.ts` to serve `index.html` for non-`/api` GET requests while excluding missing `/assets/*`.
- Light paper theme (`#F2EFE8` / `#FBFAF6` / `#1F5E4E`) is default; Dark mode (`#1A1C1A`) is an explicit `localStorage` toggle; self-hosted `@fontsource` Latin fonts (`Fraunces`, `Inter`, `IBM Plex Mono`).
- Completed two Playwright self-critique rounds (`docs/DESIGN_REVIEW.md`, `r1-*.png` and `r2-*.png` across `1440px`, `1024px`, `768px`, and dark mode).
- Verified `0` serious/critical WCAG 2.0 AA violations across all 15 routes in Light & Dark mode (`e2e/a11y.spec.ts`), route guards + keyboard-only E2E flow (`e2e/guards-and-keyboard.spec.ts`), and RTL route/guard tests (`tests/App.ui.test.tsx`).

---

## [Phase 7] — Cleanup & Gaps
### Changed & Added
- Removed dead PostgreSQL code/dependencies (`src/server/db/pool.ts`, `pg`, `@types/pg`); verified with `depcheck`.
- Fixed CSV export 100-row cap via `listAllOrdersForExport` (tested with 255+ orders in `tests/ops.test.ts`).
- Added `TRUST_PROXY` env config (`app.set('trust proxy', ...)`) and `STORE_TIMEZONE` for dashboard "today" calculations.
- Added startup + hourly `cleanupExpiredRecords` for expired sessions and idempotency keys.
- Added `Escape`-to-close, focus trap, and focus restoration to `PackingSlipModal.tsx`.
- Upgraded `vite` 8 / `vitest` 5 / `@vitejs/plugin-react` 6 / `@testing-library/jest-dom` 8, clearing all 6 `npm audit` findings (`0` vulnerabilities).

---

## [Phase 6] — Operations, Security Audit & Reliability
### Added
- Structured JSON logging via `pino` and `pino-http` (`src/server/logger.ts`) with `X-Request-Id` correlation headers and redaction of cookies, CSRF tokens, Authorization headers, passwords, and `customerPhone`.
- Zod-validated environment configuration (`src/server/config.ts`) and `.env.example` (`NODE_ENV`, `PORT`, `DB_PATH`, `SESSION_SECRET`, `CORS_ORIGINS`, `LOG_LEVEL`, `COOKIE_SECURE`, `ALLOW_DEMO_USERS`, `BACKUP_RETENTION`) with production fail-fast for missing/weak secrets and seeded demo users (`assertProductionSafety`).
- Enriched `GET /api/health` with `status`, `uptimeSeconds`, and `timestamp`.
- Automated SQLite hot backup script (`src/server/db/backup.ts`, `npm run db:backup` using `VACUUM INTO`) with `BACKUP_RETENTION` pruning, restore procedure in `README.md`, and backup/restore test (`tests/ops.test.ts`).
- Multi-stage `Dockerfile` (non-root `USER node`, `/api/health` healthcheck), `docker-compose.yml` with persistent volumes, and GitHub Actions CI workflow (`.github/workflows/ci.yml`).
- ESLint (`eslint.config.js`, `npm run lint`), Prettier (`.prettierrc`, `npm run format:check`), and `npm run typecheck`.
- `v3` migration (`sessions.last_active_at`, per-user `idempotency_keys` with `expires_at` and `422` on payload mismatch), session rotation on login, 30m idle / 8h absolute session expiry, and `POST /api/auth/change-password`.
- Security audit suite (`tests/security.test.ts`) and reliability/load smoke suite (`tests/reliability.test.ts`, 200 requests `p95=39.61ms`).

---

## [Phase 5] — Frontend Quality & Accessibility
### Added
- Non-blocking loading skeletons (`src/client/components/Skeleton.tsx`) and floating toast notifications (`.toast-region`).
- Accessible confirmation dialogs (`src/client/components/ConfirmDialog.tsx`) for **Mark as Shipped** and **Cancel Order** (focus management, `Escape` key handling, and mandatory cancellation reason validation).
- Inline field-level validation for phone numbers, notes, and cancellation reasons, plus double-submit guards.
- Tablet-responsive layout (`<= 1024px`) and WCAG AA color contrast adjustments (`src/client/styles.css`).
- React Testing Library UI tests (`tests/App.ui.test.tsx`) and Playwright end-to-end tests (`e2e/orders.spec.ts`, `playwright.config.ts`).

---

## [Phase 4] — Staff Operations Features
### Added
- Admin-only inventory management (`src/server/services/inventoryService.ts`, `src/client/components/InventoryView.tsx`): `POST /api/products`, `PATCH /api/products/:id`, and `POST /api/products/:id/adjust-stock` with mandatory reason logging.
- Server-side pagination, sorting (`createdAt`, `totalCents`, `reference`, `status`), date-range filtering (`dateFrom`, `dateTo`), and customer lookup by name or phone on `GET /api/orders`.
- Editing `Placed` orders (`PATCH /api/orders/:id`) with atomic stock reconciliation and `ORDER_EDITED` movement tracking.
- Operations dashboard (`GET /api/dashboard`, `src/client/components/DashboardView.tsx`) with today's orders, revenue, status breakdown, and low-stock alerts (`<= 3` units).
- CSV export (`GET /api/orders/export.csv` with formula-injection escaping) and printable packing slip modal (`src/client/components/PackingSlipModal.tsx`).

---

## [Phase 3] — Audit Trail & Data Model Improvements
### Added
- Versioned SQLite migrations tracked in `schema_version` (`v1: initial_core_schema`, `v2: audit_trail_and_optimistic_locking` in `src/server/db/migrate.ts`).
- `order_events` table recording order creation and every status transition with actor and timestamp inside the same transaction, displayed as a **Status Timeline** on the order detail view.
- Mandatory cancellation reason (`>= 3` characters) enforced by Zod and the UI.
- `stock_movements` audit ledger (`GET /api/stock-movements`) recording `-qty` on placement and `+qty` on cancellation.
- Optimistic locking via `orders.version` and `expectedVersion` (`409 OPTIMISTIC_LOCK_CONFLICT`).

---

## [Phase 2] — Authentication & Roles
### Added
- Password hashing with `bcryptjs` and `httpOnly` (`SameSite=Lax`) session cookies stored in SQLite `users` and `sessions` tables (`src/server/services/authService.ts`).
- Role-based access control (`Admin`, `Operator`, `Warehouse`) enforced server-side (`401 UNAUTHORIZED`, `403 FORBIDDEN`) and reflected in UI navigation/actions.
- CSRF protection via `X-CSRF-Token` (`crypto.timingSafeEqual`) on all authenticated `POST`/`PATCH` routes, dedicated login rate limiting (`429`), and `POST /api/auth/logout`.
- Synthetic demo credentials seeded for each role (`admin`, `operator`, `warehouse`).

---

## [Phase 1] — Hardening & Correctness
### Added
- Concurrency integration test verifying 10 simultaneous `POST /api/orders` requests against 5-unit stock (`5` succeed, `5` fail with `409`, stock `0`).
- Strict Zod validation (`src/server/validation.ts`) across request bodies, query params, and path params.
- Unified error payload format `{ error: { code, message, details? } }` with global Express error handler (no stack trace or SQL leakage).
- Optional `Idempotency-Key` header support on `POST /api/orders` (`idempotency_keys` table) preventing duplicate orders on retries and detecting payload conflicts (`409`).
- Integer-cent money safety checks and security middleware (`helmet`, `express-rate-limit`, `32kb` JSON body limit, strict CORS allowlist).
