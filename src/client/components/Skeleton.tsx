export interface SkeletonProps {
  rows?: number;
}

export function Skeleton({ rows = 4 }: SkeletonProps) {
  return (
    <div className="card form-stack" aria-busy="true" aria-label="Loading content">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: i === 0 ? '45%' : i % 2 === 0 ? '85%' : '100%' }}
        />
      ))}
    </div>
  );
}
