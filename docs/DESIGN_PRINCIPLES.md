# Design Principles — Store Ops Console

These principles govern every layout, component, copy string, and interaction in the Store Ops Console. They are grounded in:
- **GOV.UK Design Principles** (`https://www.gov.uk/design-principles`, verified 200 OK)
- **IBM Carbon Accessibility Overview** (`https://www.carbondesignsystem.com/guidelines/accessibility/overview`, verified 200 OK)
- **Ant Design Proximity & Layout Spec** (`https://ant.design/docs/spec/proximity`, verified 200 OK)
- **Shopify Polaris** (`https://polaris.shopify.com/principles/principles`, verified 200 OK — unified cross-surface consistency overview; the URL no longer hosts a separate numbered principles list)

---

### P1. Start with the staff member's job, not the data model
- **(a) Source principle:** GOV.UK #1 (*"Start with user needs"*) & #7 (*"Understand context"*).
- **(b) What it means for phone-order and fulfilment:** A phone operator taking a live call needs to find items, adjust quantities, and read back a total immediately—not fill out a rigid form modeled after database columns. A warehouse packer needs to see what is ready to pack or ship for their role first.
- **(c) Concrete testable rule:** Each route has a single primary job-to-be-done; `/app/orders/new` keeps customer details in a collapsed optional section and hides the order summary submit bar until at least 1 item is added (no disabled `$0.00` submit button).

### P2. Do the hard work to make it simple — one primary action per screen
- **(a) Source principle:** GOV.UK #4 (*"Do the hard work to make it simple"*) & #2 (*"Do less"*).
- **(b) What it means for phone-order and fulfilment:** Staff under time pressure should never guess which button advances the order. On Order Detail, there is one primary next step for the current role and status (`Mark as packed` or `Mark as shipped`), while secondary actions (`Edit order`, `Cancel order`, `Print packing slip`) stay visually quiet.
- **(c) Concrete testable rule:** Every authenticated page renders at most one `variant="primary"` button in its main header/action bar.

### P3. Consistent, not uniform
- **(a) Source principle:** GOV.UK #9 (*"Be consistent, not uniform"*) & Shopify Polaris (*unified UI framework for consistent patterns across surfaces*).
- **(b) What it means for phone-order and fulfilment:** Shared controls (buttons, fields, tables, confirmation dialogs) behave identically everywhere, while each page's layout fits its task: a catalogue + sticky manifest on `/app/orders/new`, a dense sortable `<table>` on `/app/orders`, and a print-only sheet on `/app/orders/:reference/packing-slip`.
- **(c) Concrete testable rule:** Every shared control comes from `src/client/components/` with identical keyboard/focus behavior, while no two distinct workflows force-fit the same split-pane template.

### P4. Proximity and alignment before decoration
- **(a) Source principle:** Ant Design Proximity Spec (*"When several items are in close proximity to each other, they become one visual unit... small 8px, middle 16px, large 24px spacing"*) + Alignment, Contrast, Repetition.
- **(b) What it means for phone-order and fulfilment:** Whitespace on a 4px grid (`8px`, `16px`, `24px`) groups related data instead of wrapping every row in heavy boxed cards. Tables use real `<table>` semantics with right-aligned `tabular-nums` currency/quantity columns.
- **(c) Concrete testable rule:** Orders, inventory, and stock movements render as semantic `<table>` elements (never stacked cards), numeric columns are right-aligned with `font-variant-numeric: tabular-nums`, and cards have zero drop-shadows.

### P5. Status is quiet until it matters
- **(a) Source principle:** GOV.UK #4 (*Make it simple*) & Ant Design Contrast.
- **(b) What it means for phone-order and fulfilment:** Normal in-progress states (`Placed`, `Packed`, `Shipped`, `In stock`) do not scream for attention; they use a small `StatusDot` + label. Only exceptions that require action (`Low stock`, `Out of stock`, `Cancelled`) use a tinted `Badge`. SKU codes and order references render in plain monospace text, not boxed chips.
- **(c) Concrete testable rule:** No table cell contains more than one badge, SKU/reference identifiers have no background pill/border box, and `Placed`/`Packed`/`Shipped` use `StatusDot` rather than filled pills.

### P6. Design for inclusion on desktop and warehouse tablets
- **(a) Source principle:** IBM Carbon Accessibility (*WCAG standards, keyboard navigation, color contrast*) & GOV.UK #6 (*"This is for everyone"*).
- **(b) What it means for phone-order and fulfilment:** Warehouse staff use tablets (`768px`–`1024px`) and keyboard-only workflows. Every interactive target must be reachable by `Tab`, `Enter`, `Space`, and `Escape`, maintain WCAG AA contrast in both Light and Dark themes, and provide `>= 44px` touch targets on tablet viewports.
- **(c) Concrete testable rule:** `@axe-core/playwright` reports `0` serious/critical WCAG 2.0 AA violations on every route in Light and Dark mode, and a Playwright keyboard-only E2E test completes `create -> pack -> ship` and `create -> cancel` without mouse clicks.

### P7. Speak shop-floor English, never implementation jargon
- **(a) Source principle:** GOV.UK #1 (*User needs*) & #4 (*Simple*).
- **(b) What it means for phone-order and fulfilment:** Staff do not care about database transactions, idempotency keys, or optimistic locks. Error and status messages state what happened in plain words and what to do next (e.g., *"This order changed while you were viewing it. Reload to see the latest details."*).
- **(c) Concrete testable rule:** Zero occurrences of `"atomic"`, `"idempotent"`, `"idempotency"`, `"optimistic lock"`, or `"transaction"` in rendered UI text (`src/client/pages/`, `src/client/layouts/`, `src/client/components/`), and primary buttons start with action verbs (*"Place order"*, *"Mark as packed"*).
