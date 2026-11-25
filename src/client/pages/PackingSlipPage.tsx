import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fetchOrderByReference } from '../api';
import { Button, EmptyState, Skeleton, Table } from '../components';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Order } from '../types';
import { formatDateTime, formatMoney } from '../utils/format';

export function PackingSlipPage() {
  const { reference = '' } = useParams();
  useDocumentTitle(`Packing slip ${reference}`);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchOrderByReference(reference)
      .then((res) => {
        if (active) setOrder(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reference]);

  if (loading) {
    return (
      <div className="packing-slip-sheet">
        <Skeleton rows={5} />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="packing-slip-sheet">
        <EmptyState
          title="Packing slip unavailable"
          description={`Could not find order ${reference}.`}
          action={
            <Link to="/app/orders" className="btn btn-primary">
              Back to orders
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <main className="packing-slip-sheet">
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
        }}
      >
        <Link to={`/app/orders/${order.reference}`} className="btn btn-secondary">
          Back to order
        </Link>
        <Button variant="primary" onClick={() => window.print()}>
          Print packing slip
        </Button>
      </div>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--border-strong)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div>
          <p className="text-small muted">STORE OPS CONSOLE · PACKING SLIP</p>
          <h1 className="page-title" tabIndex={-1}>
            {order.reference}
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="text-small muted">Placed {formatDateTime(order.createdAt)}</div>
          <div style={{ fontWeight: 600 }}>Status: {order.status}</div>
        </div>
      </header>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <p>
          <strong>Customer:</strong> {order.customerName || 'Walk-in / Unlisted'}
        </p>
        {order.customerPhone ? (
          <p>
            <strong>Phone:</strong> <span className="mono">{order.customerPhone}</span>
          </p>
        ) : null}
        {order.notes ? (
          <p>
            <strong>Notes:</strong> {order.notes}
          </p>
        ) : null}
      </div>

      <Table caption="Packing slip items">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Line total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td className="mono">{item.sku}</td>
              <td>{item.productName}</td>
              <td className="num mono">{item.quantity}</td>
              <td className="num mono">{formatMoney(item.unitPriceCents)}</td>
              <td className="num mono">{formatMoney(item.lineTotalCents)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4} style={{ fontWeight: 600 }}>
              Total
            </td>
            <td className="num mono" style={{ fontWeight: 600 }}>
              {formatMoney(order.totalCents)}
            </td>
          </tr>
        </tbody>
      </Table>
    </main>
  );
}
