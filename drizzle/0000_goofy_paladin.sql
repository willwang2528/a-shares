CREATE TABLE `alert_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`level` text NOT NULL,
	`object_type` text NOT NULL,
	`object_code` text NOT NULL,
	`title` text NOT NULL,
	`payload_json` text NOT NULL,
	`data_time` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_events_dedupe_key_unique` ON `alert_events` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `alert_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`enabled` integer NOT NULL,
	`params_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cost_estimates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scenario` text NOT NULL,
	`assumptions_json` text NOT NULL,
	`monthly_total` real NOT NULL,
	`annual_total` real NOT NULL,
	`currency` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cost_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`item` text NOT NULL,
	`currency` text NOT NULL,
	`monthly_price` real,
	`annual_price` real,
	`source_url` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`trade_date` text NOT NULL,
	`status` text NOT NULL,
	`data_ready` integer NOT NULL,
	`retry_count` integer NOT NULL,
	`report_json` text NOT NULL,
	`pushed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_reviews_user_trade_date` ON `daily_reviews` (`user_id`,`trade_date`);--> statement-breakpoint
CREATE TABLE `job_leases` (
	`lease_key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`lease_until` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_instruments` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`exchange` text NOT NULL,
	`board` text,
	`provider` text NOT NULL,
	`raw_version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`error_code` text,
	`sent_at` text,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_dedupe_key_unique` ON `notification_deliveries` (`dedupe_key`);--> statement-breakpoint
CREATE TABLE `provider_health` (
	`provider_type` text NOT NULL,
	`provider_name` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_health_type_name` ON `provider_health` (`provider_type`,`provider_name`);--> statement-breakpoint
CREATE TABLE `quote_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`scope` text NOT NULL,
	`data_time` text NOT NULL,
	`payload_json` text NOT NULL,
	`is_fresh` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`trigger_json` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`duration_ms` integer,
	`error_code` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_job_runs_idempotency_key_unique` ON `scheduled_job_runs` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `sector_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`input_name` text NOT NULL,
	`provider` text NOT NULL,
	`classification` text NOT NULL,
	`sector_code` text NOT NULL,
	`sector_name` text NOT NULL,
	`member_count` integer NOT NULL,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trading_calendar` (
	`market` text NOT NULL,
	`trade_date` text NOT NULL,
	`is_open` integer NOT NULL,
	`source` text NOT NULL,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_calendar_market_date` ON `trading_calendar` (`market`,`trade_date`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `watch_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`group_id` text,
	`object_type` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`cost_price` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
