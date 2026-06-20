CREATE TABLE "placement" (
	"id" text PRIMARY KEY NOT NULL,
	"timetable_id" text NOT NULL,
	"class_group_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"slot_index" integer NOT NULL,
	"assignment_id" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"term_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"seed" integer NOT NULL,
	"slot_count" integer NOT NULL,
	"inputs_hash" text NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_timetable_id_timetable_id_fk" FOREIGN KEY ("timetable_id") REFERENCES "public"."timetable"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_class_group_id_class_group_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "placement_cell_uidx" ON "placement" USING btree ("timetable_id","class_group_id","day_of_week","slot_index");--> statement-breakpoint
CREATE INDEX "placement_timetable_idx" ON "placement" USING btree ("timetable_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_term_uidx" ON "timetable" USING btree ("term_id");