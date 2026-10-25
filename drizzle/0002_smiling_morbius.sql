CREATE TABLE `test_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`test_key` text NOT NULL,
	`test_version` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_due_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignment_per_patient_doctor_test` ON `test_assignments` (`patient_id`,`doctor_id`,`test_key`);--> statement-breakpoint
CREATE TABLE `test_results` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`cycle_due_at` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	`test_version` text NOT NULL,
	`answers` text NOT NULL,
	`depression` integer NOT NULL,
	`anxiety` integer NOT NULL,
	`stress` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `test_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_result_per_due_cycle` ON `test_results` (`assignment_id`,`cycle_due_at`);--> statement-breakpoint
CREATE INDEX `results_by_assignment` ON `test_results` (`assignment_id`,`submitted_at`);