function Line({ size }: { size: "heading" | "title" | "meta" | "short" }) {
  return <span className={`sales-skeleton__line sales-skeleton__line--${size}`} aria-hidden="true" />;
}

function Card({ lines = 2 }: { lines?: number }) {
  return (
    <div className="visit-skeleton__card" aria-hidden="true">
      <Line size="title" />
      {Array.from({ length: lines }, (_, index) => (
        <Line key={index} size={index === lines - 1 ? "short" : "meta"} />
      ))}
    </div>
  );
}

/**
 * Placeholder for the project pane. It mirrors the real visit screen (header
 * band and the stacked form cards) so the page doesn't jump on load.
 */
export function VisitSkeleton() {
  return (
    <div className="visit-skeleton" aria-busy="true">
      <p className="visually-hidden" role="status">
        Opening the project
      </p>
      <div className="visit-skeleton__banner" aria-hidden="true">
        <span className="sales-skeleton__line sales-skeleton__line--heading" />
      </div>
      <div className="visit-skeleton__body">
        <div className="visit-skeleton__column">
          <Card lines={4} />
          <Card lines={2} />
          <Card lines={2} />
          <Card lines={3} />
        </div>
      </div>
    </div>
  );
}
