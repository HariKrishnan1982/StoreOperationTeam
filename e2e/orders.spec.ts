import { expect, test } from '@playwright/test';

test.describe('Store Ops Console E2E', () => {
  test('happy path (create -> pack -> ship), cancel path, and admin inventory', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/Username/i).fill('admin');
    await page.getByLabel(/Password/i).fill('AdminPass123!');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await page.waitForURL('**/app');

    // Happy path: create -> pack -> ship
    await page.getByRole('link', { name: /Take phone order/i }).click();
    await page.waitForURL('**/app/orders/new');

    await page
      .getByRole('button', { name: /Increase quantity for Wireless Barcode Scanner/i })
      .click();
    await page.getByText(/Customer and notes/i).click();
    await page.getByLabel(/Customer name/i).fill('E2E Happy Customer');
    await page.getByRole('button', { name: /Place order/i }).click();

    await page.waitForURL('**/app/orders/ORD-*');
    await expect(page.getByText('E2E Happy Customer')).toBeVisible();

    await page.getByRole('button', { name: /Mark as packed/i }).click();
    await expect(page.getByText(/Packed · Placed/i)).toBeVisible();

    await page.getByRole('button', { name: /Mark as shipped/i }).click();
    const shipDialog = page.getByRole('dialog');
    await expect(shipDialog).toBeVisible();
    await shipDialog.getByRole('button', { name: /Mark as shipped/i }).click();
    await expect(page.getByText(/Shipped · Placed/i)).toBeVisible();

    // Cancel path
    await page.goto('/app/orders/new');
    await page
      .getByRole('button', { name: /Increase quantity for Heavy-Duty Packing Tape/i })
      .click();
    await page.getByRole('button', { name: /Place order/i }).click();
    await page.waitForURL('**/app/orders/ORD-*');

    await page.getByRole('button', { name: /Cancel order/i }).click();
    const cancelDialog = page.getByRole('dialog');
    await cancelDialog.getByLabel(/Cancellation reason/i).fill('E2E customer cancelled');
    await cancelDialog.getByRole('button', { name: /Cancel order/i }).click();
    await expect(page.getByText(/Cancelled · Placed/i)).toBeVisible();

    // Admin inventory add + stock adjust
    await page.goto('/app/inventory/new');
    const sku = `SKU-E2E-${Date.now()}`;
    await page.getByLabel(/^SKU/i).fill(sku);
    await page.getByLabel(/Product name/i).fill('E2E Thermal Labels');
    await page.getByLabel(/Unit price/i).fill('15.50');
    await page.getByLabel(/Opening stock/i).fill('10');
    await page.getByRole('button', { name: /Create product/i }).click();

    await page.waitForSelector('text=Adjust stock');
    await page.getByLabel(/Units/i).fill('5');
    await page.getByLabel(/Reason/i).fill('E2E restock');
    await page.getByRole('button', { name: /Record stock adjustment/i }).click();
    await expect(page.getByText('E2E restock')).toBeVisible();
  });
});
