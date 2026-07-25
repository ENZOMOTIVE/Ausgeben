CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`month_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK("expenses"."amount_cents" > 0),
	CONSTRAINT "expenses_description_length" CHECK(length("expenses"."description") BETWEEN 1 AND 80),
	CONSTRAINT "expenses_month_matches_date" CHECK("expenses"."month_key" = substr("expenses"."date", 1, 7)),
	CONSTRAINT "expenses_known_creator" CHECK("expenses"."created_by" IN ('aayushman', 'carlin'))
);
--> statement-breakpoint
CREATE INDEX `expenses_month_date_idx` ON `expenses` (`month_key`,`date`,`created_at`);--> statement-breakpoint
CREATE TABLE `ledger_state` (
	`singleton` integer PRIMARY KEY NOT NULL,
	`current_month` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "ledger_singleton" CHECK("ledger_state"."singleton" = 1)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`rate_key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_summaries` (
	`month_key` text PRIMARY KEY NOT NULL,
	`total_cents` integer NOT NULL,
	`expense_count` integer NOT NULL,
	`archived_at` text NOT NULL,
	CONSTRAINT "monthly_total_nonnegative" CHECK("monthly_summaries"."total_cents" >= 0),
	CONSTRAINT "monthly_count_nonnegative" CHECK("monthly_summaries"."expense_count" >= 0)
);
