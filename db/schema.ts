import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const expenses = sqliteTable(
  "expenses",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    date: text("date").notNull(),
    monthKey: text("month_key").notNull(),
    createdBy: text("created_by", {
      enum: ["aayushman", "carlin"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("expenses_month_date_idx").on(
      table.monthKey,
      table.date,
      table.createdAt,
    ),
    check("expenses_amount_positive", sql`${table.amountCents} > 0`),
    check(
      "expenses_description_length",
      sql`length(${table.description}) BETWEEN 1 AND 80`,
    ),
    check(
      "expenses_month_matches_date",
      sql`${table.monthKey} = substr(${table.date}, 1, 7)`,
    ),
    check(
      "expenses_known_creator",
      sql`${table.createdBy} IN ('aayushman', 'carlin')`,
    ),
  ],
);

export const monthlySummaries = sqliteTable(
  "monthly_summaries",
  {
    monthKey: text("month_key").primaryKey(),
    totalCents: integer("total_cents").notNull(),
    aayushmanTotalCents: integer("aayushman_total_cents")
      .notNull()
      .default(0),
    carlinTotalCents: integer("carlin_total_cents").notNull().default(0),
    expenseCount: integer("expense_count").notNull(),
    archivedAt: text("archived_at").notNull(),
  },
  (table) => [
    check("monthly_total_nonnegative", sql`${table.totalCents} >= 0`),
    check(
      "monthly_aayushman_total_nonnegative",
      sql`${table.aayushmanTotalCents} >= 0`,
    ),
    check(
      "monthly_carlin_total_nonnegative",
      sql`${table.carlinTotalCents} >= 0`,
    ),
    check("monthly_count_nonnegative", sql`${table.expenseCount} >= 0`),
  ],
);

export const ledgerState = sqliteTable(
  "ledger_state",
  {
    singleton: integer("singleton").primaryKey(),
    currentMonth: text("current_month").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [check("ledger_singleton", sql`${table.singleton} = 1`)],
);

export const loginAttempts = sqliteTable("login_attempts", {
  rateKey: text("rate_key").primaryKey(),
  failures: integer("failures").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  blockedUntil: integer("blocked_until").notNull(),
});
