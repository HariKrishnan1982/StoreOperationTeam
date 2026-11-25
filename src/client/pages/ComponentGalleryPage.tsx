import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Stat,
  StatusDot,
  Stepper,
  Table,
  Tabs,
  Textarea,
  Timeline,
} from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';

export function ComponentGalleryPage() {
  useDocumentTitle('Component gallery');
  const { pushToast } = useApp();
  const [tab, setTab] = useState<'one' | 'two'>('one');
  const [qty, setQty] = useState(2);
  const [checked, setChecked] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Component gallery"
        subtitle="Development preview of all shared primitives"
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Components' }]}
        actions={
          <Button variant="primary" onClick={() => pushToast('success', 'Sample toast message.')}>
            Trigger toast
          </Button>
        }
      />

      <div className="form-stack" style={{ gap: 'var(--space-6)' }}>
        <Card title="Buttons & IconButton">
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <Button variant="primary">Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <IconButton label="Add item">
              <Plus size={16} aria-hidden="true" />
            </IconButton>
            <Stepper value={qty} min={0} max={10} itemName="Sample item" onChange={setQty} />
          </div>
        </Card>

        <Card title="StatusDot & Badges">
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <StatusDot status="Placed" />
            <StatusDot status="Packed" />
            <StatusDot status="Shipped" />
            <StatusDot status="Cancelled" />
            <Badge tone="warn">Low stock</Badge>
            <Badge tone="danger">Out of stock</Badge>
          </div>
        </Card>

        <Card title="Form Controls">
          <div className="grid-3">
            <Field id="gal-input" label="Text input" hint="Helper hint">
              <Input id="gal-input" placeholder="ORD-1001" />
            </Field>
            <Field id="gal-select" label="Select">
              <Select id="gal-select">
                <option>Hardware</option>
                <option>Supplies</option>
              </Select>
            </Field>
            <Field id="gal-err" label="With error" error="Phone number is required.">
              <Input id="gal-err" aria-invalid="true" defaultValue="abc" />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Field id="gal-ta" label="Notes">
              <Textarea id="gal-ta" placeholder="Optional delivery notes" />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Checkbox
              id="gal-cb"
              label="Confirm stock check"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
          </div>
        </Card>

        <Card title="Tabs, Table & Pagination">
          <Tabs
            ariaLabel="Gallery tabs"
            items={[
              { value: 'one', label: 'Tab one' },
              { value: 'two', label: 'Tab two' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Table caption="Sample table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">ORD-1001</td>
                  <td>
                    <StatusDot status="Placed" />
                  </td>
                  <td className="num mono">$89.00</td>
                </tr>
              </tbody>
            </Table>
            <Pagination page={1} totalPages={3} total={42} onPageChange={() => {}} />
          </div>
        </Card>

        <div className="grid-2">
          <Stat label="Today's orders" value={14} hint="Sample stat card" />
          <EmptyState
            title="Empty state preview"
            description="Used when a queue or filter has no matching items."
            action={<Button onClick={() => setDialogOpen(true)}>Open ConfirmDialog</Button>}
          />
        </div>

        <div className="grid-2">
          <Skeleton rows={3} />
          <Card title="Timeline">
            <Timeline
              events={[
                {
                  id: 1,
                  orderId: 1,
                  fromStatus: null,
                  toStatus: 'Placed',
                  actorUserId: 1,
                  actorUsername: 'operator',
                  reason: null,
                  createdAt: new Date().toISOString(),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={dialogOpen}
        title="Confirm action?"
        message="This demonstrates focus trap and Escape key handling."
        confirmLabel="Confirm"
        onConfirm={() => setDialogOpen(false)}
        onCancel={() => setDialogOpen(false)}
      />
    </div>
  );
}
