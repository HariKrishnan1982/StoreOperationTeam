import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchDashboard, fetchOrders } from '../api';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  Stat,
  StatusDot,
  Table,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { DashboardSummary, Order, OrderStatus } from '../types';
import { canCreateOrders, canFulfilOrders, formatDateTime, formatMoney } from '../utils/format';

const STATUS_ORDER: OrderStatus[] = ['Placed', 'Packed', 'Shipped', 'Cancelled'];

export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user, pushToast } = useApp();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actionOrders, setActionOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchDashboard(),
      fetchOrders({ status: 'Placed', sortBy: 'createdAt', sortDir: 'asc', pageSize: 5 }),
    ])
      .then(([dash, placed]) => {
        if (!active) return;
        setSummary(dash);
        setActionOrders(placed.orders);
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const primaryAction = canCreateOrders(user?.role) ? (
    <Link to="/app/orders/new" className="btn btn-primary">
      Take phone order
    </Link>
  ) : (
    <Link to="/app/orders?status=Placed" className="btn btn-primary">
      View orders to pack
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          summary?.storeTimezone
            ? `Today's numbers in ${summary.storeTimezone}`
            : 'Today’s store activity and items needing attention'
        }
        actions={primaryAction}
      />

      {loading || !summary ? (
        <Skeleton rows={6} />
      ) : (
        <div className="form-stack" style={{ gap: 'var(--space-6)' }}>
          <div className="grid-4">
            <Stat label="Today's orders" value={summary.todayOrdersCount} />
            <Stat label="Today's revenue" value={formatMoney(summary.todayRevenueCents)} />
            <Stat label="Orders awaiting pack" value={summary.countsByStatus.Placed} />
            <Stat
              label="Low-stock items"
              value={summary.lowStockProducts.length}
              hint={`At or below ${summary.lowStockThreshold} units`}
            />
          </div>

          <div className="grid-2">
            <Card
              title={
                canFulfilOrders(user?.role) ? 'Ready to pack (Placed)' : 'Recent Placed orders'
              }
            >
              {actionOrders.length === 0 ? (
                <EmptyState
                  title="Queue is clear"
                  description="No Placed orders are waiting right now."
                />
              ) : (
                <Table caption="Orders awaiting action">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th className="num">Total</th>
                      <th>Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="clickable-row"
                        onClick={() => navigate(`/app/orders/${order.reference}`)}
                      >
                        <td className="mono">
                          <Link
                            to={`/app/orders/${order.reference}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {order.reference}
                          </Link>
                        </td>
                        <td>{order.customerName || 'Walk-in / Unlisted'}</td>
                        <td className="num mono">{formatMoney(order.totalCents)}</td>
                        <td className="text-small muted">{formatDateTime(order.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <Card title="Orders by status">
              <Table caption="Order counts by status">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th className="num">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {STATUS_ORDER.map((status) => (
                    <tr key={status}>
                      <td>
                        {status === 'Cancelled' && summary.countsByStatus[status] === 0 ? (
                          <span className="status-dot">
                            <span
                              className="status-dot-circle status-dot-cancelled"
                              aria-hidden="true"
                            />
                            <span>Cancelled</span>
                          </span>
                        ) : (
                          <StatusDot status={status} />
                        )}
                      </td>
                      <td className="num mono">{summary.countsByStatus[status]}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card title="Low-stock watch">
            {summary.lowStockProducts.length === 0 ? (
              <EmptyState
                title="Stock levels look healthy"
                description="No products are at or below the low-stock threshold."
              />
            ) : (
              <Table caption="Low stock products">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Status</th>
                    <th className="num">On hand</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.lowStockProducts.map((p) => (
                    <tr
                      key={p.id}
                      className="clickable-row"
                      onClick={() =>
                        navigate(
                          user?.role === 'Admin' ? `/app/inventory/${p.id}` : '/app/inventory'
                        )
                      }
                    >
                      <td className="mono">{p.sku}</td>
                      <td>{p.name}</td>
                      <td>
                        {p.stock === 0 ? (
                          <Badge tone="danger">Out of stock</Badge>
                        ) : (
                          <Badge tone="warn">Low stock</Badge>
                        )}
                      </td>
                      <td className="num mono">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
