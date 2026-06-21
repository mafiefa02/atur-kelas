ALTER TABLE "curriculum_entry" RENAME TO "subject_hours";--> statement-breakpoint
ALTER TABLE "subject_hours" RENAME CONSTRAINT "curriculum_entry_organization_id_organization_id_fk" TO "subject_hours_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "subject_hours" RENAME CONSTRAINT "curriculum_entry_term_id_term_id_fk" TO "subject_hours_term_id_term_id_fk";--> statement-breakpoint
ALTER TABLE "subject_hours" RENAME CONSTRAINT "curriculum_entry_grade_level_id_grade_level_id_fk" TO "subject_hours_grade_level_id_grade_level_id_fk";--> statement-breakpoint
ALTER TABLE "subject_hours" RENAME CONSTRAINT "curriculum_entry_subject_id_subject_id_fk" TO "subject_hours_subject_id_subject_id_fk";--> statement-breakpoint
ALTER INDEX "curriculum_grade_subject_uidx" RENAME TO "subject_hours_grade_subject_uidx";--> statement-breakpoint
ALTER INDEX "curriculum_term_idx" RENAME TO "subject_hours_term_idx";
