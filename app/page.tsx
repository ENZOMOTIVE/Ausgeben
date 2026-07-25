import { ExpenseTracker } from "@/components/expense-tracker/ExpenseTracker";
import { getTodayInBerlin } from "@/lib/expenses";

export default function Home() {
  return <ExpenseTracker initialToday={getTodayInBerlin()} />;
}
