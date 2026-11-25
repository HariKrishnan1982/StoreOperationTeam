# Design System — "Ledger & Label" (Store Ops Console)

Grounded in [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md) and [IA.md](./IA.md).

---

## 1. Visual Direction
A calm, warm paper-and-ink operations desk. Warm neutrals, flat surfaces, hairline borders, and one deep pine primary action color. No drop-shadows on cards, no gradient blobs, no boxed SKU/reference chips.

- **Default Theme:** Light (`#F2EFE8` canvas).
- **Dark Mode:** Explicit user toggle stored in `localStorage` (`store_ops_theme`: `'light' | 'dark'`), applied via `document.documentElement.dataset.theme = 'dark'`. Does **not** auto-follow OS `prefers-color-scheme`.

---

## 2. Color Tokens (WCAG 2.0 AA Verified)

### Light Theme (Default)
| Token | Hex | Role |
| --- | --- | --- |
| `--bg-canvas` | `#F2EFE8` | Page background (warm bone) |
| `--bg-surface` | `#FBFAF6` | Cards, panels, tables, sidebar |
| `--bg-sunken` | `#E9E5DA` | Table headers, inputs, subtle fills |
| `--border-hairline` | `#D6D0C2` | 1px structural rules |
| `--border-strong` | `#8F8876` | Control borders, focus/active dividers |
| `--ink` | `#1D211F` | Primary text (14.9:1 on `#FBFAF6`) |
| `--ink-muted` | `#52564F` | Secondary text, labels (6.9:1 on `#FBFAF6`, 6.0:1 on `#E9E5DA`) |
| `--primary` | `#1F5E4E` | Primary action (deep pine) |
| `--primary-hover` | `#174A3D` | Primary hover |
| `--on-primary` | `#FBFAF6` | Text on primary (7.3:1) |
| `--danger` | `#A4352B` | Destructive action (brick) |
| `--danger-hover` | `#872920` | Destructive hover |

### Dark Theme (`[data-theme="dark"]`)
| Token | Hex | Role |
| --- | --- | --- |
| `--bg-canvas` | `#1A1C1A` | Warm charcoal canvas |
| `--bg-surface` | `#232623` | Elevated surface |
| `--bg-sunken` | `#141614` | Sunken inputs/headers |
| `--border-hairline` | `#343934` | Hairline rules |
| `--border-strong` | `#5E645B` | Control borders |
| `--ink` | `#EDEAE2` | Primary text (13.4:1 on `#232623`) |
| `--ink-muted` | `#B2B5AD` | Secondary text (7.4:1 on `#232623`) |
| `--primary` | `#3E8E78` | Primary pine |
| `--primary-hover` | `#4EA58D` | Primary hover |
| `--on-primary` | `#0E1A16` | Text on primary (5.3:1) |
| `--danger` | `#D9685D` | Destructive brick |

### Status Representation (P5: Quiet Until It Matters)
- **Normal states (`Placed`, `Packed`, `Shipped`, `In stock`):** `StatusDot` (8px dot + plain text label, no pill box).
- **Exception states (`Low stock`, `Out of stock`, `Cancelled`):** Tinted `Badge` (1px border + tinted background + AA text + label).
- **Identifiers (`ORD-1001`, `SKU-101`):** Plain `IBM Plex Mono` text, never boxed chips.

---

## 3. Typography (Self-Hosted `@fontsource`, Latin Subsets Only)
At most **3 text sizes** in any single view:
1. **Display / Page Title & Dashboard Stat (`26px` / `1.625rem`, line-height `1.2`):** `Fraunces` (600) — used only for `<h1>` page titles, hero headlines, and key dashboard numbers.
2. **Body / UI / Table (`14px` / `0.875rem`, line-height `1.5`):** `Inter` (400, 500, 600) — all UI controls, forms, navigation, and table cells.
3. **Small / Label / Meta (`12px` / `0.75rem`, line-height `1.4`):** `Inter` (500/600) or `IBM Plex Mono` (400/600) for references, SKUs, timestamps, and field hints.

All numeric table columns and prices use `font-variant-numeric: tabular-nums` and right alignment.

---

## 4. Spacing, Layout & Motion
- **4px Grid:** `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-6: 24px`, `--space-8: 32px`.
- **Max Content Width:** `1280px` inside `AppShell`; `1120px` on public landing page.
- **Touch Targets:** Minimum `44px` height/width on interactive controls at `<= 1024px` (warehouse tablet).
- **Motion:** `150ms cubic-bezier(0.2, 0, 0, 1)` for state transitions only; disabled under `@media (prefers-reduced-motion: reduce)`.
- **Icons:** `lucide-react` (`16px` inline, `20px` header/empty-state), used sparingly and never as the sole carrier of meaning.
