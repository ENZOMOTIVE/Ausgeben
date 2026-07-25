export type Expense = {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  createdAt: string;
};

export type ExpenseDraft = Pick<
  Expense,
  "description" | "amountCents" | "date"
>;
