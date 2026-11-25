export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function canCreateOrders(role?: string): boolean {
  return role === 'Admin' || role === 'Operator';
}

export function canFulfilOrders(role?: string): boolean {
  return role === 'Admin' || role === 'Warehouse';
}

export function isAdmin(role?: string): boolean {
  return role === 'Admin';
}
