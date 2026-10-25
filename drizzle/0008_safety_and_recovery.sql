CREATE TABLE `assessment_alerts` (
	`result_id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`reasons_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`result_id`) REFERENCES `test_results`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `alerts_by_doctor` ON `assessment_alerts` (`doctor_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `map_preferences` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`branch` text NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `map_progress` (
	`patient_id` text NOT NULL,
	`node_key` text NOT NULL,
	`status` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `map_node_per_patient` ON `map_progress` (`patient_id`,`node_key`);--> statement-breakpoint
CREATE TABLE `safety_plans` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`data_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
