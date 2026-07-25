"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExpenseForm } from "./ExpenseForm";
import { ExpenseList } from "./ExpenseList";
import { LoginScreen, SessionLoading } from "./LoginScreen";
import { MonthlyArchive } from "./MonthlyArchive";
import { SpendingSummary } from "./SpendingSummary";
import { useSharedLedger } from "../hooks/use-shared-ledger";
import { getMonthKey, getTodayInBerlin } from "../lib/expenses";
import { formatMonth } from "../lib/formatters";
import type { Expense, ExpenseDraft, ExpenseUser } from "../types";

type ExpenseTrackerProps = {
  initialToday: string;
};

type AccountControlsProps = {
  user: ExpenseUser;
  isLoggingOut: boolean;
  onLogout: () => Promise<boolean>;
};

function AccountControls({
  user,
  isLoggingOut,
  onLogout,
}: AccountControlsProps) {
  return (
    <div className="account-controls">
      <span className={`header-avatar header-avatar-${user.id}`} aria-hidden="true">
        {user.displayName.charAt(0)}
      </span>
      <span className="header-user-name">{user.displayName}</span>
      <button
        className="logout-button"
        type="button"
        disabled={isLoggingOut}
        onClick={() => void onLogout()}
      >
        {isLoggingOut ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "That change could not be saved. Please try again.";
}

export function ExpenseTracker({ initialToday }: ExpenseTrackerProps) {
  const {
    sessionStatus,
    user,
    ledger,
    authError,
    ledgerError,
    isAuthenticating,
    isLoggingOut,
    isRefreshing,
    dismissAuthError,
    login,
    logout,
    refreshLedger,
    addExpense,
    updateExpense,
    deleteExpense,
  } = useSharedLedger();
  const [today, setToday] = useState(initialToday);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const currentMonthKey = ledger?.currentMonth ?? getMonthKey(today);
  const expenses = useMemo(() => ledger?.expenses ?? [], [ledger?.expenses]);
  const archivedMonths = useMemo(
    () => (ledger?.monthlySummaries ?? []).filter(
      (summary) => summary.monthKey < currentMonthKey,
    ),
    [currentMonthKey, ledger?.monthlySummaries],
  );

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    const updateToday = () => setToday(getTodayInBerlin());
    const updateWhenVisible = () => {
      if (document.visibilityState === "visible") updateToday();
    };

    window.addEventListener("focus", updateToday);
    document.addEventListener("visibilitychange", updateWhenVisible);
    return () => {
      window.removeEventListener("focus", updateToday);
      document.removeEventListener("visibilitychange", updateWhenVisible);
    };
  }, []);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setEditingExpense(null);
    setFormError(null);
  }, []);

  const openNewExpense = () => {
    if (!ledger) return;
    setEditingExpense(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openExpense = (expense: Expense) => {
    if (!user || expense.createdBy !== user.id) return;
    setEditingExpense(expense);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (draft: ExpenseDraft): Promise<boolean> => {
    setFormError(null);

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, draft);
        setStatusMessage("Expense updated");
      } else {
        await addExpense(draft);
        setStatusMessage("Expense added to your log");
      }
      closeForm();
      return true;
    } catch (error) {
      setFormError(getErrorMessage(error));
      return false;
    }
  };

  const handleDelete = async (): Promise<boolean> => {
    if (!editingExpense) return false;
    setFormError(null);

    try {
      await deleteExpense(editingExpense.id);
      setStatusMessage("Expense deleted");
      closeForm();
      return true;
    } catch (error) {
      setFormError(getErrorMessage(error));
      return false;
    }
  };

  if (sessionStatus === "loading") return <SessionLoading />;

  if (sessionStatus === "anonymous" || !user) {
    return (
      <LoginScreen
        error={authError}
        isSubmitting={isAuthenticating}
        onDismissError={dismissAuthError}
        onLogin={login}
      />
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Ausgeben home">
          <span className="brand-mark" aria-hidden="true">a.</span>
          <span>
            <strong>Ausgeben</strong>
            <small>Shared expenses</small>
          </span>
        </a>
        <AccountControls
          user={user}
          isLoggingOut={isLoggingOut}
          onLogout={logout}
        />
      </header>

      <div className="page-intro" id="top">
        <div>
          <p className="eyebrow location-label">Germany · Shared ledger</p>
          <h1>Our spending,<br />made clear.</h1>
        </div>
        <button
          className="primary-button desktop-add"
          type="button"
          onClick={openNewExpense}
          disabled={!ledger}
        >
          <span aria-hidden="true">＋</span>
          Add expense
        </button>
      </div>

      {ledgerError ? (
        <div className="sync-alert" role="alert">
          <span aria-hidden="true">!</span>
          <p>{ledgerError}</p>
          <button
            type="button"
            disabled={isRefreshing}
            onClick={() => void refreshLedger()}
          >
            {isRefreshing ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : null}

      <SpendingSummary
        monthKey={currentMonthKey}
        monthExpenses={expenses}
        monthTotals={ledger?.monthTotals}
        todayTotals={ledger?.todayTotals}
        currentUserId={user.id}
        isReady={Boolean(ledger)}
      />

      <section className="spending-log" aria-labelledby="spending-log-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your details</p>
            <h2 id="spending-log-title">Your spending log</h2>
          </div>
          <p>{formatMonth(currentMonthKey)}</p>
        </div>

        <ExpenseList
          expenses={expenses}
          today={today}
          isReady={Boolean(ledger)}
          emptyMonthLabel={formatMonth(currentMonthKey)}
          currentUserId={user.id}
          onEdit={openExpense}
        />
      </section>

      <MonthlyArchive summaries={archivedMonths} isReady={Boolean(ledger)} />

      <footer className="app-footer">
        <p><span aria-hidden="true">●</span> Saved to your shared ledger</p>
        <p>Available on every signed-in device.</p>
      </footer>

      <button
        className="mobile-add"
        type="button"
        onClick={openNewExpense}
        disabled={!ledger}
      >
        <span aria-hidden="true">＋</span>
        Add expense
      </button>

      {isFormOpen ? (
        <ExpenseForm
          expense={editingExpense}
          defaultDate={today}
          currentMonth={currentMonthKey}
          submitError={formError}
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
