"use client";

import { useCallback, useEffect, useState } from "react";
import { readExpenses, sortExpenses, writeExpenses } from "@/lib/expenses";
import type { Expense, ExpenseDraft } from "@/types/expense";

function makeExpenseId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `expense-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useLocalExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    const result = readExpenses(window.localStorage);
    const hydrationTimer = window.setTimeout(() => {
      setExpenses(result.expenses);
      setStorageError(result.error);
      setIsReady(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  const commit = useCallback((nextExpenses: Expense[]) => {
    const sortedExpenses = sortExpenses(nextExpenses);

    try {
      writeExpenses(window.localStorage, sortedExpenses);
      setExpenses(sortedExpenses);
      setStorageError(null);
      return true;
    } catch {
      setStorageError(
        "This expense could not be saved. Check that browser storage is available.",
      );
      return false;
    }
  }, []);

  const addExpense = useCallback(
    (draft: ExpenseDraft): Expense | null => {
      const expense: Expense = {
        ...draft,
        id: makeExpenseId(),
        createdAt: new Date().toISOString(),
      };

      return commit([expense, ...expenses]) ? expense : null;
    },
    [commit, expenses],
  );

  const updateExpense = useCallback(
    (id: string, draft: ExpenseDraft): Expense | null => {
      const existingExpense = expenses.find((expense) => expense.id === id);
      if (!existingExpense) return null;

      const updatedExpense = { ...existingExpense, ...draft };
      const nextExpenses = expenses.map((expense) =>
        expense.id === id ? updatedExpense : expense,
      );

      return commit(nextExpenses) ? updatedExpense : null;
    },
    [commit, expenses],
  );

  const deleteExpense = useCallback(
    (id: string): boolean =>
      commit(expenses.filter((expense) => expense.id !== id)),
    [commit, expenses],
  );

  return {
    expenses,
    isReady,
    storageError,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}
