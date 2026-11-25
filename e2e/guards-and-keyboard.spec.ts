import { expect, test } from '@playwright/test';

test.describe('Route Guards & Keyboard-Only Order Flow', () => {
  test('enforces unauthenticated and role-based route guards', async ({ page }) => {
    // Unauthenticated redirect with ?next=
    await page.goto('/app/orders/new');
    await page.waitForURL('**/login?next=%2Fapp%2Forders%2Fnew');

    // Login as Operator returns to /app/orders/new
    await page.getByLabel(/Username/i).fill('operator');
    await page.getByLabel(/Password/i).fill('OperatorPass123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL('**/app/orders/new');

    // Operator cannot access /app/inventory/new
    await page.goto('/app/inventory/new');
    await page.waitForURL('**/forbidden');
    await expect(page.getByRole('heading', { name: /Access denied/i })).toBeVisible();

    // Sign out and log in as Warehouse
    await page.goto('/app');
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.waitForURL('**/login');

    await page.getByLabel(/Username/i).fill('warehouse');
    await page.getByLabel(/Password/i).fill('WarehousePass123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL('**/app');

    // Warehouse cannot access /app/orders/new
    await page.goto('/app/orders/new');
    await page.waitForURL('**/forbidden');
  });

  test('completes full order create -> pack -> ship and cancel using keyboard only', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/Username/i).focus();
    await page.keyboard.type('admin');
    await page.keyboard.press('Tab');
    await page.keyboard.type('AdminPass123!');
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app');

    // Create order via keyboard
    await page.goto('/app/orders/new');
    await page
      .getByRole('button', { name: /Increase quantity for Heavy-Duty Packing Tape/i })
      .focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Place order/i }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app/orders/ORD-*');

    // Pack via keyboard
    await page.getByRole('button', { name: /Mark as packed/i }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Packed · Placed/i)).toBeVisible();

    // Ship via keyboard + confirm dialog
    await page.getByRole('button', { name: /Mark as shipped/i }).focus();
    await page.keyboard.press('Enter');
    const shipDialog = page.getByRole('dialog');
    await expect(shipDialog).toBeVisible();
    await shipDialog.getByRole('button', { name: /Mark as shipped/i }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Shipped · Placed/i)).toBeVisible();

    // Cancel path via keyboard
    await page.goto('/app/orders/new');
    await page
      .getByRole('button', { name: /Increase quantity for Heavy-Duty Packing Tape/i })
      .focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: /Place order/i }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app/orders/ORD-*');

    await page.getByRole('button', { name: /Cancel order/i }).focus();
    await page.keyboard.press('Enter');
    const cancelDialog = page.getByRole('dialog');
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByLabel(/Cancellation reason/i).focus();
    await page.keyboard.type('Keyboard cancel test');
    await cancelDialog.getByRole('button', { name: /Cancel order/i }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Cancelled · Placed/i)).toBeVisible();
  });
});
