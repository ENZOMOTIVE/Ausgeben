import type { CSSProperties } from "react";
import { formatCurrency, formatMonth } from "@/lib/formatters";
import type { MonthlySummary } from "@/types/expense";

type MonthlyArchiveProps = {
  summaries: MonthlySummary[];
  isReady: boolean;
};

export function MonthlyArchive({ summaries, isReady }: MonthlyArchiveProps) {
  return (
    <section className="monthly-archive" aria-labelledby="archive-title">
      <div className="archive-heading">
        <div>
          <p className="eyebrow">Monthly archive</p>
          <h2 id="archive-title">Past months</h2>
        </div>
        <p>One total stays when a month closes.</p>
      </div>

      {!isReady ? (
        <div className="archive-loading" role="status" aria-label="Loading past months">
          <span />
          <span />
        </div>
      ) : summaries.length === 0 ? (
        <div className="archive-empty">
          <span className="archive-empty-mark" aria-hidden="true">↙</span>
          <div>
            <h3>No closed months yet</h3>
            <p>Your first monthly total will appear here automatically.</p>
          </div>
        </div>
      ) : (
        <ol className="archive-list">
          {summaries.map((summary, index) => (
            <li key={summary.monthKey} style={{ "--archive-index": index } as CSSProperties}>
              <span className="archive-month-mark" aria-hidden="true">
                {formatMonth(summary.monthKey).charAt(0)}
              </span>
              <span className="archive-month-copy">
                <time dateTime={summary.monthKey}>{formatMonth(summary.monthKey)}</time>
                <small>Closed month</small>
              </span>
              <strong>{formatCurrency(summary.totalCents)}</strong>
              <span className="sr-only">from {summary.expenseCount} expenses</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
