export type OrderStatus = 'Placed' | 'Packed' | 'Shipped' | 'Cancelled';
export type UserRole = 'Admin' | 'Operator' | 'Warehouse';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
  stock: number;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  sku: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderEvent {
  id: number;
  orderId: number;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: number | null;
  actorUsername: string | null;
  reason: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  reference: string;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  status: OrderStatus;
  version: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  events: OrderEvent[];
}

export interface OrdersPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DashboardSummary {
  todayOrdersCount: number;
  todayRevenueCents: number;
  totalOrdersCount: number;
  totalRevenueCents: number;
  countsByStatus: Record<OrderStatus, number>;
  lowStockThreshold: number;
  lowStockProducts: Product[];
  storeTimezone?: string;
}

export interface StockMovement {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  orderId: number | null;
  actorUserId: number | null;
  createdAt: string;
}
