ALTER TABLE `patients` ADD `hold_status` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `hold_reason` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `hold_at` text;--> statement-breakpoint
ALTER TABLE `patients` ADD `hold_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `patients` ADD `consultation_notes` text;