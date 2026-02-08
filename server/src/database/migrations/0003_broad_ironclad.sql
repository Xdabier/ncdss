CREATE TABLE `patient_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`date_of_birth` text,
	`sex` text NOT NULL,
	`id_number` text,
	`id_type` text,
	`nationality` text,
	`phone` text,
	`address` text,
	`allergies` text,
	`chronic_conditions` text,
	`current_medications` text,
	`medical_history` text,
	`surgical_history` text,
	`obstetric_history` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `patients` ADD `patient_identity_id` text REFERENCES patient_identities(id);--> statement-breakpoint
ALTER TABLE `patients` ADD `date_of_birth` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `id_type` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `nationality` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `medical_history_notes` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `medical_history` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `surgical_history` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `obstetric_history` text;