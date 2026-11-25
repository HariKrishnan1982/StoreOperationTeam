// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/client/App';
import * as api from '../src/client/api';
import { AppProvider } from '../src/client/context/AppContext';
import type { Order, Product } from '../src/client/types';

vi.mock('../src/client/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/api')>();
  return {
    ...actual,
    fetchCurrentUser: vi.fn(),
    fetchProducts: vi.fn(),
    fetchOrders: vi.fn(),
    fetchOrderByReference: vi.fn(),
    fetchOrderById: vi.fn(),
    fetchDashboard: vi.fn(),
    fetchStockMovements: vi.fn(),
    createOrder: vi.fn(),
    editOrder: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    adjustProductStock: vi.fn(),
    transitionOrderStatus: vi.fn(),
  };
});

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 1,
    sku: 'SKU-101',
    name: 'Wireless Barcode Scanner',
    category: 'Hardware',
    priceCents: 8900,
    stock: 5,
    createdAt: '2026-11-25T10:00:00.000Z',
  },
  {
    id: 2,
    sku: 'SKU-102',
    name: 'Thermal Receipt Printer',
    category: 'Hardware',
    priceCents: 14500,
    stock: 0,
    createdAt: '2026-11-25T10:00:00.000Z',
  },
  {
    id: 3,
    sku: 'SKU-104',
    name: 'Heavy-Duty Packing Tape (6-Pack)',
    category: 'Supplies',
    priceCents: 1800,
    stock: 24,
    createdAt: '2026-11-25T10:00:00.000Z',
  },
];

const SAMPLE_ORDER: Order = {
  id: 1,
  reference: 'ORD-1001',
  customerName: 'Maya Lin',
  customerPhone: '555-0142',
  notes: null,
  status: 'Packed',
  version: 2,
  totalCents: 19600,
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:05:00.000Z',
  items: [
    {
      id: 1,
      orderId: 1,
      productId: 1,
      sku: 'SKU-101',
      productName: 'Wireless Barcode Scanner',
      unitPriceCents: 8900,
      quantity: 2,
      lineTotalCents: 17800,
    },
    {
      id: 2,
      orderId: 1,
      productId: 3,
      sku: 'SKU-104',
      productName: 'Heavy-Duty Packing Tape (6-Pack)',
      unitPriceCents: 1800,
      quantity: 1,
      lineTotalCents: 1800,
    },
  ],
  events: [
    {
      id: 1,
      orderId: 1,
      fromStatus: null,
      toStatus: 'Placed',
      actorUserId: 2,
      actorUsername: 'operator',
      reason: 'Phone order created',
      createdAt: '2026-11-25T10:00:00.000Z',
    },
  ],
};

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </MemoryRouter>
  );
}

