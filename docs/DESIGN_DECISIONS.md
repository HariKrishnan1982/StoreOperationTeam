# Design Decisions Log — Store Ops Console

Every UI, routing, copy, and component decision cites one or more principles from [DESIGN_PRINCIPLES.md](./DESIGN_PRINCIPLES.md).

| ID | Decision | Principle(s) | Rationale |
| --- | --- | --- | --- |
| D1 | Multi-page `BrowserRouter` under `/`, `/login`, `/app/*`, `/forbidden`, `*` with `React.lazy` route splitting | P1, P3 | Separates public marketing/auth from the authenticated workspace, enables deep links/refresh, and keeps initial bundle small. |
| D2 | Light theme (`#F2EFE8` paper / `#FBFAF6` surface / `#1F5E4E` pine) as default; explicit Dark toggle in `localStorage` without OS auto-override | P4, P6 | Keeps warehouse/counter readability predictable regardless of OS setting while supporting explicit low-light preference. |
| D3 | Semantic `<table>` with `tabular-nums` right-aligned money/qty columns; no card-in-a-list rows | P4, P5 | Improves scannability of orders, inventory, and stock movements without visual noise. |
| D4 | `StatusDot` + text for normal order states; tinted `Badge` reserved for `Low stock`, `Out of stock`, and `Cancelled`; plain monospace for SKUs and order references | P5 | Prevents badge fatigue and draws the eye immediately to exceptions needing staff attention. |
| D5 | `/app/orders/new` collapses "Customer and notes" by default and hides the sticky order summary until 1+ item is selected | P1, P2 | Eliminates dead `$0.00` disabled forms and speeds up live phone intake. |
| D6 | Order Detail shows one `primary` action per role/status (`Mark as packed` or `Mark as shipped`) and plain-language `409` reload recovery | P2, P7 | Removes ambiguity under counter/warehouse pressure and replaces technical conflict jargon with clear next steps. |
| D7 | Dedicated `/app/orders/:reference/packing-slip` print route without `AppShell` chrome | P3 | Ensures clean `@media print` slips without modal focus-trap interference or navigation clutter. |
| D8 | Self-hosted `@fontsource` Latin subsets (`Fraunces` for headings/KPIs, `Inter` 14px for UI, `IBM Plex Mono` for references) | P4, P6 | Complies with Helmet's strict CSP (`font-src 'self'`) and ensures crisp numeric alignment. |
