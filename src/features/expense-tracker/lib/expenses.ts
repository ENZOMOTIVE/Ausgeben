import type { Expense } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function sortExpenses(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) => {
    const dateDifference = b.date.localeCompare(a.date);
    if (dateDifference !== 0) return dateDifference;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function parseEuroAmount(value: string): number | null {
  const compactValue = value.trim().replace(/[\s€]/g, "");
  if (!compactValue || !/^[0-9.,]+$/.test(compactValue)) return null;

  const lastComma = compactValue.lastIndexOf(",");
  const lastDot = compactValue.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  let euros = compactValue;
  let cents = "";

  if (decimalIndex >= 0) {
    euros = compactValue.slice(0, decimalIndex).replace(/[.,]/g, "");
    cents = compactValue.slice(decimalIndex + 1);

    if (!euros || !/^\d+$/.test(cents) || cents.length > 2) return null;
  }

  const normalizedCents = cents.padEnd(2, "0");
  const totalCents = Number(euros) * 100 + Number(normalizedCents || "0");

  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    totalCents > 999_999_999
  ) {
    return null;
  }

  return totalCents;
}

export function formatAmountForInput(amountCents: number): string {
  return (amountCents / 100).toFixed(2).replace(".", ",");
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => total + expense.amountCents, 0);
}

export function groupExpensesByDate(
  expenses: Expense[],
): Array<{ date: string; expenses: Expense[]; totalCents: number }> {
  const groups = new Map<string, Expense[]>();

  for (const expense of sortExpenses(expenses)) {
    const current = groups.get(expense.date) ?? [];
    current.push(expense);
    groups.set(expense.date, current);
  }

  return Array.from(groups, ([date, groupedExpenses]) => ({
    date,
    expenses: groupedExpenses,
    totalCents: sumExpenses(groupedExpenses),
  }));
}

export function getMonthKey(date: string): string {
  return date.slice(0, 7);
}

export function getTodayInBerlin(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
