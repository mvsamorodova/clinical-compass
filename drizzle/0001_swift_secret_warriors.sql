CREATE TABLE `chat_turns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`message` text NOT NULL,
	`reply` text NOT NULL,
	`kind` text DEFAULT 'llm' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_turns_request_id_unique` ON `chat_turns` (`request_id`);--> statement-breakpoint
CREATE INDEX `chat_by_patient` ON `chat_turns` (`patient_id`,`id`);--> statement-breakpoint
CREATE TABLE `mood_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`mood` integer NOT NULL,
	`emotions` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`shared_doctor_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shared_doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mood_by_patient` ON `mood_entries` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `mood_by_doctor` ON `mood_entries` (`shared_doctor_id`);