describe('Store Ops Console UI (React Testing Library)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchCurrentUser).mockResolvedValue({
      user: { id: 1, username: 'admin', displayName: 'Store Admin', role: 'Admin' },
      csrfToken: 'test-csrf',
    });
    vi.mocked(api.fetchProducts).mockResolvedValue(SAMPLE_PRODUCTS);
    vi.mocked(api.fetchOrders).mockResolvedValue({
      orders: [SAMPLE_ORDER],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(api.fetchOrderByReference).mockResolvedValue(SAMPLE_ORDER);
    vi.mocked(api.fetchStockMovements).mockResolvedValue([]);
    vi.mocked(api.fetchDashboard).mockResolvedValue({
      todayOrdersCount: 2,
      todayRevenueCents: 19600,
      totalOrdersCount: 2,
      totalRevenueCents: 19600,
      countsByStatus: { Placed: 1, Packed: 1, Shipped: 0, Cancelled: 0 },
      lowStockThreshold: 3,
      lowStockProducts: [SAMPLE_PRODUCTS[1]],
      storeTimezone: 'UTC',
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('builds an order draft on /app/orders/new, validates phone inline, and submits', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createOrder).mockResolvedValue({
      ...SAMPLE_ORDER,
      id: 2,
      reference: 'ORD-1002',
      status: 'Placed',
    });

    renderAt('/app/orders/new');

    expect(await screen.findByText('No items added yet')).toBeInTheDocument();

    const addScannerBtn = await screen.findByRole('button', {
      name: /Increase quantity for Wireless Barcode Scanner/i,
    });
    await user.click(addScannerBtn);

    expect(await screen.findByRole('button', { name: /Place order/i })).toBeInTheDocument();

    await user.click(screen.getByText(/Customer and notes/i));
    const phoneInput = screen.getByLabelText(/Phone number/i);
    await user.type(phoneInput, 'bad!');
    await user.tab();
    expect(await screen.findByText(/Enter a valid phone number/i)).toBeInTheDocument();

    await user.clear(phoneInput);
    await user.type(phoneInput, '555-0199');
    await user.click(screen.getByRole('button', { name: /Place order/i }));

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledTimes(1);
    });
  });

  it('requires confirmation dialog for Ship and mandatory reason dialog for Cancel', async () => {
    const user = userEvent.setup();
    vi.mocked(api.transitionOrderStatus).mockResolvedValue({
      ...SAMPLE_ORDER,
      status: 'Shipped',
      version: 3,
    });

    renderAt('/app/orders/ORD-1001');

    const shipBtn = await screen.findByRole('button', { name: /Mark as shipped/i });
    await user.click(shipBtn);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Ship order ORD-1001?');

    await user.click(screen.getByRole('button', { name: /Back/i }));
    await user.click(screen.getByRole('button', { name: /Cancel order/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Cancel order ORD-1001?');

    const reasonInput = screen.getByLabelText(/Cancellation reason/i);
    await user.type(reasonInput, 'hi');
    const confirmCancel = dialog.querySelectorAll('button');
    await user.click(confirmCancel[confirmCancel.length - 1]);
    expect(await screen.findByText(/Please enter at least 3 characters/i)).toBeInTheDocument();

    await user.clear(reasonInput);
    await user.type(reasonInput, 'Customer changed mind');
    await user.click(confirmCancel[confirmCancel.length - 1]);

    await waitFor(() => {
      expect(api.transitionOrderStatus).toHaveBeenCalledWith(1, 'Cancelled', {
        reason: 'Customer changed mind',
        expectedVersion: 2,
      });
    });
  });

  it('renders Dashboard, Inventory form, and edits a Placed order', async () => {
    const user = userEvent.setup();
    const placedOrder: Order = { ...SAMPLE_ORDER, status: 'Placed', version: 1 };
    vi.mocked(api.fetchOrderByReference).mockResolvedValue(placedOrder);
    vi.mocked(api.editOrder).mockResolvedValue({ ...placedOrder, version: 2 });

    renderAt('/app');
    expect(await screen.findByText('Ready to pack (Placed)')).toBeInTheDocument();
    expect(screen.getByText('Low-stock watch')).toBeInTheDocument();

    cleanup();
    renderAt('/app/orders/ORD-1001');
    const editBtn = await screen.findByRole('button', { name: /Edit items/i });
    await user.click(editBtn);

    const addTapeBtn = await screen.findByRole('button', {
      name: /Increase quantity for Heavy-Duty Packing Tape/i,
    });
    await user.click(addTapeBtn);
    await user.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(api.editOrder).toHaveBeenCalledTimes(1);
    });
  });

  it('redirects unauthenticated users to /login?next=... and unauthorized roles to /forbidden', async () => {
    vi.mocked(api.fetchCurrentUser).mockResolvedValue(null);
    renderAt('/app/orders/new');
    expect(await screen.findByRole('heading', { name: /Sign in/i })).toBeInTheDocument();

    cleanup();
    vi.mocked(api.fetchCurrentUser).mockResolvedValue({
      user: { id: 3, username: 'warehouse', displayName: 'Warehouse Staff', role: 'Warehouse' },
      csrfToken: 'test-csrf',
    });
    renderAt('/app/orders/new');
    expect(await screen.findByRole('heading', { name: /Access denied/i })).toBeInTheDocument();

    cleanup();
    vi.mocked(api.fetchCurrentUser).mockResolvedValue({
      user: { id: 2, username: 'operator', displayName: 'Counter Operator', role: 'Operator' },
      csrfToken: 'test-csrf',
    });
    renderAt('/app/inventory/new');
    expect(await screen.findByRole('heading', { name: /Access denied/i })).toBeInTheDocument();
  });
});
