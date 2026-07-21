DELETE FROM `alert_events`
WHERE lower(`payload_json`) LIKE '%mock%'
   OR lower(`payload_json`) LIKE '%fixture%';
--> statement-breakpoint
DELETE FROM `daily_reviews`
WHERE lower(`report_json`) LIKE '%mock%'
   OR lower(`report_json`) LIKE '%fixture%';
--> statement-breakpoint
DELETE FROM `quote_snapshots`
WHERE lower(`provider`) LIKE '%mock%'
   OR lower(`payload_json`) LIKE '%mock%'
   OR lower(`payload_json`) LIKE '%fixture%';
--> statement-breakpoint
DELETE FROM `scheduled_job_runs`
WHERE lower(`trigger_json`) LIKE '%fixture%';
--> statement-breakpoint
DELETE FROM `notification_deliveries`
WHERE `channel` = 'simulation' OR `status` = 'simulated';
--> statement-breakpoint
UPDATE `user_settings`
SET `settings_json` = replace(
  `settings_json`,
  '"notification_channel":"simulation"',
  '"notification_channel":"browser"'
)
WHERE `settings_json` LIKE '%"notification_channel":"simulation"%';
