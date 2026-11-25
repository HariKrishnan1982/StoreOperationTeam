import type { OrderEvent } from '../types';
import { StatusDot } from './StatusDot';

export interface TimelineProps {
  events: OrderEvent[];
}

export function Timeline({ events }: TimelineProps) {
  if (events.length === 0) {
    return <p className="muted">No status changes recorded yet.</p>;
  }

  return (
    <ol className="timeline">
      {events.map((ev) => (
        <li key={ev.id} className="timeline-item">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              <StatusDot status={ev.toStatus} />
              <span className="text-small muted">
                by {ev.actorUsername || 'system'} · {new Date(ev.createdAt).toLocaleString()}
              </span>
            </div>
            {ev.reason ? <p className="text-small muted">Reason: {ev.reason}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
