CREATE TABLE `historical_review_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trade_date` text NOT NULL,
	`scope_key` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `historical_review_cache_user_date_scope` ON `historical_review_cache` (`user_id`,`trade_date`,`scope_key`);