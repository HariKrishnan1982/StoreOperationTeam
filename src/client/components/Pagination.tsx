import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return (
    <div className="pagination">
      <span>
        {totalPages <= 1
          ? `${total} ${total === 1 ? 'order' : 'orders'}`
          : `Page ${page} of ${totalPages} (${total} total)`}
      </span>
      {totalPages > 1 ? (
        <div className="pagination-controls">
          <Button size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
