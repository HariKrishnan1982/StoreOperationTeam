import { Card, PageHeader, StatusDot, Table } from '../components';
import { useDocumentTitle } from '../guards/RouteGuards';

export function HelpPage() {
  useDocumentTitle('Help');

  return (
    <div>
      <PageHeader
        title="Help & staff guide"
        subtitle="Role permissions, order stages, keyboard shortcuts, and support"
        breadcrumbs={[{ label: 'Dashboard', to: '/app' }, { label: 'Help' }]}
      />

      <div className="form-stack" style={{ gap: 'var(--space-6)' }}>
        <Card title="Order status flow">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <StatusDot status="Placed" />
            <span className="muted">→</span>
            <StatusDot status="Packed" />
            <span className="muted">→</span>
            <StatusDot status="Shipped" />
            <span className="muted">|</span>
            <StatusDot status="Cancelled" />
            <span className="text-small muted">(Allowed from Placed or Packed with a reason)</span>
          </div>
        </Card>

        <Card title="Role permissions">
          <Table caption="Role permissions cheat-sheet">
            <thead>
              <tr>
                <th>Role</th>
                <th>Take & edit Placed orders</th>
                <th>Pack, ship & cancel</th>
                <th>Manage products & stock</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Operator</td>
                <td>Yes</td>
                <td>No</td>
                <td>Read only</td>
              </tr>
              <tr>
                <td>Warehouse</td>
                <td>No</td>
                <td>Yes</td>
                <td>Read only</td>
              </tr>
              <tr>
                <td>Admin</td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
            </tbody>
          </Table>
        </Card>

        <div className="grid-2">
          <Card title="Keyboard shortcuts">
            <ul style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
              <li>
                <strong>Tab / Shift+Tab:</strong> Move between buttons, fields, and table links.
              </li>
              <li>
                <strong>Enter / Space:</strong> Activate focused buttons, tabs, and steppers.
              </li>
              <li>
                <strong>Escape:</strong> Close confirmation dialogs without applying changes.
              </li>
            </ul>
          </Card>

          <Card title="Who to contact">
            <p className="muted">
              For account resets, role changes, or stock discrepancies, contact your store Admin on
              extension <span className="mono">4100</span> or{' '}
              <span className="mono">ops-support@store.local</span>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
