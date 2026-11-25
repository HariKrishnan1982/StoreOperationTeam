import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

async function checkA11y(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );

  expect(
    seriousOrCritical,
    `[${label}] axe violations: ${JSON.stringify(seriousOrCritical, null, 2)}`
  ).toEqual([]);
}

test.describe('Accessibility Audit (axe-core WCAG 2.0 AA)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`has zero serious/critical violations across all routes in ${theme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((t) => {
        localStorage.setItem('store_ops_theme', t);
      }, theme);

      await page.goto('/');
      await page.waitForSelector('h1');
      await checkA11y(page, `${theme}:home`);

      await page.goto('/login');
      await page.waitForSelector('button:has-text("Sign in")');
      await checkA11y(page, `${theme}:login`);

      await page.goto('/does-not-exist');
      await page.waitForSelector('text=Page not found');
      await checkA11y(page, `${theme}:not-found`);

      await page.goto('/login');
      await page.getByLabel(/Username/i).fill('admin');
      await page.getByLabel(/Password/i).fill('AdminPass123!');
      await page.getByRole('button', { name: /Sign in/i }).click();
      await page.waitForURL('**/app');

      const appChecks: Array<[string, string, string]> = [
        ['dashboard', '/app', 'text=Ready to pack'],
        ['orders', '/app/orders', 'text=ORD-1001'],
        ['orders-new', '/app/orders/new', 'text=Wireless Barcode Scanner'],
        ['order-detail', '/app/orders/ORD-1001', 'text=Status timeline'],
        ['packing-slip', '/app/orders/ORD-1001/packing-slip', 'text=PACKING SLIP'],
        ['inventory', '/app/inventory', 'text=Thermal Receipt Printer'],
        ['inventory-new', '/app/inventory/new', 'text=Opening stock'],
        ['inventory-edit', '/app/inventory/1', 'text=Adjust stock'],
        ['stock-movements', '/app/stock-movements', 'text=Stock movement log'],
        ['account', '/app/account', 'text=Change password'],
        ['help', '/app/help', 'text=Role permissions'],
        ['forbidden', '/forbidden', 'text=Access denied'],
      ];

      for (const [slug, urlPath, waitSel] of appChecks) {
        await page.goto(urlPath);
        await page.waitForSelector(waitSel);
        await checkA11y(page, `${theme}:${slug}`);
      }
    });
  }
});
