CREATE TABLE `market_daily_reviews` (
	`trade_date` text PRIMARY KEY NOT NULL,
	`data_version` text NOT NULL,
	`provider` text NOT NULL,
	`payload_json` text NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
DELETE FROM `watch_items`
WHERE `id` LIKE 'watch-%-sector-metal'
   OR `id` LIKE 'watch-%-601600'
   OR `id` LIKE 'watch-%-000858';
