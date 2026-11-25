# Information Architecture — Store Ops Console

## Sitemap

```text
/                                   Public landing page (HomePage)
/login                              Sign in page (LoginPage)
/forbidden                          403 Access denied page (ForbiddenPage)
*                                   404 Not found page (NotFoundPage)

/app                                Authenticated AppShell layout
├── /app                            Dashboard (DashboardPage) — Admin, Operator, Warehouse
├── /app/orders                     Orders list (OrdersPage) — Admin, Operator, Warehouse
├── /app/orders/new                 New phone order (NewOrderPage) — Admin, Operator
├── /app/orders/:reference          Order detail & actions (OrderDetailPage) — Admin, Operator, Warehouse
├── /app/orders/:reference/packing-slip  Print-ready packing slip (PackingSlipPage, no AppShell chrome) — Admin, Operator, Warehouse
├── /app/inventory                  Inventory catalogue (InventoryPage) — Admin, Operator, Warehouse (Admin edits)
├── /app/inventory/new              Add product (InventoryFormPage) — Admin
├── /app/inventory/:id              Edit product & adjust stock (InventoryFormPage) — Admin
├── /app/stock-movements            Stock movement log (StockMovementsPage) — Admin, Operator, Warehouse
├── /app/account                    Profile, password, session, theme (AccountPage) — Admin, Operator, Warehouse
├── /app/help                       Role guide, flow, shortcuts, support (HelpPage) — Admin, Operator, Warehouse
└── /app/dev/components             Component gallery (dev-only) (ComponentGalleryPage)
```

## Page Inventory & Jobs-To-Be-Done

| Route | Component | Allowed Roles | Job To Be Done |
| --- | --- | --- | --- |
| `/` | `HomePage` | Public | Understand what Store Ops Console does, how each role works, and sign in. |
| `/login` | `LoginPage` | Public | Authenticate with username and password and return to the requested page. |
| `/forbidden` | `ForbiddenPage` | Public / Any | Recover cleanly when visiting a page outside your role permissions. |
| `*` | `NotFoundPage` | Public / Any | Recover cleanly from an unknown URL and return home or to `/app`. |
| `/app` | `DashboardPage` | Admin, Operator, Warehouse | See today's order counts, revenue, items needing my role's action, and low-stock alerts. |
| `/app/orders` | `OrdersPage` | Admin, Operator, Warehouse | Find, filter, sort, paginate, and export orders, or open one to inspect/act. |
| `/app/orders/new` | `NewOrderPage` | Admin, Operator | Take a phone order quickly by adding in-stock items and optional caller details. |
| `/app/orders/:reference` | `OrderDetailPage` | Admin, Operator, Warehouse | Inspect an order's items and timeline, perform the next fulfilment step, edit while Placed, or cancel. |
| `/app/orders/:reference/packing-slip` | `PackingSlipPage` | Admin, Operator, Warehouse | Print a clean warehouse packing slip without navigation chrome. |
| `/app/inventory` | `InventoryPage` | Admin, Operator, Warehouse | Check stock levels across products with clear low-stock and out-of-stock visibility. |
| `/app/inventory/new` | `InventoryFormPage` | Admin | Add a new product to the store catalogue with initial stock and price. |
| `/app/inventory/:id` | `InventoryFormPage` | Admin | Update product details, record a stock restock or shrinkage adjustment with reason, and review its movement history. |
| `/app/stock-movements` | `StockMovementsPage` | Admin, Operator, Warehouse | Audit stock additions and deductions filtered by product, reason, and date. |
| `/app/account` | `AccountPage` | Admin, Operator, Warehouse | View signed-in role/session info, change password, and switch Light/Dark theme. |
| `/app/help` | `HelpPage` | Admin, Operator, Warehouse | Look up role permissions, order status rules, keyboard shortcuts, and support contacts. |
| `/app/dev/components` | `ComponentGalleryPage` | Dev only (`import.meta.env.DEV`) | Visually inspect all shared UI primitives in one place. |

## Navigation & Guard Rules
1. Unauthenticated requests to `/app/*` redirect to `/login?next=<encoded-path-and-query>`.
2. Authenticated requests to a route disallowed for the user's role redirect to `/forbidden`.
3. Sidebar links hide routes the current role cannot access (`New order` hidden for `Warehouse`; `Add product` hidden for `Operator` and `Warehouse`).
4. Every route updates `document.title` and moves focus to the page's primary `<h1>` heading on navigation.
5. Express serves `dist/client/index.html` for all non-`/api` GET requests (excluding missing `/assets/*` files) so deep links and page refreshes work directly.
