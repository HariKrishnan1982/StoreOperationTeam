import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  adjustProductStock,
  createProduct,
  fetchProducts,
  fetchStockMovements,
  updateProduct,
} from '../api';
import {
  Badge,
  Button,
  Card,
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
import type { Product, StockMovement } from '../types';
import { formatDateTime } from '../utils/format';

export function InventoryFormPage() {
  const { id } = useParams();
  const isNew = !id;
  useDocumentTitle(isNew ? 'Add product' : `Product #${id}`);

  const { pushToast } = useApp();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Hardware');
  const [priceDollars, setPriceDollars] = useState('');
  const [initialStock, setInitialStock] = useState('0');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [adjustType, setAdjustType] = useState<'restock' | 'shrinkage'>('restock');
  const [adjustUnits, setAdjustUnits] = useState('1');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (isNew || !id) return;
    let active = true;
    const productId = Number(id);
    Promise.all([fetchProducts(), fetchStockMovements(productId)])
      .then(([list, history]) => {
        if (!active) return;
        const found = list.find((p) => p.id === productId) ?? null;
        setProduct(found);
        setMovements(history);
        if (found) {
          setSku(found.sku);
          setName(found.name);
          setCategory(found.category);
          setPriceDollars((found.priceCents / 100).toFixed(2));
        }
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load product.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, isNew, pushToast]);

  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    const parsedPrice = Math.round(Number(priceDollars) * 100);
    if (!name.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setFormError('Enter a valid product name and non-negative price.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      if (isNew) {
        if (!sku.trim()) {
          setFormError('SKU is required.');
          setSaving(false);
          return;
        }
        const stockVal = Math.max(0, Math.floor(Number(initialStock) || 0));
        const created = await createProduct({
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim() || 'General',
          priceCents: parsedPrice,
          stock: stockVal,
        });
        pushToast('success', `Added ${created.name} (${created.sku}).`);
        navigate(`/app/inventory/${created.id}`);
      } else if (product) {
        const updated = await updateProduct(product.id, {
          name: name.trim(),
          category: category.trim() || 'General',
          priceCents: parsedPrice,
        });
        setProduct(updated);
        pushToast('success', 'Product details saved.');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (e: FormEvent) => {
    e.preventDefault();
    if (!product) return;
    const units = Math.floor(Number(adjustUnits));
    if (!Number.isFinite(units) || units <= 0) {
      setAdjustError('Enter a positive whole number of units.');
      return;
    }
    if (adjustReason.trim().length < 3) {
      setAdjustError('Enter a reason (at least 3 characters).');
      return;
    }
    setAdjustError('');
    setAdjusting(true);
    try {
      const delta = adjustType === 'restock' ? units : -units;
      const updated = await adjustProductStock(product.id, delta, adjustReason.trim());
      setProduct(updated);
      setAdjustUnits('1');
      setAdjustReason('');
      const history = await fetchStockMovements(product.id);
      setMovements(history);
      pushToast('success', `Stock updated to ${updated.stock}.`);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Could not adjust stock.');
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return <Skeleton rows={6} />;
  }

  if (!isNew && !product) {
    return (
      <EmptyState
        title="Product not found"
        description="That product could not be found in the store catalogue."
        action={
          <Link to="/app/inventory" className="btn btn-primary">
            Back to inventory
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add product' : (product?.name ?? 'Edit product')}
        subtitle={isNew ? 'Create a new SKU in the store catalogue' : `SKU ${product?.sku}`}
        breadcrumbs={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Inventory', to: '/app/inventory' },
          { label: isNew ? 'Add product' : (product?.sku ?? 'Edit') },
        ]}
        actions={
          <Link to="/app/inventory" className="btn btn-secondary">
            Back to inventory
          </Link>
        }
      />

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="Product details">
          {formError ? (
            <div className="banner-alert banner-error" role="alert">
              <span>{formError}</span>
            </div>
          ) : null}
          <form className="form-stack" onSubmit={handleSaveProduct} noValidate>
            {isNew ? (
              <Field id="prod-sku" label="SKU" required>
                <Input
                  id="prod-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="SKU-108"
                />
              </Field>
            ) : null}
            <Field id="prod-name" label="Product name" required>
              <Input id="prod-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="prod-category" label="Category">
              <Input
                id="prod-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <Field id="prod-price" label="Unit price ($)" required>
              <Input
                id="prod-price"
                type="number"
                step="0.01"
                min="0"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
              />
            </Field>
            {isNew ? (
              <Field id="prod-stock" label="Opening stock">
                <Input
                  id="prod-stock"
                  type="number"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                />
              </Field>
            ) : null}
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : isNew ? 'Create product' : 'Save details'}
            </Button>
          </form>
        </Card>

        {!isNew && product ? (
          <div className="form-stack">
            <Card title="Adjust stock">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <span>Current stock on hand</span>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {product.stock}
                  </span>
                  {product.stock === 0 ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : product.stock <= 3 ? (
                    <Badge tone="warn">Low stock</Badge>
                  ) : (
                    <StatusDot status="In stock" />
                  )}
                </div>
              </div>

              {adjustError ? (
                <div className="banner-alert banner-error" role="alert">
                  <span>{adjustError}</span>
                </div>
              ) : null}

              <form className="form-stack" onSubmit={handleAdjustStock} noValidate>
                <Field id="adj-type" label="Adjustment type">
                  <Select
                    id="adj-type"
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as 'restock' | 'shrinkage')}
                  >
                    <option value="restock">Restock (add units)</option>
                    <option value="shrinkage">Shrinkage / damaged (remove units)</option>
                  </Select>
                </Field>
                <Field id="adj-units" label="Units" required>
                  <Input
                    id="adj-units"
                    type="number"
                    min="1"
                    value={adjustUnits}
                    onChange={(e) => setAdjustUnits(e.target.value)}
                  />
                </Field>
                <Field id="adj-reason" label="Reason" required>
                  <Input
                    id="adj-reason"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Weekly supplier delivery"
                  />
                </Field>
                <Button type="submit" variant="primary" disabled={adjusting}>
                  {adjusting ? 'Recording...' : 'Record stock adjustment'}
                </Button>
              </form>
            </Card>

            <Card title="Stock movement history">
              {movements.length === 0 ? (
                <p className="muted">No stock movements recorded for this item yet.</p>
              ) : (
                <Table caption="Product stock movements">
                  <thead>
                    <tr>
                      <th className="num">Change</th>
                      <th>Reason</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td className="num mono">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                        <td>{m.reason}</td>
                        <td className="text-small muted">{formatDateTime(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
