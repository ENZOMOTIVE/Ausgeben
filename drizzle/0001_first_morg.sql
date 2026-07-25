ALTER TABLE `monthly_summaries`
ADD COLUMN `aayushman_total_cents` integer DEFAULT 0 NOT NULL
CHECK (`aayushman_total_cents` >= 0);
--> statement-breakpoint
ALTER TABLE `monthly_summaries`
ADD COLUMN `carlin_total_cents` integer DEFAULT 0 NOT NULL
CHECK (`carlin_total_cents` >= 0);
