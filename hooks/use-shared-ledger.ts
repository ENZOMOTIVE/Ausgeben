"use client";

import { useCallback, useEffect, useState } from "react";
import { sortExpenses } from "@/lib/expenses";
import type {
  Expense,
  ExpenseDraft,
  ExpenseUser,
  SharedLedger,
  UserId,
} from "@/types/expense";

type SessionStatus = "loading" | "anonymous" | "authenticated";

type SessionResponse = {
  user: ExpenseUser | null;
};

type ExpenseResponse = {
  expense: Expense;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error;
  }
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message;
  }

  return fallback;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // An empty or malformed error response is handled by the fallback below.
  }

  if (!response.ok) {
    throw new ApiError(
      readErrorMessage(payload, "The shared ledger could not be reached."),
      response.status,
    );
  }

  return payload as T;
}

function writeRequest<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Ausgeben-Request": "1",
    },
    body: JSON.stringify(body),
  });
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return "Ausgeben is offline right now. Check your connection and try again.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function useSharedLedger() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<ExpenseUser | null>(null);
  const [ledger, setLedger] = useState<SharedLedger | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const clearSession = useCallback(() => {
    setUser(null);
    setLedger(null);
    setLedgerError(null);
    setSessionStatus("anonymous");
  }, []);

  const loadLedger = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);

    try {
      const nextLedger = await apiRequest<SharedLedger>("/api/ledger");
      setLedger({
        ...nextLedger,
        expenses: sortExpenses(nextLedger.expenses),
        monthlySummaries: [...nextLedger.monthlySummaries].sort((a, b) =>
          b.monthKey.localeCompare(a.monthKey),
        ),
      });
      setLedgerError(null);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return false;
      }

      setLedgerError(
        messageFromError(error, "Your shared expenses could not be loaded."),
      );
      return false;
    } finally {
      if (showRefreshState) setIsRefreshing(false);
    }
  }, [clearSession]);

  useEffect(() => {
    let isActive = true;

    const loadSession = async () => {
      try {
        const result = await apiRequest<SessionResponse>("/api/auth/session");
        if (!isActive) return;

        if (!result.user) {
          clearSession();
          return;
        }

        setUser(result.user);
        setSessionStatus("authenticated");
        setAuthError(null);
        await loadLedger(true);
      } catch (error) {
        if (!isActive) return;

        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          return;
        }

        setSessionStatus("anonymous");
        setAuthError(
          messageFromError(error, "Ausgeben could not check your session."),
        );
      }
    };

    void loadSession();

    return () => {
      isActive = false;
    };
  }, [clearSession, loadLedger]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadLedger(false);
    };

    const refreshOnFocus = () => void loadLedger(false);

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadLedger, sessionStatus]);

  const login = useCallback(async (userId: UserId, password: string) => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const result = await writeRequest<SessionResponse>(
        "/api/auth/login",
        "POST",
        { userId, password },
      );

      if (!result.user) {
        throw new ApiError("That account could not be signed in.", 401);
      }

      setUser(result.user);
      setLedger(null);
      setSessionStatus("authenticated");
      await loadLedger(true);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthError("That password does not match this account.");
      } else {
        setAuthError(messageFromError(error, "Sign in could not be completed."));
      }
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [loadLedger]);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    setLedgerError(null);

    try {
      await writeRequest<void>("/api/auth/logout", "POST", {});
      clearSession();
      return true;
    } catch (error) {
      setLedgerError(messageFromError(error, "Could not log out. Please try again."));
      return false;
    } finally {
      setIsLoggingOut(false);
    }
  }, [clearSession]);

  const handleMutationError = useCallback((error: unknown): never => {
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      throw new Error("Your session expired. Sign in again to continue.");
    }

    throw new Error(messageFromError(error, "That change could not be saved."));
  }, [clearSession]);

  const addExpense = useCallback(async (draft: ExpenseDraft) => {
    try {
      const { expense } = await writeRequest<ExpenseResponse>(
        "/api/expenses",
        "POST",
        draft,
      );
      setLedger((current) => current
        ? { ...current, expenses: sortExpenses([expense, ...current.expenses]) }
        : current);
      void loadLedger(false);
      return expense;
    } catch (error) {
      return handleMutationError(error);
    }
  }, [handleMutationError, loadLedger]);

  const updateExpense = useCallback(async (id: string, draft: ExpenseDraft) => {
    try {
      const { expense } = await writeRequest<ExpenseResponse>(
        `/api/expenses/${encodeURIComponent(id)}`,
        "PATCH",
        draft,
      );
      setLedger((current) => current
        ? {
            ...current,
            expenses: sortExpenses(current.expenses.map((item) =>
              item.id === id ? expense : item,
            )),
          }
        : current);
      void loadLedger(false);
      return expense;
    } catch (error) {
      return handleMutationError(error);
    }
  }, [handleMutationError, loadLedger]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await writeRequest<void>(
        `/api/expenses/${encodeURIComponent(id)}`,
        "DELETE",
        {},
      );
      setLedger((current) => current
        ? {
            ...current,
            expenses: current.expenses.filter((expense) => expense.id !== id),
          }
        : current);
      void loadLedger(false);
      return true;
    } catch (error) {
      return handleMutationError(error);
    }
  }, [handleMutationError, loadLedger]);

  return {
    sessionStatus,
    user,
    ledger,
    authError,
    ledgerError,
    isAuthenticating,
    isLoggingOut,
    isRefreshing,
    dismissAuthError: () => setAuthError(null),
    login,
    logout,
    refreshLedger: () => loadLedger(true),
    addExpense,
    updateExpense,
    deleteExpense,
  };
}
