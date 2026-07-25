import type { CSSProperties } from "react";
import { groupExpensesByDate } from "@/lib/expenses";
import {
  formatCurrency,
  formatDayLabel,
  formatExpenseCount,
} from "@/lib/formatters";
import type { Expense, UserId } from "@/types/expense";

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
            {group.expenses.map((expense, index) => {
              const isOwnExpense = expense.createdBy === currentUserId;
              const ownerName = USER_NAMES[expense.createdBy];
              const content = (
                <>
                  <span
                    className={`expense-marker expense-marker-${expense.createdBy}`}
                    aria-hidden="true"
                  >
                    {ownerName.charAt(0)}
                  </span>
                  <span className="expense-copy">
                    <strong>{expense.description}</strong>
                    <small>
                      <span>{ownerName}</span>
                      <span aria-hidden="true">·</span>
                      {isOwnExpense ? "Tap to edit" : "Shared entry"}
                    </small>
                  </span>
                  <span className="expense-amount">
                    {formatCurrency(expense.amountCents)}
                  </span>
                  {isOwnExpense ? (
                    <span className="expense-arrow" aria-hidden="true">›</span>
                  ) : (
                    <span className="expense-shared-dot" aria-hidden="true" />
                  )}
                </>
              );

              return (
                <li
                  key={expense.id}
                  className={isOwnExpense ? "expense-item own-expense" : "expense-item"}
                  style={{ "--item-index": index } as CSSProperties}
                >
                  {isOwnExpense ? (
                    <button type="button" onClick={() => onEdit(expense)}>
                      {content}
                      <span className="sr-only">
                        Edit your {expense.description} expense, {formatCurrency(expense.amountCents)}
                      </span>
                    </button>
                  ) : (
                    <div className="expense-row">
                      {content}
                      <span className="sr-only">
                        {ownerName}&apos;s {expense.description} expense, {formatCurrency(expense.amountCents)}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
