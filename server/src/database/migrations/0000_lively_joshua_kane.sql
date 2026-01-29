CREATE TABLE `clinical_pathologies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_name` text NOT NULL,
	`pathology_name_normalized` text NOT NULL,
	`abcde_category` text NOT NULL,
	`severity_signs` text,
	`nursing_interventions` text,
	`medical_interventions` text,
	`dosage_formulas` text,
	`orientation` text,
	`primary_orientation` text,
	`secondary_orientation` text,
	`is_sauv` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
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
	`start_date_time` text NOT NULL,
	`end_date_time` text NOT NULL,
	`preset_type` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
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
CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`diagnosis_code` text,
	`diagnosis_name` text NOT NULL,
	`diagnosis_type` text NOT NULL,
	`severity` text,
	`notes` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`confirmed_at` text,
	`resolved_at` text,
	`diagnosed_by` text NOT NULL,
	`diagnosed_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`diagnosed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`priority` text NOT NULL,
	`related_patient_id` text,
	`related_box_id` text,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text,
	`metadata` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_box_id`) REFERENCES `boxes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `presenting_complaints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_normalized` text NOT NULL,
	`category` text NOT NULL,
	`primary_orientation` text NOT NULL,
	`secondary_orientation` text,
	`is_multi_category` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `presenting_complaints_name_unique` ON `presenting_complaints` (`name`);--> statement-breakpoint
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
	`chief_complaint_id` integer,
	`chief_complaint_category` text,
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
	`matched_pathologies` text,
	`suggested_nursing_interventions` text,
	`suggested_medical_interventions` text,
	`analysis_timestamp` text,
	`suggested_orientation` text,
	`orientation_source` text,
	`orientation_reason` text,
	`final_orientation` text,
	`orientation_override_reason` text,
	`assigned_box_id` text,
	`assigned_doctor_id` text,
	`treatment_started_at` text,
	`treatment_nurse_id` text,
	`treatment_notes` text,
	`doctor_assigned_at` text,
	`discharged_at` text,
	`discharged_by` text,
	`discharge_notes` text,
	`discharge_type` text,
	`retriage_requested` integer DEFAULT false,
	`retriage_reason` text,
	`status` text DEFAULT 'REGISTERED' NOT NULL,
	`registered_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`triage_nurse_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_box_id`) REFERENCES `boxes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_doctor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`treatment_nurse_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`discharged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`registered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`medication_name` text NOT NULL,
	`dosage` text NOT NULL,
	`route` text NOT NULL,
	`frequency` text NOT NULL,
	`duration` text,
	`instructions` text,
	`start_time` text,
	`end_time` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`administrations` text,
	`prescribed_by` text NOT NULL,
	`prescribed_at` text NOT NULL,
	`cancelled_by` text,
	`cancelled_at` text,
	`cancel_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prescribed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE UNIQUE INDEX `refresh_tokens_token_unique` ON `refresh_tokens` (`token`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
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
