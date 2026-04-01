type ProgressProps = {
  current: number; // 1-based current step
  total?: number;
};

export default function Progress({ current, total = 5 }: ProgressProps) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);

  // compute indicator width as percentage between steps (0% at step1)
  const indicatorWidth = total > 1 ? ((current - 1) / (total - 1)) * 100 : 0;

  return (
    <div className="steps progress-component">
      <div className="progress-bar">
        <span
          className="indicator"
          style={{ width: `${indicatorWidth}%` }}
          aria-hidden
        ></span>
      </div>

      {steps.map((s) => {
        const cls =
          s < current ? "completed" : s === current ? "active" : "inactive";
        return (
          <div
            className="step"
            key={s}
            aria-current={s === current ? "step" : undefined}
          >
            <span className={`circle ${cls}`}>{s}</span>
            <p>
              {s === 1
                ? "Branches"
                : s === 2
                  ? "Information"
                  : s === 3
                    ? "Requirements"
                    : s === 4
                      ? "Confirmation"
                      : "Scholarship Exam"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
