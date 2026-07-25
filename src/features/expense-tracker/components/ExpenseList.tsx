import type { CSSProperties } from "react";
import { groupExpensesByDate } from "../lib/expenses";
import {
  formatCurrency,
  formatDayLabel,
  formatExpenseCount,
} from "../lib/formatters";
import type { Expense, UserId } from "../types";

type ExpenseListProps = {
  expenses: Expense[];
  today: string;
  isReady: boolean;
  emptyMonthLabel: string;
  currentUserId: UserId;
  onEdit: (expense: Expense) => void;
};

const USER_NAMES: Record<UserId, string> = {
  aayushman: "Aayushman",
  carlin: "Carlin",
};

export function ExpenseList({
  expenses,
  today,
  isReady,
  emptyMonthLabel,
  currentUserId,
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
      {groups.map((group) => {
        return (
          <section className="expense-day" key={group.date}>
            <div className="day-heading">
              <div className="day-heading-copy">
                <h3>{formatDayLabel(group.date, today)}</h3>
                <p>{formatExpenseCount(group.expenses.length)}</p>
              </div>
              <div className="day-person-totals" aria-label={`Your total for ${group.date}`}>
                <span className={`day-person-total ${currentUserId}`}>
                  <small>Your total</small>
                  <strong>{formatCurrency(group.totalCents)}</strong>
                </span>
              </div>
            </div>

            <ul className="expense-list" aria-label={`Your expenses for ${group.date}`}>
              {group.expenses.map((expense, index) => {
                const ownerName = USER_NAMES[currentUserId];

                return (
                  <li
                    key={expense.id}
                    className="expense-item own-expense"
                    style={{ "--item-index": index } as CSSProperties}
                  >
                    <button type="button" onClick={() => onEdit(expense)}>
                      <span
                        className={`expense-marker expense-marker-${currentUserId}`}
                        aria-hidden="true"
                      >
                        {ownerName.charAt(0)}
                      </span>
                      <span className="expense-copy">
                        <strong>{expense.description}</strong>
                        <small>
                          <span>{ownerName}</span>
                          <span aria-hidden="true">·</span>
                          Tap to edit
                        </small>
                      </span>
                      <span className="expense-amount">
                        {formatCurrency(expense.amountCents)}
                      </span>
                      <span className="expense-arrow" aria-hidden="true">›</span>
                      <span className="sr-only">
                        Edit your {expense.description} expense, {formatCurrency(expense.amountCents)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
