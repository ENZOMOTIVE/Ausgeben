import { sumExpenses } from "@/lib/expenses";
import {
  formatCurrency,
  formatExpenseCount,
  formatMonth,
} from "@/lib/formatters";
import type { Expense } from "@/types/expense";

type SpendingSummaryProps = {
  monthKey: string;
  monthExpenses: Expense[];
  todayExpenses: Expense[];
  canGoForward: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
};

export function SpendingSummary({
  monthKey,
  monthExpenses,
  todayExpenses,
  canGoForward,
  onPreviousMonth,
  onNextMonth,
}: SpendingSummaryProps) {
  const monthTotal = sumExpenses(monthExpenses);
  const todayTotal = sumExpenses(todayExpenses);
  const activeDays = new Set(monthExpenses.map((expense) => expense.date)).size;
  const averagePerActiveDay = activeDays > 0 ? Math.round(monthTotal / activeDays) : 0;

  return (
    <section className="summary-grid" aria-label="Spending summary">
      <div className="month-card">
        <div className="month-card-glow" aria-hidden="true" />
        <div className="month-card-topline">
          <p>Spent in</p>
          <div className="month-navigation">
            <button type="button" onClick={onPreviousMonth}>
              <span aria-hidden="true">‹</span>
              <span className="sr-only">Previous month</span>
            </button>
            <button type="button" onClick={onNextMonth} disabled={!canGoForward}>
              <span aria-hidden="true">›</span>
              <span className="sr-only">Next month</span>
            </button>
          </div>
        </div>
        <h2>{formatMonth(monthKey)}</h2>
        <p className="month-total">{formatCurrency(monthTotal)}</p>
        <div className="month-meta">
          <span>{formatExpenseCount(monthExpenses.length)}</span>
          <span aria-hidden="true">·</span>
          <span>{activeDays} {activeDays === 1 ? "day" : "days"} tracked</span>
        </div>
        <div className="daily-average">
          <span>Average per active day</span>
          <strong>{formatCurrency(averagePerActiveDay)}</strong>
        </div>
      </div>

      <div className="today-card">
        <div className="today-card-heading">
          <span className="today-dot" aria-hidden="true" />
          <p>Today</p>
        </div>
        <p className="today-total">{formatCurrency(todayTotal)}</p>
        <p>{formatExpenseCount(todayExpenses.length)} recorded</p>
        <div className="today-rule" aria-hidden="true" />
        <p className="today-note">
          {todayExpenses.length > 0
            ? "You’re up to date."
            : "Nothing logged today."}
        </p>
      </div>
    </section>
  );
}
