import {
  formatCurrency,
  formatExpenseCount,
  formatMonth,
} from "@/lib/formatters";
import type { Expense, UserId, UserTotals } from "@/types/expense";

type SpendingSummaryProps = {
  monthKey: string;
  monthExpenses: Expense[];
  monthTotals?: UserTotals;
  todayTotals?: UserTotals;
  currentUserId: UserId;
  isReady: boolean;
};

type PersonTotalProps = {
  name: "Aayushman" | "Carlin";
  userId: UserId;
  amountCents: number;
  isCurrentUser: boolean;
};

function PersonTotal({
  name,
  userId,
  amountCents,
  isCurrentUser,
}: PersonTotalProps) {
  return (
    <div className="person-total">
      <span className={`person-total-avatar person-total-avatar-${userId}`} aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span className="person-total-copy">
        <small>{name}{isCurrentUser ? " · you" : ""}</small>
        <strong>{formatCurrency(amountCents)}</strong>
      </span>
    </div>
  );
}

export function SpendingSummary({
  monthKey,
  monthExpenses,
  monthTotals,
  todayTotals,
  currentUserId,
  isReady,
}: SpendingSummaryProps) {
  if (!isReady || !monthTotals || !todayTotals) {
    return (
      <section className="summary-grid summary-loading" aria-label="Loading spending summary" aria-busy="true">
        <div className="month-card">
          <span className="summary-placeholder summary-placeholder-short" />
          <span className="summary-placeholder summary-placeholder-title" />
          <span className="summary-placeholder summary-placeholder-person" />
          <span className="summary-placeholder summary-placeholder-person" />
        </div>
        <div className="today-card">
          <span className="summary-placeholder summary-placeholder-short" />
          <span className="summary-placeholder summary-placeholder-person" />
          <span className="summary-placeholder summary-placeholder-person" />
        </div>
      </section>
    );
  }

  const activeDays = new Set(monthExpenses.map((expense) => expense.date)).size;

  return (
    <section className="summary-grid" aria-label="Spending totals separated by person">
      <div className="month-card">
        <div className="month-card-glow" aria-hidden="true" />
        <div className="month-card-topline">
          <p>This month</p>
          <span className="live-month"><span aria-hidden="true" /> Current</span>
        </div>
        <h2>{formatMonth(monthKey)}</h2>
        <div className="person-totals person-totals-month">
          <PersonTotal
            name="Aayushman"
            userId="aayushman"
            amountCents={monthTotals.aayushman}
            isCurrentUser={currentUserId === "aayushman"}
          />
          <PersonTotal
            name="Carlin"
            userId="carlin"
            amountCents={monthTotals.carlin}
            isCurrentUser={currentUserId === "carlin"}
          />
        </div>
        <div className="month-meta">
          <span>Your {formatExpenseCount(monthExpenses.length)}</span>
          <span aria-hidden="true">·</span>
          <span>{activeDays} of your {activeDays === 1 ? "day" : "days"} tracked</span>
        </div>
      </div>

      <div className="today-card">
        <div className="today-card-heading">
          <span className="today-dot" aria-hidden="true" />
          <p>Today</p>
        </div>
        <div className="person-totals person-totals-today">
          <PersonTotal
            name="Aayushman"
            userId="aayushman"
            amountCents={todayTotals.aayushman}
            isCurrentUser={currentUserId === "aayushman"}
          />
          <PersonTotal
            name="Carlin"
            userId="carlin"
            amountCents={todayTotals.carlin}
            isCurrentUser={currentUserId === "carlin"}
          />
        </div>
        <p className="today-note">
          Only your entries are itemized below.
        </p>
      </div>
    </section>
  );
}
