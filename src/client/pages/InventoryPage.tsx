import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { fetchProducts } from '../api';
import {
  Badge,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  StatusDot,
  Table,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Product } from '../types';
import { formatMoney, isAdmin } from '../utils/format';

export function InventoryPage() {
  useDocumentTitle('Inventory');
  const { user, pushToast } = useApp();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load inventory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pushToast]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const catOk = category === 'All' || p.category === category;
      const textOk = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      return catOk && textOk;
    });
  }, [products, search, category]);

  const admin = isAdmin(user?.role);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={
          admin
            ? 'Select a product to update price or record a stock adjustment'
            : 'Current product catalogue and stock levels'
        }
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Inventory' }]}
        actions={
          admin ? (
            <Link to="/app/inventory/new" className="btn btn-primary">
              Add product
            </Link>
          ) : undefined
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <Field id="inv-search" label="Search">
          <Input
            id="inv-search"
            placeholder="SKU or product name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field id="inv-category" label="Category">
          <Select id="inv-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loading ? (
        <Skeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No products matched"
          description="Try clearing your search or choosing another category."
        />
      ) : (
        <Table caption="Inventory catalogue">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Category</th>
              <th>Availability</th>
              <th className="num">Price</th>
              <th className="num">On hand</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={admin ? 'clickable-row' : undefined}
                onClick={admin ? () => navigate(`/app/inventory/${p.id}`) : undefined}
              >
                <td className="mono">
                  {admin ? (
                    <Link to={`/app/inventory/${p.id}`} onClick={(e) => e.stopPropagation()}>
                      {p.sku}
                    </Link>
                  ) : (
                    p.sku
                  )}
                </td>
                <td>{p.name}</td>
                <td className="muted">{p.category}</td>
                <td>
                  {p.stock === 0 ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : p.stock <= 3 ? (
                    <Badge tone="warn">Low stock</Badge>
                  ) : (
                    <StatusDot status="In stock" />
                  )}
                </td>
                <td className="num mono">{formatMoney(p.priceCents)}</td>
                <td className="num mono">{p.stock}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
