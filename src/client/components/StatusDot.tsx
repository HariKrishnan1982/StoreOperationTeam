import type { OrderStatus } from '../types';
import { Badge } from './Badge';

export interface StatusDotProps {
  status: OrderStatus | 'In stock';
}

export function StatusDot({ status }: StatusDotProps) {
  if (status === 'Cancelled') {
    return <Badge tone="danger">Cancelled</Badge>;
  }

  const dotClass =
    status === 'Placed'
      ? 'status-dot-placed'
      : status === 'Packed'
        ? 'status-dot-packed'
        : status === 'Shipped'
          ? 'status-dot-shipped'
          : 'status-dot-instock';

  return (
    <span className="status-dot">
      <span className={`status-dot-circle ${dotClass}`} aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
