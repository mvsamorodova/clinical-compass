CREATE TABLE `invitations` (
	`token` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`expires` integer NOT NULL,
	`used_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patient_records` (
	`patient_id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`status` text DEFAULT 'stable' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`recommendations` text DEFAULT '' NOT NULL,
	`private_notes` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_by_doctor` ON `patient_records` (`doctor_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`birth_date` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`specialty` text DEFAULT '' NOT NULL,
	`clinic` text DEFAULT '' NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`schedule` text DEFAULT '' NOT NULL,
	`demo_group` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);