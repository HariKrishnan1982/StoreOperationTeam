import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ title, compact = false, className = '', children }: CardProps) {
  return (
    <section className={`card ${compact ? 'card-compact' : ''} ${className}`.trim()}>
      {title ? <h2 className="card-title">{title}</h2> : null}
      {children}
    </section>
  );
}
