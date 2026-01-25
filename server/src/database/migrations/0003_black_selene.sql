CREATE TABLE `ai_prediagnosis` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`suggestions` text,
	`recommended_tests` text,
	`warnings` text,
	`thinking_trace` text,
	`thinking_enabled` integer DEFAULT false,
	`error_message` text,
	`generated_by` text,
	`trigger_source` text,
	`generated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
