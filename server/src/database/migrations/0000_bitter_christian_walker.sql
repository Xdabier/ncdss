PRAGMA foreign_keys = OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `abcde_interventions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `audit_log`;
--> statement-breakpoint
DROP TABLE IF EXISTS `box_assignments`;
--> statement-breakpoint
DROP TABLE IF EXISTS `boxes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `er_configuration`;
--> statement-breakpoint
DROP TABLE IF EXISTS `pathology_classification`;
--> statement-breakpoint
DROP TABLE IF EXISTS `patients`;
--> statement-breakpoint
DROP TABLE IF EXISTS `refresh_tokens`;
--> statement-breakpoint
DROP TABLE IF EXISTS `sync_log`;
--> statement-breakpoint
DROP TABLE IF EXISTS `users`;
--> statement-breakpoint
DROP TABLE IF EXISTS `weekly_schedule`;
--> statement-breakpoint
PRAGMA foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `abcde_interventions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_name` text NOT NULL,
	`abcde_category` text NOT NULL,
	`severity_signs` text,
	`nursing_interventions` text,
	`medical_interventions` text,
	`dosage_formulas` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`table_name` text,
	`record_id` text,
	`old_values` text,
	`new_values` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `box_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`box_id` text NOT NULL,
	`doctor_id` text NOT NULL,
	`shift` text NOT NULL,
	`effective_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`box_id`) REFERENCES `boxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `boxes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`box_type` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `er_configuration` (
	`id` text PRIMARY KEY NOT NULL,
	`inscription_desks` integer DEFAULT 2 NOT NULL,
	`triage_boxes` integer DEFAULT 2 NOT NULL,
	`medical_boxes` integer DEFAULT 4 NOT NULL,
	`surgical_boxes` integer DEFAULT 2 NOT NULL,
	`trauma_boxes` integer DEFAULT 2 NOT NULL,
	`sauv_beds` integer DEFAULT 4 NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pathology_classification` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_name` text NOT NULL,
	`category` text NOT NULL,
	`primary_orientation` text NOT NULL,
	`is_multi_category` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`age` integer NOT NULL,
	`sex` text NOT NULL,
	`national_id` text,
	`phone` text,
	`address` text,
	`allergies` text,
	`chronic_conditions` text,
	`current_medications` text,
	`chief_complaint` text,
	`symptom_onset` text,
	`triage_started_at` text,
	`triage_completed_at` text,
	`triage_nurse_id` text,
	`temperature` real,
	`heart_rate` integer,
	`respiratory_rate` integer,
	`systolic_bp` integer,
	`diastolic_bp` integer,
	`oxygen_saturation` integer,
	`pain_level` integer,
	`glucose_level` real,
	`gcs_eye` integer,
	`gcs_verbal` integer,
	`gcs_motor` integer,
	`abcde_airway` text,
	`abcde_breathing` text,
	`abcde_circulation` text,
	`abcde_disability` text,
	`abcde_exposure` text,
	`news_score` integer,
	`gcs_score` integer,
	`qsofa_score` integer,
	`esi_level` integer,
	`suggested_orientation` text,
	`orientation_source` text,
	`final_orientation` text,
	`orientation_override_reason` text,
	`assigned_box_id` text,
	`assigned_doctor_id` text,
	`status` text DEFAULT 'REGISTERED' NOT NULL,
	`registered_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`triage_nurse_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_box_id`) REFERENCES `boxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`operation` text NOT NULL,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_schedule` (
	`id` text PRIMARY KEY NOT NULL,
	`nurse_id` text NOT NULL,
	`week_start` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`assigned_role` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`nurse_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pathology_classification_pathology_name_unique` ON `pathology_classification` (`pathology_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
