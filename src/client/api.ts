import type {
  AuthUser,
  DashboardSummary,
  Order,
  OrderStatus,
  OrdersPagination,
  Product,
  StockMovement,
} from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

let currentCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string> | undefined) ?? {}),
  };

  if (method !== 'GET' && method !== 'HEAD' && currentCsrfToken) {
    headers['X-CSRF-Token'] = currentCsrfToken;
  }

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = typeof data.error === 'object' && data.error !== null ? data.error : null;
    throw new ApiError(
      res.status,
      errObj?.code ?? (typeof data.error === 'string' ? data.error : 'REQUEST_FAILED'),
      errObj?.message ?? data.message ?? `Request failed with status ${res.status}`
    );
  }
  return data as T;
}

export async function fetchCurrentUser(): Promise<{ user: AuthUser; csrfToken: string } | null> {
  try {
    const data = await request<{ user: AuthUser; csrfToken: string }>('/api/auth/me');
    setCsrfToken(data.csrfToken);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw err;
  }
}

export async function login(
  username: string,
  password: string
): Promise<{ user: AuthUser; csrfToken: string }> {
  const data = await request<{ user: AuthUser; csrfToken: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setCsrfToken(data.csrfToken);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  } finally {
    setCsrfToken(null);
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  const data = await request<{ dashboard: DashboardSummary }>('/api/dashboard');
  return data.dashboard;
}

export async function fetchProducts(): Promise<Product[]> {
  const data = await request<{ products: Product[] }>('/api/products');
  return data.products;
}

export async function fetchStockMovements(productId?: number): Promise<StockMovement[]> {
  const qs = productId ? `?productId=${productId}` : '';
  const data = await request<{ movements: StockMovement[] }>(`/api/stock-movements${qs}`);
  return data.movements;
}

export async function createProduct(payload: {
  sku: string;
  name: string;
  category?: string;
  priceCents: number;
  stock: number;
}): Promise<Product> {
  const data = await request<{ product: Product }>('/api/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function updateProduct(
  productId: number,
  payload: { name?: string; category?: string; priceCents?: number }
): Promise<Product> {
  const data = await request<{ product: Product }>(`/api/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.product;
}

export async function adjustProductStock(
  productId: number,
  delta: number,
  reason: string
): Promise<Product> {
  const data = await request<{ product: Product }>(`/api/products/${productId}/adjust-stock`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  });
  return data.product;
}

export interface OrderQueryParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'totalCents' | 'reference' | 'status';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

function buildOrderQueryString(params: OrderQueryParams): string {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.status && params.status !== 'All') query.set('status', params.status);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortDir) query.set('sortDir', params.sortDir);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchOrders(
  params: OrderQueryParams
): Promise<{ orders: Order[]; pagination: OrdersPagination }> {
  return request<{ orders: Order[]; pagination: OrdersPagination }>(
    `/api/orders${buildOrderQueryString(params)}`
  );
}

export async function fetchOrderById(orderId: number): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${orderId}`);
  return data.order;
}

export async function fetchOrderByReference(referenceOrId: string): Promise<Order | null> {
  if (/^\d+$/.test(referenceOrId)) {
    try {
      return await fetchOrderById(Number(referenceOrId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }
  const { orders } = await fetchOrders({ search: referenceOrId, pageSize: 20 });
  const match = orders.find((o) => o.reference.toUpperCase() === referenceOrId.toUpperCase());
  if (!match) return null;
  return fetchOrderById(match.id);
}

export function getOrdersExportUrl(params: OrderQueryParams): string {
  return `/api/orders/export.csv${buildOrderQueryString(params)}`;
}

export async function createOrder(
  payload: {
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    items: Array<{ productId: number; quantity: number }>;
  },
  idempotencyKey?: string
): Promise<Order> {
  const data = await request<{ order: Order }>('/api/orders', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function editOrder(
  orderId: number,
  payload: {
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    items: Array<{ productId: number; quantity: number }>;
    expectedVersion?: number;
  }
): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.order;
}

export async function transitionOrderStatus(
  orderId: number,
  status: OrderStatus,
  options?: { reason?: string; expectedVersion?: number }
): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${orderId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      ...(options?.reason !== undefined ? { reason: options.reason } : {}),
      ...(options?.expectedVersion !== undefined
        ? { expectedVersion: options.expectedVersion }
        : {}),
    }),
  });
  return data.order;
}
