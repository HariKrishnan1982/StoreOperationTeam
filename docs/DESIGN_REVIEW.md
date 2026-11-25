# Design Critique & Self-Review — Store Ops Console

## Round 1 Critique (from `r1-*` screenshots at 1440px, 1024px, 768px, and Dark mode)

1. **Double-bordered tables inside cards (`DashboardPage`, `OrderDetailPage` — P4 Proximity before decoration):** `.table-wrap` had its own `1px solid` border and `border-radius`, even when nested inside a bordered `.card`. Fix: remove outer border/radius on `.card .table-wrap` so tables sit flush inside cards.
2. **Wrapped SKU cells (`OrderDetailPage` — P4 Alignment):** `SKU-104` wrapped onto two lines (`SKU-` / `104`). Fix: add `white-space: nowrap` on `.mono` table cells.
3. **Tablet filter bar stacking (`OrdersPage` at `768px` — P6 Warehouse tablet usability):** `.filter-bar` collapsed to 1 column at `<= 1024px`, stacking 5 full-width controls vertically. Fix: use a 2-column grid on `<= 1024px` (`Search` spanning 2 columns, `From`/`To` side-by-side, `Sort`/`Clear` aligned).
4. **Awkward centered `Clear` button (`OrdersPage` at `768px` — P4 Alignment):** On narrow viewports, the ghost `Clear` button spanned full width and looked centered. Fix: `justify-self: start` on `.filter-bar > .btn`.
5. **Alarming `Cancelled` badge at count `0` (`DashboardPage` — P5 Status is quiet until it matters):** In `Orders by status`, `Cancelled` rendered a red pill even when `0`. Fix: render `<StatusDot status={status} />` in the summary table, or keep `Cancelled` quiet when `0` (use `StatusDot` with `status-dot-cancelled` in summary).
6. **Number mixed into `Low stock (3)` badge (`NewOrderPage` — P4/P5):** `NewOrderPage` put `(3)` inside the `Low stock` badge instead of a right-aligned numeric `On hand` column. Fix: add a dedicated `On hand` numeric column and keep `Low stock` / `Out of stock` badges text-only.
7. **Staggered status dots in landing preview (`HomePage` — P4 Alignment):** The 3 rows in `.preview-mockup-body` used `justify-content: space-between`, causing `Placed`, `Packed`, `Shipped` to misalign horizontally. Fix: use a 3-column CSS grid (`1fr 1fr auto`).
8. **Status dot mixed into action buttons (`OrderDetailPage` — P2 One primary action):** `<StatusDot>` sat inside `actions` beside `Print packing slip`, `Cancel order`, and `Mark as shipped`. Fix: move `<StatusDot>` into the `subtitle` metadata row on the left.
9. **Low-contrast dark-mode primary button (`r1-dark-dashboard.png` — P6 Contrast):** Dark text `#0E1A16` on `#3E8E78` felt muddy compared to light mode. Fix: use `#1F5E4E` / `#FBFAF6` (or `#287561` / `#FBFAF6`, 5.4:1+) for crisp white-on-pine consistency.
10. **Disabled pagination noise (`OrdersPage` — P2 Do less):** When `totalPages <= 1`, disabled `Previous` / `Next` buttons still rendered. Fix: show only the item count when `totalPages <= 1`.
11. **Uniform boxed cards on Landing Page (`HomePage` — P3 Consistent, not uniform):** Every section (`How it works`, `Roles`, `Reliable`, `FAQ`) used identical `.card` boxes. Fix: style `How it works` with clean top-ruled editorial columns and `FAQ` as a borderless 2-column typographic list.

---
## Round 2 Critique & Polish (from `r2-*` screenshots)

1. **Dark-mode link contrast (`r2-dark-dashboard.png` — P6 Contrast):** Using `--primary` (`#246B59`) for `<a>` links on `#232623` surface yielded ~2.3:1 contrast. Fix: introduced `--link: #6EC3AA` / `--link-hover: #90D5C0` in `[data-theme='dark']` (8.3:1 on `#232623`).
2. **Quiet `Cancel order` action (`r2-1440-order-detail.png` — P2 One primary action):** Filled red `Cancel order` button competed visually beside filled green `Mark as shipped`. Fix: styled `Cancel order` as a quiet secondary button with danger text/border, leaving `Mark as shipped` as the sole filled primary CTA.
3. **Tablet `Clear` filter button (`r2-768-orders.png` — P4 Alignment):** Borderless ghost `Clear` button looked unanchored next to `Sort by`. Fix: switched to `variant="secondary"` so it aligns cleanly with the select control.

All 14 flaws across Rounds 1 and 2 are resolved and verified in `r2-*` / final screenshots and `e2e/a11y.spec.ts`.
