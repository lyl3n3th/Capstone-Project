type SkeletonPageVariant = "dashboard" | "table" | "form" | "upload";

interface SkeletonPageProps {
  className?: string;
  eyebrow?: string;
  title?: string;
  variant?: SkeletonPageVariant;
}

const SkeletonLine = ({ className = "" }: { className?: string }) => (
  <span className={`skeleton-line ${className}`} />
);

const SkeletonCard = ({ lines = 2 }: { lines?: number }) => (
  <article className="skeleton-card">
    <span className="skeleton-icon" />
    {Array.from({ length: lines }).map((_, index) => (
      <SkeletonLine
        className={index === 0 ? "short" : "medium"}
        key={`card-line-${index}`}
      />
    ))}
  </article>
);

const SkeletonTable = () => (
  <div className="skeleton-table-card">
    <div className="skeleton-table-header">
      <SkeletonLine className="short" />
      <SkeletonLine className="medium" />
      <SkeletonLine className="short" />
    </div>
    {Array.from({ length: 5 }).map((_, rowIndex) => (
      <div className="skeleton-table-row" key={`skeleton-row-${rowIndex}`}>
        <SkeletonLine className="short" />
        <SkeletonLine className="long" />
        <SkeletonLine className="medium" />
      </div>
    ))}
  </div>
);

export default function SkeletonPage({
  className = "",
  eyebrow = "Loading",
  title = "Preparing page",
  variant = "dashboard",
}: SkeletonPageProps) {
  return (
    <div className={`skeleton-page ${className}`.trim()} aria-busy="true">
      <header className="skeleton-page-header">
        <div>
          <SkeletonLine className="eyebrow" />
          <SkeletonLine className="title" />
        </div>
        <span className="skeleton-pill" />
      </header>
      <span className="sr-only">
        {eyebrow}: {title}
      </span>

      {variant === "dashboard" ? (
        <>
          <section className="skeleton-grid skeleton-grid-three">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </section>
          <section className="skeleton-grid skeleton-grid-two">
            <div className="skeleton-panel-large">
              <SkeletonLine className="medium" />
              <span className="skeleton-chart" />
            </div>
            <div className="skeleton-panel-large">
              <SkeletonLine className="medium" />
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine className="short" />
            </div>
          </section>
        </>
      ) : null}

      {variant === "table" ? (
        <>
          <section className="skeleton-filter-row">
            <SkeletonLine />
            <SkeletonLine />
            <SkeletonLine />
          </section>
          <SkeletonTable />
        </>
      ) : null}

      {variant === "upload" ? (
        <>
          <section className="skeleton-action-row">
            <SkeletonLine />
            <SkeletonLine />
          </section>
          <SkeletonTable />
        </>
      ) : null}

      {variant === "form" ? (
        <section className="skeleton-form-card">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonLine
              className={index % 3 === 0 ? "long" : "medium"}
              key={`form-line-${index}`}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
