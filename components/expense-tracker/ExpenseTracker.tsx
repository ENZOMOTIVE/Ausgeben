"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExpenseForm } from "./ExpenseForm";
import { ExpenseList } from "./ExpenseList";
import { SpendingSummary } from "./SpendingSummary";
import { useLocalExpenses } from "@/hooks/use-local-expenses";
import { formatMonth } from "@/lib/formatters";
import { getMonthKey, shiftMonthKey } from "@/lib/expenses";
import type { Expense, ExpenseDraft } from "@/types/expense";

type ExpenseTrackerProps = {
  initialToday: string;
};

export function ExpenseTracker({ initialToday }: ExpenseTrackerProps) {
  const {
    expenses,
    isReady,
    storageError,
    addExpense,
    updateExpense,
    deleteExpense,
  } = useLocalExpenses();
  const currentMonthKey = getMonthKey(initialToday);
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const monthExpenses = useMemo(
    () => expenses.filter((expense) => getMonthKey(expense.date) === selectedMonthKey),
    [expenses, selectedMonthKey],
  );
  const todayExpenses = useMemo(
    () => expenses.filter((expense) => expense.date === initialToday),
    [expenses, initialToday],
  );

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingExpense(null);
  }, []);

  const openNewExpense = () => {
    setEditingExpense(null);
    setIsFormOpen(true);
  };

  const openExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleSubmit = (draft: ExpenseDraft): boolean => {
    const savedExpense = editingExpense
      ? updateExpense(editingExpense.id, draft)
      : addExpense(draft);

    if (!savedExpense) return false;

    setSelectedMonthKey(getMonthKey(savedExpense.date));
    setStatusMessage(editingExpense ? "Expense updated" : "Expense saved");
    closeForm();
    return true;
  };

  const handleDelete = (): boolean => {
    if (!editingExpense || !deleteExpense(editingExpense.id)) return false;

    setStatusMessage("Expense deleted");
    closeForm();
    return true;
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Ausgeben home">
          <span className="brand-mark" aria-hidden="true">a.</span>
          <span>
            <strong>Ausgeben</strong>
            <small>Personal expenses</small>
          </span>
        </a>
        <div className="local-badge" title="Saved in this browser on this device">
          <span aria-hidden="true" />
          Only on this device
        </div>
      </header>

      <div className="page-intro" id="top">
        <div>
          <p className="eyebrow location-label">Passau, Germany</p>
          <h1>Your spending,<br />made clear.</h1>
        </div>
        <button className="primary-button desktop-add" type="button" onClick={openNewExpense}>
          <span aria-hidden="true">＋</span>
          Add expense
        </button>
      </div>

      {storageError ? (
        <div className="storage-alert" role="alert">
          <span aria-hidden="true">!</span>
          <p>{storageError}</p>
        </div>
      ) : null}

      <SpendingSummary
        monthKey={selectedMonthKey}
        monthExpenses={monthExpenses}
        todayExpenses={todayExpenses}
        canGoForward={selectedMonthKey < currentMonthKey}
        onPreviousMonth={() => setSelectedMonthKey((month) => shiftMonthKey(month, -1))}
        onNextMonth={() => {
          if (selectedMonthKey < currentMonthKey) {
            setSelectedMonthKey((month) => shiftMonthKey(month, 1));
          }
        }}
      />

      <section className="spending-log" aria-labelledby="spending-log-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your history</p>
            <h2 id="spending-log-title">Spending log</h2>
          </div>
          <p>{formatMonth(selectedMonthKey)}</p>
        </div>

        <ExpenseList
          expenses={monthExpenses}
          today={initialToday}
          isReady={isReady}
          emptyMonthLabel={formatMonth(selectedMonthKey)}
          onEdit={openExpense}
        />
      </section>

      <footer className="app-footer">
        <p><span aria-hidden="true">●</span> Stored locally in your browser</p>
        <p>No account. No database.</p>
      </footer>

      <button className="mobile-add" type="button" onClick={openNewExpense}>
        <span aria-hidden="true">＋</span>
        Add expense
      </button>

      {isFormOpen ? (
        <ExpenseForm
          expense={editingExpense}
          defaultDate={initialToday}
          onSubmit={handleSubmit}
          onDelete={editingExpense ? handleDelete : null}
          onClose={closeForm}
        />
      ) : null}

      <div className="status-region" aria-live="polite" aria-atomic="true">
        {statusMessage ? (
          <div className="status-toast">
            <span aria-hidden="true">✓</span>
            {statusMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
