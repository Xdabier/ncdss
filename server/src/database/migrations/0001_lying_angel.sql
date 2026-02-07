CREATE TABLE `medical_interventions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_id` text NOT NULL,
	`intervention_code` text NOT NULL,
	`description_fr` text NOT NULL,
	`description_en` text,
	`is_surgical` integer DEFAULT false NOT NULL,
	`priority_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pathology_id`) REFERENCES `pathologies`(`pathology_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nursing_interventions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_id` text NOT NULL,
	`intervention_code` text NOT NULL,
	`description_fr` text NOT NULL,
	`description_en` text,
	`priority_order` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pathology_id`) REFERENCES `pathologies`(`pathology_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pathologies` (
	`pathology_id` text PRIMARY KEY NOT NULL,
	`icd10_code` text NOT NULL,
	`abcde_category` text NOT NULL,
	`name_fr` text NOT NULL,
	`name_en` text,
	`triage_priority` text NOT NULL,
	`department_codes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pathology_symptoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pathology_id` text NOT NULL,
	`symptom_code` text NOT NULL,
	`description_fr` text NOT NULL,
	`description_en` text,
	`is_vital_sign` integer DEFAULT false NOT NULL,
	`vital_operator` text,
	`vital_value` real,
	`vital_unit` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`pathology_id`) REFERENCES `pathologies`(`pathology_id`) ON UPDATE no action ON DELETE no action
);
