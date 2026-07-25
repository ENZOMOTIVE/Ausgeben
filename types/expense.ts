export type UserId = "aayushman" | "carlin";

export type ExpenseUser = {
  id: UserId;
  displayName: string;
};

export type Expense = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  createdAt: string;
  createdBy: UserId;
};

export type ExpenseDraft = Pick<
  Expense,
  "description" | "amountCents" | "date"
>;

export type MonthlySummary = {
  monthKey: string;
  totalCents: number;
  expenseCount: number;
  archivedAt: string;
};

export type SharedLedger = {
  currentMonth: string;
  expenses: Expense[];
  monthlySummaries: MonthlySummary[];
};
