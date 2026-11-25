import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'warn' | 'danger';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const toneClass = tone === 'warn' ? 'badge-warn' : tone === 'danger' ? 'badge-danger' : '';
  return <span className={`badge ${toneClass}`.trim()}>{children}</span>;
}
