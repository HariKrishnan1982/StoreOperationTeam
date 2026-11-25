import { Link } from 'react-router';
import { Card, StatusDot } from '../components';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../guards/RouteGuards';
import { PublicLayout } from '../layouts/PublicLayout';

export function HomePage() {
  useDocumentTitle('Phone order intake & warehouse fulfilment');
  const { user } = useApp();

  return (
    <PublicLayout>
      <div className="public-container">
        <section className="hero-grid" aria-labelledby="hero-heading">
          <div>
            <h1 id="hero-heading" className="hero-title" tabIndex={-1}>
              Take phone orders and ship stock without spreadsheet guesswork.
            </h1>
            <p className="hero-copy">
              Store Ops Console gives counter operators and warehouse packers one shared desk. Stock
              updates as soon as an order is placed, every status change is recorded, and packing
              slips print cleanly.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Link to={user ? '/app' : '/login'} className="btn btn-primary btn-lg">
                {user ? 'Open console' : 'Sign in'}
              </Link>
              <a href="#how-it-works" className="btn btn-secondary btn-lg">
                How it works
              </a>
            </div>
          </div>

          <div className="preview-mockup" aria-label="Sample order queue preview">
            <div className="preview-mockup-bar">
              <span>Orders queue</span>
              <span className="mono">3 active</span>
            </div>
            <div className="preview-mockup-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr auto',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <span className="mono">ORD-1042</span>
                <StatusDot status="Placed" />
                <span className="num mono">$178.00</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr auto',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <span className="mono">ORD-1041</span>
                <StatusDot status="Packed" />
                <span className="num mono">$64.50</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr auto',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <span className="mono">ORD-1040</span>
                <StatusDot status="Shipped" />
                <span className="num mono">$145.00</span>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading">
          <h2
            id="how-heading"
            className="page-title"
            style={{ fontSize: '1.375rem', marginBottom: 'var(--space-4)' }}
          >
            How it works
          </h2>
          <div className="grid-3">
            <div className="editorial-step">
              <h3 className="card-title">1. Take the phone order</h3>
              <p className="muted">
                Operators pick in-stock items while on the call, see the live total, and reserve
                stock the moment the order is placed.
              </p>
            </div>
            <div className="editorial-step">
              <h3 className="card-title">2. Pack in the warehouse</h3>
              <p className="muted">
                Warehouse staff work through Placed orders, print a clean packing slip, and mark
                boxes as Packed.
              </p>
            </div>
            <div className="editorial-step">
              <h3 className="card-title">3. Ship or cancel cleanly</h3>
              <p className="muted">
                Mark orders Shipped when they leave the dock. If a customer cancels before shipping,
                stock returns to the shelf with a reason logged.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="roles-heading">
          <h2
            id="roles-heading"
            className="page-title"
            style={{ fontSize: '1.375rem', marginBottom: 'var(--space-4)' }}
          >
            Built around three store roles
          </h2>
          <div className="grid-3">
            <Card>
              <h3 className="card-title">Operator</h3>
              <p className="muted">
                Takes phone orders, edits Placed orders before packing starts, looks up caller
                history, and exports order lists.
              </p>
            </Card>
            <Card>
              <h3 className="card-title">Warehouse</h3>
              <p className="muted">
                Reviews incoming orders, prints packing slips, marks orders Packed and Shipped, and
                cancels orders with a reason.
              </p>
            </Card>
            <Card>
              <h3 className="card-title">Admin</h3>
              <p className="muted">
                Full order and fulfilment access plus catalogue management, pricing updates, and
                stock restock or shrinkage adjustments.
              </p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="trust-heading">
          <h2
            id="trust-heading"
            className="page-title"
            style={{ fontSize: '1.375rem', marginBottom: 'var(--space-4)' }}
          >
            Reliable by design
          </h2>
          <div className="grid-2">
            <Card compact>
              <h3 className="card-title">Stock never goes negative</h3>
              <p className="muted">
                Concurrent phone orders for the last item on the shelf are checked safely so two
                staff members cannot oversell the same unit.
              </p>
            </Card>
            <Card compact>
              <h3 className="card-title">Complete audit trail</h3>
              <p className="muted">
                Every status change and stock adjustment records who acted, when it happened, and
                why.
              </p>
            </Card>
            <Card compact>
              <h3 className="card-title">Role-based access</h3>
              <p className="muted">
                Staff only see and run actions permitted for their role, backed by signed-in
                sessions.
              </p>
            </Card>
            <Card compact>
              <h3 className="card-title">Consistent backups</h3>
              <p className="muted">
                Store records persist in local SQLite storage with automated snapshot backups and a
                tested restore path.
              </p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="faq-heading">
          <h2
            id="faq-heading"
            className="page-title"
            style={{ fontSize: '1.375rem', marginBottom: 'var(--space-4)' }}
          >
            Common questions
          </h2>
          <div className="grid-2">
            <div className="faq-item">
              <h3 className="card-title">Can an order be edited after it is placed?</h3>
              <p className="muted">
                Yes. Operators and Admins can adjust quantities or items while an order is still in
                Placed status.
              </p>
            </div>
            <div className="faq-item">
              <h3 className="card-title">What happens when an order is cancelled?</h3>
              <p className="muted">
                Cancelling requires a short reason and automatically returns all reserved items back
                into available stock once.
              </p>
            </div>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
