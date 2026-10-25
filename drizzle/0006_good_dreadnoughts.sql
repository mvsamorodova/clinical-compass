CREATE TABLE `daily_diary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`day` text NOT NULL,
	`time_zone` text NOT NULL,
	`version` text NOT NULL,
	`plan_revision` text NOT NULL,
	`blocks_json` text NOT NULL,
	`answers_json` text NOT NULL,
	`shared_doctor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shared_doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_diary_per_patient_day` ON `daily_diary_entries` (`patient_id`,`day`);--> statement-breakpoint
CREATE TABLE `diary_plans` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`blocks_json` text NOT NULL,
	`revision` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `test_results` ADD `recorded_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `test_results` ADD `entry_mode` text DEFAULT 'patient' NOT NULL;