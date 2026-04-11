CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cin` text,
	`address` text,
	`first_name` text,
	`last_name` text,
	`birth_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `er_configuration` ADD `dechocage_beds` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `profile_completed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `pin_hash` text;