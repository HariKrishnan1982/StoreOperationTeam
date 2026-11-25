import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fetchOrders, getOrdersExportUrl } from '../api';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  StatusDot,
  Table,
  Tabs,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Order, OrdersPagination } from '../types';
import { canCreateOrders, formatDateTime, formatMoney } from '../utils/format';

type StatusTab = 'All' | 'Placed' | 'Packed' | 'Shipped' | 'Cancelled';

const STATUS_TABS: Array<{ value: StatusTab; label: string }> = [
  { value: 'All', label: 'All' },
  { value: 'Placed', label: 'Placed' },
  { value: 'Packed', label: 'Packed' },
  { value: 'Shipped', label: 'Shipped' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export function OrdersPage() {
  useDocumentTitle('Orders');
  const { user, pushToast } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = (searchParams.get('status') as StatusTab) || 'All';
  const search = searchParams.get('search') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const sortBy =
    (searchParams.get('sortBy') as 'createdAt' | 'totalCents' | 'reference' | 'status') ||
    'createdAt';
  const sortDir = (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc';
  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<OrdersPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);

  const updateParam = useCallback(
    (updates: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, val] of Object.entries(updates)) {
        if (!val || val === 'All') {
          next.delete(key);
        } else {
          next.set(key, val);
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    let active = true;
    fetchOrders({
      search,
      status,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sortBy,
      sortDir,
      page,
      pageSize: 20,
    })
      .then((res) => {
        if (!active) return;
        setOrders(res.orders);
        setPagination(res.pagination);
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, status, dateFrom, dateTo, sortBy, sortDir, page, pushToast]);

  const exportUrl = getOrdersExportUrl({
    search,
    status,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    sortDir,
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Search by order reference, caller name, or phone number"
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Orders' }]}
        actions={
          <>
            <a href={exportUrl} className="btn btn-secondary">
              Export CSV
            </a>
            {canCreateOrders(user?.role) ? (
              <Link to="/app/orders/new" className="btn btn-primary">
                New order
              </Link>
            ) : null}
          </>
        }
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <Tabs
          ariaLabel="Filter orders by status"
          items={STATUS_TABS}
          value={status}
          onChange={(nextStatus) => updateParam({ status: nextStatus, page: '1' })}
        />
      </div>

      <div className="filter-bar">
        <Field id="orders-search" label="Search">
          <Input
            id="orders-search"
            placeholder="ORD-1001, name, or phone"
            value={search}
            onChange={(e) => updateParam({ search: e.target.value, page: '1' })}
          />
        </Field>
        <Field id="orders-from" label="From date">
          <Input
            id="orders-from"
            type="date"
            value={dateFrom}
            onChange={(e) => updateParam({ dateFrom: e.target.value, page: '1' })}
          />
        </Field>
        <Field id="orders-to" label="To date">
          <Input
            id="orders-to"
            type="date"
            value={dateTo}
            onChange={(e) => updateParam({ dateTo: e.target.value, page: '1' })}
          />
        </Field>
        <Field id="orders-sort" label="Sort by">
          <Select
            id="orders-sort"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(':');
              updateParam({ sortBy: by, sortDir: dir, page: '1' });
            }}
          >
            <option value="createdAt:desc">Newest first</option>
            <option value="createdAt:asc">Oldest first</option>
            <option value="totalCents:desc">Highest total</option>
            <option value="totalCents:asc">Lowest total</option>
            <option value="reference:asc">Reference (A–Z)</option>
          </Select>
        </Field>
        <Button variant="secondary" onClick={() => setSearchParams({}, { replace: true })}>
          Clear
        </Button>
      </div>

      {loading ? (
        <Skeleton rows={6} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No matching orders"
          description="Try clearing your filters or searching with a different order reference or phone number."
          action={
            <Button onClick={() => setSearchParams({}, { replace: true })}>Reset filters</Button>
          }
        />
      ) : (
        <>
          <Table caption="Store orders">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Status</th>
                <th className="num">Items</th>
                <th className="num">Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                return (
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
                    <td>
                      <div>{order.customerName || 'Walk-in / Unlisted'}</div>
                      {order.customerPhone ? (
                        <div className="text-small muted mono">{order.customerPhone}</div>
                      ) : null}
                    </td>
                    <td>
                      <StatusDot status={order.status} />
                    </td>
                    <td className="num mono">{itemCount}</td>
                    <td className="num mono">{formatMoney(order.totalCents)}</td>
                    <td className="text-small muted">{formatDateTime(order.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={(nextPage) => updateParam({ page: String(nextPage) })}
          />
        </>
      )}
    </div>
  );
}
