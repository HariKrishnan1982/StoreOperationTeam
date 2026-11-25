import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  ApiError,
  editOrder,
  fetchOrderByReference,
  fetchProducts,
  transitionOrderStatus,
} from '../api';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  Stepper,
  Table,
  Timeline,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Order, Product } from '../types';
import { canCreateOrders, canFulfilOrders, formatDateTime, formatMoney } from '../utils/format';

export function OrderDetailPage() {
  const { reference = '' } = useParams();
  useDocumentTitle(`Order ${reference}`);
  const { user, pushToast } = useApp();

  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editQuantities, setEditQuantities] = useState<Record<number, number>>({});

  const [shipConfirmOpen, setShipConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    setConflict(false);
    try {
      const loaded = await fetchOrderByReference(reference);
      if (!loaded) {
        setNotFound(true);
        setOrder(null);
      } else {
        setOrder(loaded);
      }
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not load order.');
    } finally {
      setLoading(false);
    }
  }, [reference, pushToast]);

  useEffect(() => {
    let active = true;
    fetchOrderByReference(reference)
      .then((loaded) => {
        if (!active) return;
        if (!loaded) {
          setNotFound(true);
          setOrder(null);
        } else {
          setNotFound(false);
          setConflict(false);
          setOrder(loaded);
        }
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load order.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reference, pushToast]);

  const startEditing = async () => {
    if (!order) return;
    try {
      const catalogue = await fetchProducts();
      setProducts(catalogue);
      const map: Record<number, number> = {};
      for (const item of order.items) {
        map[item.productId] = item.quantity;
      }
      setEditQuantities(map);
      setEditing(true);
    } catch {
      pushToast('error', 'Could not load product catalogue for editing.');
    }
  };

  const handleSaveEdit = async () => {
    if (!order) return;
    const items = Object.entries(editQuantities)
      .map(([productId, quantity]) => ({ productId: Number(productId), quantity }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      pushToast('error', 'Keep at least one item in the order or cancel it instead.');
      return;
    }

    setBusy(true);
    try {
      const updated = await editOrder(order.id, {
        customerName: order.customerName ?? undefined,
        customerPhone: order.customerPhone ?? undefined,
        notes: order.notes ?? undefined,
        items,
        expectedVersion: order.version,
      });
      setOrder(updated);
      setEditing(false);
      pushToast('success', 'Order items updated.');
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.code === 'OPTIMISTIC_LOCK_CONFLICT'
      ) {
        setConflict(true);
      } else {
        pushToast('error', err instanceof Error ? err.message : 'Could not update order.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTransition = async (
    nextStatus: 'Packed' | 'Shipped' | 'Cancelled',
    reason?: string
  ) => {
    if (!order) return;
    setBusy(true);
    try {
      const updated = await transitionOrderStatus(order.id, nextStatus, {
        reason,
        expectedVersion: order.version,
      });
      setOrder(updated);
      setShipConfirmOpen(false);
      setCancelConfirmOpen(false);
      pushToast('success', `Order ${updated.reference} marked as ${updated.status}.`);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.code === 'OPTIMISTIC_LOCK_CONFLICT'
      ) {
        setConflict(true);
        setShipConfirmOpen(false);
        setCancelConfirmOpen(false);
      } else {
        pushToast('error', err instanceof Error ? err.message : 'Could not update order status.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Skeleton rows={6} />;
  }

  if (notFound || !order) {
    return (
      <EmptyState
        title="Order not found"
        description={`No order matched reference ${reference}.`}
        action={
          <Link to="/app/orders" className="btn btn-primary">
            Back to orders
          </Link>
        }
      />
    );
  }

  const canFulfil = canFulfilOrders(user?.role);
  const canEdit = canCreateOrders(user?.role) && order.status === 'Placed';
  const canCancel = canFulfil && (order.status === 'Placed' || order.status === 'Packed');

  const primaryAction =
    canFulfil && order.status === 'Placed' ? (
      <Button variant="primary" disabled={busy} onClick={() => handleTransition('Packed')}>
        Mark as packed
      </Button>
    ) : canFulfil && order.status === 'Packed' ? (
      <Button variant="primary" disabled={busy} onClick={() => setShipConfirmOpen(true)}>
        Mark as shipped
      </Button>
    ) : canEdit && !editing ? (
      <Button variant="primary" onClick={startEditing}>
        Edit order
      </Button>
    ) : null;

  return (
    <div>
      <PageHeader
        title={`Order ${order.reference}`}
        subtitle={`${order.status} · Placed ${formatDateTime(order.createdAt)} · Revision ${order.version}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Orders', to: '/app/orders' },
          { label: order.reference },
        ]}
        actions={
          <>
            <Link to={`/app/orders/${order.reference}/packing-slip`} className="btn btn-secondary">
              Print packing slip
            </Link>
            {canEdit && canFulfil && !editing ? (
              <Button variant="secondary" onClick={startEditing}>
                Edit items
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                variant="secondary"
                style={{
                  color: 'var(--badge-danger-ink)',
                  borderColor: 'var(--badge-danger-border)',
                }}
                disabled={busy}
                onClick={() => setCancelConfirmOpen(true)}
              >
                Cancel order
              </Button>
            ) : null}
            {primaryAction}
          </>
        }
      />

      {conflict ? (
        <div className="banner-alert" role="alert">
          <span>
            This order changed while you were viewing it. Reload to see the latest details.
          </span>
          <Button size="sm" onClick={() => void loadOrder()}>
            Reload order
          </Button>
        </div>
      ) : null}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="form-stack">
          <Card title="Items">
            {editing ? (
              <div className="form-stack">
                <Table caption="Edit order item quantities">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th className="num">Price</th>
                      <th className="num">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const existingQty =
                        order.items.find((i) => i.productId === p.id)?.quantity ?? 0;
                      const maxQty = p.stock + existingQty;
                      const qty = editQuantities[p.id] ?? 0;
                      return (
                        <tr key={p.id}>
                          <td className="mono">{p.sku}</td>
                          <td>{p.name}</td>
                          <td className="num mono">{formatMoney(p.priceCents)}</td>
                          <td className="num">
                            <Stepper
                              value={qty}
                              min={0}
                              max={maxQty}
                              itemName={p.name}
                              onChange={(next) =>
                                setEditQuantities((prev) => ({ ...prev, [p.id]: next }))
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                  <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
                    Discard changes
                  </Button>
                  <Button variant="primary" onClick={handleSaveEdit} disabled={busy}>
                    {busy ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              </div>
            ) : (
              <Table caption="Order line items">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th className="num">Unit</th>
                    <th className="num">Qty</th>
                    <th className="num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{item.sku}</td>
                      <td>{item.productName}</td>
                      <td className="num mono">{formatMoney(item.unitPriceCents)}</td>
                      <td className="num mono">{item.quantity}</td>
                      <td className="num mono">{formatMoney(item.lineTotalCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} style={{ fontWeight: 600 }}>
                      Order total
                    </td>
                    <td className="num mono" style={{ fontWeight: 600 }}>
                      {formatMoney(order.totalCents)}
                    </td>
                  </tr>
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Customer & notes">
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: '140px 1fr',
                gap: 'var(--space-2)',
                margin: 0,
              }}
            >
              <dt className="muted">Customer</dt>
              <dd style={{ margin: 0 }}>{order.customerName || 'Walk-in / Unlisted'}</dd>
              <dt className="muted">Phone</dt>
              <dd className="mono" style={{ margin: 0 }}>
                {order.customerPhone || '—'}
              </dd>
              <dt className="muted">Notes</dt>
              <dd style={{ margin: 0 }}>{order.notes || '—'}</dd>
            </dl>
          </Card>
        </div>

        <Card title="Status timeline">
          <Timeline events={order.events} />
        </Card>
      </div>

      <ConfirmDialog
        open={shipConfirmOpen}
        title={`Ship order ${order.reference}?`}
        message="Confirm the parcel is packed and ready to leave the store."
        confirmLabel="Mark as shipped"
        busy={busy}
        onConfirm={() => void handleTransition('Shipped')}
        onCancel={() => setShipConfirmOpen(false)}
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        title={`Cancel order ${order.reference}?`}
        message="All reserved items will be returned to available stock."
        confirmLabel="Cancel order"
        danger
        requireReason
        reasonLabel="Cancellation reason"
        reasonPlaceholder="e.g. Customer called to cancel"
        busy={busy}
        onConfirm={(reason) => void handleTransition('Cancelled', reason)}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </div>
  );
}
