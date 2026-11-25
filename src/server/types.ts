export type OrderStatus = 'Placed' | 'Packed' | 'Shipped' | 'Cancelled';
export type UserRole = 'Admin' | 'Operator' | 'Warehouse';

export const USER_ROLES: readonly UserRole[] = ['Admin', 'Operator', 'Warehouse'] as const;

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'Placed',
  'Packed',
  'Shipped',
  'Cancelled',
] as const;

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  Placed: ['Packed', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: [],
  Cancelled: [],
};

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

export interface StockMovement {
  id: number;
  productId: number;
  delta: number;
  reason: string;
  orderId: number | null;
  actorUserId: number | null;
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

export interface CreateOrderItemInput {
  productId: number;
  quantity: number;
}

export interface CreateOrderInput {
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  items: CreateOrderItemInput[];
}
