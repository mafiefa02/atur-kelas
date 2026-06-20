ALTER TABLE "class_group" ADD COLUMN "share_token" text DEFAULT (gen_random_uuid())::text NOT NULL;--> statement-breakpoint
ALTER TABLE "timetable" ADD COLUMN "published_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "class_group" ADD CONSTRAINT "class_group_share_token_unique" UNIQUE("share_token");