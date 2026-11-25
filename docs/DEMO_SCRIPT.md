# Store Ops Console — 3-Minute Demo Script

## Minute 0:00 – 0:45 | Phone Order Intake (`Operator`)
1. Open the console and click the **Operator** demo card (`operator` / `OperatorPass123!`), then **Sign In**.
2. Point out the live **Product Catalogue**: `Wireless Barcode Scanner (SKU-101)` has `5 in stock`, while `Thermal Receipt Printer (SKU-102)` is marked **Out of Stock** with its **Add** button disabled.
3. Add `2 × Wireless Barcode Scanner` and `1 × Heavy-Duty Packing Tape (6-Pack)` (`$196.00` total).
4. Enter caller phone `555-0184`, click **Submit Order**, and show the confirmation toast + immediate stock drop (`5 → 3`).
5. Click **View Order**, then **Edit Order** to adjust quantity from `2` to `3` and save — stock reconciles atomically (`3 → 2`). Note that fulfilment buttons (`Mark as Packed`, `Cancel Order`) are hidden for `Operator`.

## Minute 0:45 – 1:45 | Fulfilment & Cancellation (`Warehouse`)
1. Click **Logout**, then sign in as **Warehouse** (`warehouse` / `WarehousePass123!`).
2. Notice the **Create Order** tab is hidden for `Warehouse`.
3. Select the newly placed order, click **Mark as Packed**, and inspect the **Status Timeline** (`Order Placed` → `Placed → Packed` by `warehouse`).
4. Click **Mark as Shipped**, confirm in the accessible **Confirmation Dialog**, and show the terminal `Shipped` state.
5. Select another active order, click **Cancel Order**, enter reason `"Customer called to cancel"`, and confirm. Show that stock is restored and the cancellation reason appears in the timeline.

## Minute 1:45 – 3:00 | Oversight, Inventory & Exports (`Admin`)
1. Click **Logout** and sign in as **Admin** (`admin` / `AdminPass123!`).
2. Open the **Dashboard** tab: highlight Today's Orders, Today's & Total Revenue, Orders by Status, and Low-Stock Alerts.
3. Open **Inventory**: add a new product (`SKU-201`, `Thermal Labels`, `$19.50`, stock `4`), then click **Adjust Stock** (`+6`, reason `"Supplier restock"`) and show stock updating to `10`.
4. Open **Orders**, demonstrate customer search, date-range filtering, **Export CSV**, and **Slip** to open the printable packing slip.
