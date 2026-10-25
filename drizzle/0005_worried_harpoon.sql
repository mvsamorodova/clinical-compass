CREATE TABLE `health_sync_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`received_at` integer,
	`preview_json` text,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_sync_requests_token_hash_unique` ON `health_sync_requests` (`token_hash`);--> statement-breakpoint
CREATE INDEX `health_sync_by_patient` ON `health_sync_requests` (`patient_id`);