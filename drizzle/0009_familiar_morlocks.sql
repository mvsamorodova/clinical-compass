CREATE TABLE `voice_emotions` (
	`voice_id` text PRIMARY KEY NOT NULL,
	`doctor_id` text NOT NULL,
	`model_version` text NOT NULL,
	`scores_json` text NOT NULL,
	`segments` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`voice_id`) REFERENCES `voice_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `voice_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	`shared_doctor_id` text,
	`shared_at` integer,
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shared_doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `voice_by_patient` ON `voice_notes` (`patient_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `chat_turns` ADD `voice_id` text REFERENCES voice_notes(id);