CREATE TABLE `therapy_reviews` (
	`patient_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`context_hash` text NOT NULL,
	`rule_version` text NOT NULL,
	`checks_json` text NOT NULL,
	`history` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`reviewed_at` integer NOT NULL,
	PRIMARY KEY(`patient_id`, `doctor_id`),
	FOREIGN KEY (`patient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
