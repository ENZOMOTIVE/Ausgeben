const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function formatCurrency(amountCents: number): string {
  return currencyFormatter.format(amountCents / 100);
}

export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1, 12));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDayLabel(date: string, today: string): string {
  if (date === today) return "Today";

  const parsedToday = parseLocalDate(today);
  const yesterday = new Date(parsedToday);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayKey = `${yesterday.getFullYear()}-${String(
    yesterday.getMonth() + 1,
  ).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (date === yesterdayKey) return "Yesterday";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(parseLocalDate(date));
}

export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(date));
}

export function formatExpenseCount(count: number): string {
  return `${count} ${count === 1 ? "expense" : "expenses"}`;
}
