import { ExpenseTracker } from "@/features/expense-tracker";
import { getTodayInBerlin } from "@/features/expense-tracker/lib/expenses";

export default function Home() {
  return <ExpenseTracker initialToday={getTodayInBerlin()} />;
}
