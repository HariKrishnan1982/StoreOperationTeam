import type { ReactNode } from 'react';

export interface TableProps {
  caption?: string;
  children: ReactNode;
}

export function Table({ caption, children }: TableProps) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}
