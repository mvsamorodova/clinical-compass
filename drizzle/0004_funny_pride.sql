CREATE TABLE `health_days` (
	`patient_id` text NOT NULL,
	`provider` text NOT NULL,
	`day` text NOT NULL,
	`steps` integer,
	`sleep_minutes` integer,
	`active_minutes` integer,
	`steps_source` text DEFAULT '' NOT NULL,
	`sleep_source` text DEFAULT '' NOT NULL,
	`activity_source` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_day_per_patient_source` ON `health_days` (`patient_id`,`provider`,`day`);--> statement-breakpoint
CREATE TABLE `health_sharing` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `test_assignments` ADD `interval_days` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `test_results` ADD `interval_days` integer DEFAULT 7 NOT NULL;