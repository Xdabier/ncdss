ALTER TABLE `abcde_interventions` RENAME TO `clinical_pathologies`;--> statement-breakpoint
ALTER TABLE `pathology_classification` RENAME TO `presenting_complaints`;--> statement-breakpoint
ALTER TABLE `presenting_complaints` RENAME COLUMN `pathology_name` TO `name`;--> statement-breakpoint
DROP INDEX IF EXISTS `pathology_classification_pathology_name_unique`;--> statement-breakpoint
ALTER TABLE patients ADD `chief_complaint_id` integer;--> statement-breakpoint
ALTER TABLE patients ADD `chief_complaint_category` text;--> statement-breakpoint
ALTER TABLE patients ADD `matched_pathologies` text;--> statement-breakpoint
ALTER TABLE patients ADD `suggested_nursing_interventions` text;--> statement-breakpoint
ALTER TABLE patients ADD `suggested_medical_interventions` text;--> statement-breakpoint
ALTER TABLE patients ADD `analysis_timestamp` text;--> statement-breakpoint
ALTER TABLE patients ADD `orientation_reason` text;--> statement-breakpoint
ALTER TABLE clinical_pathologies ADD `pathology_name_normalized` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE clinical_pathologies ADD `orientation` text;--> statement-breakpoint
ALTER TABLE clinical_pathologies ADD `primary_orientation` text;--> statement-breakpoint
ALTER TABLE clinical_pathologies ADD `secondary_orientation` text;--> statement-breakpoint
ALTER TABLE clinical_pathologies ADD `is_sauv` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE presenting_complaints ADD `name_normalized` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE presenting_complaints ADD `secondary_orientation` text;--> statement-breakpoint
CREATE UNIQUE INDEX `presenting_complaints_name_unique` ON `presenting_complaints` (`name`);