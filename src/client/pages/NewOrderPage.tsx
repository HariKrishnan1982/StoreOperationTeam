import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ApiError, createOrder, fetchProducts } from '../api';
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
  Stepper,
  Table,
  Textarea,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import type { Product } from '../types';
import { formatMoney } from '../utils/format';

export function NewOrderPage() {
  useDocumentTitle('New order');
  const { pushToast } = useApp();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch((err) => {
        if (active)
          pushToast('error', err instanceof Error ? err.message : 'Could not load catalogue.');
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

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch = category === 'All' || p.category === category;
      const textMatch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [products, search, category]);

  const selectedLines = useMemo(() => {
    return products
      .filter((p) => (quantities[p.id] ?? 0) > 0)
      .map((p) => ({
        product: p,
        quantity: quantities[p.id] ?? 0,
        lineTotalCents: p.priceCents * (quantities[p.id] ?? 0),
      }));
  }, [products, quantities]);

  const grandTotalCents = selectedLines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const validatePhone = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setPhoneError('');
      return true;
    }
    if (!/^[0-9+\-\s()]{5,30}$/.test(trimmed)) {
      setPhoneError('Enter a valid phone number (5 to 30 digits/characters).');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedLines.length === 0) return;
    if (!validatePhone(customerPhone)) return;

    setSubmitting(true);
    try {
      const order = await createOrder(
        {
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          notes: notes.trim() || undefined,
          items: selectedLines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        },
        crypto.randomUUID()
      );
      pushToast('success', `Order ${order.reference} placed.`);
      navigate(`/app/orders/${order.reference}`);
    } catch (err) {
      if (err instanceof ApiError) {
        pushToast('error', err.message);
      } else {
        pushToast('error', 'Could not place the order. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New phone order"
        subtitle="Add items from the catalogue, then enter optional caller details"
        breadcrumbs={[
          { label: 'Dashboard', to: '/app' },
          { label: 'Orders', to: '/app/orders' },
          { label: 'New order' },
        ]}
      />

      {loading ? (
        <Skeleton rows={6} />
      ) : (
        <div className="new-order-layout">
          <div className="form-stack">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <Field id="catalogue-search" label="Find product">
                <Input
                  id="catalogue-search"
                  placeholder="Search by product name or SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </Field>
              <Field id="catalogue-category" label="Category">
                <Select
                  id="catalogue-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Table caption="Product catalogue">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Stock</th>
                  <th className="num">On hand</th>
                  <th className="num">Price</th>
                  <th className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const qty = quantities[p.id] ?? 0;
                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.sku}</td>
                      <td>
                        <div>{p.name}</div>
                        <div className="text-small muted">{p.category}</div>
                      </td>
                      <td>
                        {p.stock === 0 ? (
                          <Badge tone="danger">Out of stock</Badge>
                        ) : p.stock <= 3 ? (
                          <Badge tone="warn">Low stock</Badge>
                        ) : (
                          <StatusDot status="In stock" />
                        )}
                      </td>
                      <td className="num mono">{p.stock}</td>
                      <td className="num mono">{formatMoney(p.priceCents)}</td>
                      <td className="num">
                        {p.stock === 0 ? (
                          <span className="text-small muted">Unavailable</span>
                        ) : (
                          <Stepper
                            value={qty}
                            min={0}
                            max={p.stock}
                            itemName={p.name}
                            onChange={(next) =>
                              setQuantities((prev) => ({ ...prev, [p.id]: next }))
                            }
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>

          <aside className="sticky-summary">
            {selectedLines.length === 0 ? (
              <EmptyState
                title="No items added yet"
                description="Use the + buttons on the left to add in-stock products as the customer orders them."
              />
            ) : (
              <Card title="Order summary">
                <form className="form-stack" onSubmit={handleSubmit} noValidate>
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: 0,
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {selectedLines.map((line) => (
                      <li
                        key={line.product.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <span>
                          {line.quantity} × {line.product.name}
                        </span>
                        <span className="mono">{formatMoney(line.lineTotalCents)}</span>
                      </li>
                    ))}
                  </ul>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: 'var(--space-3)',
                      borderTop: '1px solid var(--border-hairline)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Total</span>
                    <span className="mono">{formatMoney(grandTotalCents)}</span>
                  </div>

                  <details>
                    <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                      Customer and notes (optional)
                    </summary>
                    <div className="form-stack" style={{ marginTop: 'var(--space-3)' }}>
                      <Field id="order-customer-name" label="Customer name">
                        <Input
                          id="order-customer-name"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="e.g. Jordan Rivera"
                        />
                      </Field>
                      <Field id="order-customer-phone" label="Phone number" error={phoneError}>
                        <Input
                          id="order-customer-phone"
                          value={customerPhone}
                          aria-invalid={phoneError ? 'true' : undefined}
                          onChange={(e) => {
                            setCustomerPhone(e.target.value);
                            if (phoneError) validatePhone(e.target.value);
                          }}
                          onBlur={(e) => validatePhone(e.target.value)}
                          placeholder="555-0142"
                        />
                      </Field>
                      <Field id="order-notes" label="Delivery or packing notes">
                        <Textarea
                          id="order-notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Leave at side counter"
                        />
                      </Field>
                    </div>
                  </details>

                  <Button type="submit" variant="primary" disabled={submitting}>
                    {submitting ? 'Placing order...' : 'Place order'}
                  </Button>
                </form>
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
