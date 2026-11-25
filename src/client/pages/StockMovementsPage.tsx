import { useEffect, useMemo, useState } from 'react';
import { fetchProducts, fetchStockMovements } from '../api';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Product, StockMovement } from '../types';
import { formatDateTime } from '../utils/format';

export function StockMovementsPage() {
  useDocumentTitle('Stock log');
  const { pushToast } = useApp();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productId, setProductId] = useState('All');
  const [reasonQuery, setReasonQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([fetchStockMovements(), fetchProducts()])
      .then(([movs, prods]) => {
        if (!active) return;
        setMovements(movs);
        setProducts(prods);
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load stock log.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const productMap = useMemo(() => {
    const map = new Map<number, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = reasonQuery.trim().toLowerCase();
    return movements.filter((m) => {
      const prodOk = productId === 'All' || m.productId === Number(productId);
      const reasonOk = !q || m.reason.toLowerCase().includes(q);
      const dateOk = !dateFilter || m.createdAt.slice(0, 10) === dateFilter;
      return prodOk && reasonOk && dateOk;
    });
  }, [movements, productId, reasonQuery, dateFilter]);

  return (
    <div>
      <PageHeader
        title="Stock movement log"
        subtitle="Audit trail of every stock addition, order deduction, and adjustment"
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Stock log' }]}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr auto',
          gap: 'var(--space-3)',
          alignItems: 'end',
          marginBottom: 'var(--space-4)',
        }}
      >
        <Field id="log-product" label="Product">
          <Select id="log-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="All">All products</option>
            {products.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.sku} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="log-reason" label="Reason">
          <Input
            id="log-reason"
            placeholder="Filter by reason"
            value={reasonQuery}
            onChange={(e) => setReasonQuery(e.target.value)}
          />
        </Field>
        <Field id="log-date" label="Date">
          <Input
            id="log-date"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </Field>
        <Button
          variant="ghost"
          onClick={() => {
            setProductId('All');
            setReasonQuery('');
            setDateFilter('');
          }}
        >
          Clear
        </Button>
      </div>

      {loading ? (
        <Skeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching stock movements"
          description="Try clearing the product, reason, or date filters."
        />
      ) : (
        <Table caption="Stock movements">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th className="num">Change</th>
              <th>Reason</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const prod = productMap.get(m.productId);
              return (
                <tr key={m.id}>
                  <td className="mono">{prod?.sku ?? `#${m.productId}`}</td>
                  <td>{prod?.name ?? 'Unknown product'}</td>
                  <td className="num mono">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td>{m.reason}</td>
                  <td className="text-small muted">{formatDateTime(m.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
