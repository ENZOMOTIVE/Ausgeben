import type { CSSProperties } from "react";
import { groupExpensesByDate } from "@/lib/expenses";
import {
  formatCurrency,
  formatDayLabel,
  formatExpenseCount,
} from "@/lib/formatters";
import type { Expense } from "@/types/expense";

type ExpenseListProps = {
  expenses: Expense[];
  today: string;
  isReady: boolean;
  emptyMonthLabel: string;
  onEdit: (expense: Expense) => void;
};

export function ExpenseList({
  expenses,
  today,
  isReady,
  emptyMonthLabel,
  onEdit,
}: ExpenseListProps) {
  if (!isReady) {
    return (
      <div className="expense-loading" role="status" aria-label="Loading saved expenses">
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-receipt" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h3>No expenses here yet</h3>
        <p>Anything you add for {emptyMonthLabel} will appear in this log.</p>
      </div>
    );
  }

  const groups = groupExpensesByDate(expenses);

  return (
    <div className="expense-groups">
      {groups.map((group) => (
        <section className="expense-day" key={group.date}>
          <div className="day-heading">
            <div>
              <h3>{formatDayLabel(group.date, today)}</h3>
              <p>{formatExpenseCount(group.expenses.length)}</p>
            </div>
            <p>{formatCurrency(group.totalCents)}</p>
          </div>

          <ul className="expense-list" aria-label={`Expenses for ${group.date}`}>
            {group.expenses.map((expense, index) => (
              <li
                key={expense.id}
                className="expense-item"
                style={{ "--item-index": index } as CSSProperties}
              >
                <button type="button" onClick={() => onEdit(expense)}>
                  <span className="expense-marker" aria-hidden="true">
                    {expense.description.charAt(0).toUpperCase()}
                  </span>
                  <span className="expense-copy">
                    <strong>{expense.description}</strong>
                    <small>Edit entry</small>
                  </span>
                  <span className="expense-amount">
                    {formatCurrency(expense.amountCents)}
                  </span>
                  <span className="expense-arrow" aria-hidden="true">›</span>
                  <span className="sr-only">
                    Edit {expense.description}, {formatCurrency(expense.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
