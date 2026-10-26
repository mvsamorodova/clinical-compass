CREATE TABLE `recovery_activity` (
	`patient_id` text NOT NULL,
	`kind` text NOT NULL,
	`item_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`patient_id`, `kind`, `item_key`),
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recovery_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`category` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`media_key` text,
	`media_type` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recovery_entries_by_patient` ON `recovery_entries` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `recovery_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recovery_messages_by_connection` ON `recovery_messages` (`patient_id`,`doctor_id`,`created_at`);