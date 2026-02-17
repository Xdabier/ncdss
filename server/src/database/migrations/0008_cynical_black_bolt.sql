CREATE TABLE `complementary_exams` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`exam_name` text NOT NULL,
	`exam_type` text NOT NULL,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`source` text DEFAULT 'DOCTOR' NOT NULL,
	`notes` text,
	`results` text,
	`requested_by` text NOT NULL,
	`requested_at` text NOT NULL,
	`started_at` text,
	`started_by` text,
	`completed_at` text,
	`completed_by` text,
	`cancelled_at` text,
	`cancelled_by` text,
	`cancel_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unified_analysis` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`medication_name` text NOT NULL,
	`dosage` text NOT NULL,
	`route` text NOT NULL,
	`frequency` text,
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
	`administered_in_box` integer DEFAULT 0,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prescribed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_prescriptions`("id", "patient_id", "medication_name", "dosage", "route", "frequency", "duration", "instructions", "start_time", "end_time", "status", "administrations", "prescribed_by", "prescribed_at", "cancelled_by", "cancelled_at", "cancel_reason", "administered_in_box", "created_at", "updated_at") SELECT "id", "patient_id", "medication_name", "dosage", "route", "frequency", "duration", "instructions", "start_time", "end_time", "status", "administrations", "prescribed_by", "prescribed_at", "cancelled_by", "cancelled_at", "cancel_reason", "administered_in_box", "created_at", "updated_at" FROM `prescriptions`;--> statement-breakpoint
DROP TABLE `prescriptions`;--> statement-breakpoint
ALTER TABLE `__new_prescriptions` RENAME TO `prescriptions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;