import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { BellConfig, PublishedSnapshot } from "#/lib/schedule.ts";
import { DEFAULT_BELL_CONFIG } from "#/lib/schedule.ts";

import { organization, user } from "./auth";

// --- Shared column helpers (fresh builders per table) ---
const pk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const orgRef = () =>
  text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const termRef = () =>
  text("term_id")
    .notNull()
    .references(() => term.id, { onDelete: "cascade" });
const timestamps = () => ({
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// FK delete policy:
//   organizationId / termId  -> cascade (deleting the tenant or term wipes its data)
//   catalog refs (gradeLevel, subject, teacher) -> restrict (block deletion while in use)
//   classGroupId in assignment -> cascade (deleting a class removes its assignments)

// === Term (semester) — the top scoping unit for setup ===
export const term = pgTable(
  "term",
  {
    id: pk(),
    organizationId: orgRef(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    isActive: boolean("is_active").default(false).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("term_org_idx").on(t.organizationId),
    // At most one active term per organization (DB-enforced).
    uniqueIndex("term_one_active_per_org")
      .on(t.organizationId)
      .where(sql`${t.isActive}`),
  ],
);

// === Grade level (tingkat), e.g. "Kelas 7" — curriculum is defined here ===
export const gradeLevel = pgTable(
  "grade_level",
  {
    id: pk(),
    organizationId: orgRef(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [index("grade_level_org_idx").on(t.organizationId)],
);

// === Subject (mata pelajaran) ===
export const subject = pgTable(
  "subject",
  {
    id: pk(),
    organizationId: orgRef(),
    name: text("name").notNull(),
    code: text("code"),
    color: text("color"),
    ...timestamps(),
  },
  (t) => [index("subject_org_idx").on(t.organizationId)],
);

// === Teacher — a data record, optionally linked to a login account ===
export const teacher = pgTable(
  "teacher",
  {
    id: pk(),
    organizationId: orgRef(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    ...timestamps(),
  },
  (t) => [index("teacher_org_idx").on(t.organizationId)],
);

// === Class group (rombel), e.g. "7A" — belongs to a grade within a term ===
export const classGroup = pgTable(
  "class_group",
  {
    id: pk(),
    organizationId: orgRef(),
    termId: termRef(),
    gradeLevelId: text("grade_level_id")
      .notNull()
      .references(() => gradeLevel.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Unguessable token for the public per-class share link (capability URL).
    shareToken: text("share_token")
      .notNull()
      .unique()
      .default(sql`(gen_random_uuid())::text`),
    ...timestamps(),
  },
  (t) => [
    index("class_group_term_idx").on(t.termId),
    index("class_group_grade_idx").on(t.gradeLevelId),
  ],
);

// === Bell schedule — one per term. The weekly grid is a config blob (period
// length + per-day window + breaks); teaching slots are DERIVED, not stored
// (see src/lib/schedule.ts). ===
export const bellSchedule = pgTable(
  "bell_schedule",
  {
    id: pk(),
    organizationId: orgRef(),
    termId: termRef(),
    config: jsonb("config").$type<BellConfig>().notNull().default(DEFAULT_BELL_CONFIG),
    ...timestamps(),
  },
  (t) => [uniqueIndex("bell_schedule_term_uidx").on(t.termId)],
);

// === Curriculum entry — per grade: a subject's weekly occurrence count ===
export const curriculumEntry = pgTable(
  "curriculum_entry",
  {
    id: pk(),
    organizationId: orgRef(),
    termId: termRef(),
    gradeLevelId: text("grade_level_id")
      .notNull()
      .references(() => gradeLevel.id, { onDelete: "restrict" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subject.id, { onDelete: "restrict" }),
    weeklyCount: integer("weekly_count").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("curriculum_grade_subject_uidx").on(t.termId, t.gradeLevelId, t.subjectId),
    index("curriculum_term_idx").on(t.termId),
  ],
);

// === Assignment (teaching load) — per class: which teacher teaches a subject ===
export const assignment = pgTable(
  "assignment",
  {
    id: pk(),
    organizationId: orgRef(),
    termId: termRef(),
    classGroupId: text("class_group_id")
      .notNull()
      .references(() => classGroup.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subject.id, { onDelete: "restrict" }),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teacher.id, { onDelete: "restrict" }),
    weeklyCount: integer("weekly_count").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("assignment_class_subject_uidx").on(t.classGroupId, t.subjectId),
    index("assignment_term_idx").on(t.termId),
    index("assignment_teacher_idx").on(t.teacherId),
  ],
);

// === Timetable — one per term; the generated schedule (draft or published) ===
export const timetable = pgTable(
  "timetable",
  {
    id: pk(),
    organizationId: orgRef(),
    termId: termRef(),
    status: text("status").$type<"draft" | "published">().default("draft").notNull(),
    seed: integer("seed").notNull(),
    // Inputs stamp for stale detection (bell schedule + assignments at generation time).
    slotCount: integer("slot_count").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
    // Denormalized point-in-time copy written on publish; the public page reads this.
    publishedSnapshot: jsonb("published_snapshot").$type<PublishedSnapshot>(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("timetable_term_uidx").on(t.termId)],
);

// === Placement — one lesson in one (class, day, slot) cell ===
export const placement = pgTable(
  "placement",
  {
    id: pk(),
    timetableId: text("timetable_id")
      .notNull()
      .references(() => timetable.id, { onDelete: "cascade" }),
    classGroupId: text("class_group_id")
      .notNull()
      .references(() => classGroup.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    slotIndex: integer("slot_index").notNull(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignment.id, { onDelete: "cascade" }),
    isPinned: boolean("is_pinned").default(false).notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("placement_cell_uidx").on(t.timetableId, t.classGroupId, t.dayOfWeek, t.slotIndex),
    index("placement_timetable_idx").on(t.timetableId),
  ],
);

// === Relations (for nested reads via db.query.*) ===
export const termRelations = relations(term, ({ many, one }) => ({
  organization: one(organization, {
    fields: [term.organizationId],
    references: [organization.id],
  }),
  classGroups: many(classGroup),
  curriculumEntries: many(curriculumEntry),
  assignments: many(assignment),
  bellSchedule: one(bellSchedule),
}));

export const gradeLevelRelations = relations(gradeLevel, ({ many }) => ({
  classGroups: many(classGroup),
  curriculumEntries: many(curriculumEntry),
}));

export const subjectRelations = relations(subject, ({ many }) => ({
  curriculumEntries: many(curriculumEntry),
  assignments: many(assignment),
}));

export const teacherRelations = relations(teacher, ({ many, one }) => ({
  assignments: many(assignment),
  user: one(user, { fields: [teacher.userId], references: [user.id] }),
}));

export const classGroupRelations = relations(classGroup, ({ many, one }) => ({
  term: one(term, { fields: [classGroup.termId], references: [term.id] }),
  gradeLevel: one(gradeLevel, {
    fields: [classGroup.gradeLevelId],
    references: [gradeLevel.id],
  }),
  assignments: many(assignment),
}));

export const bellScheduleRelations = relations(bellSchedule, ({ one }) => ({
  term: one(term, { fields: [bellSchedule.termId], references: [term.id] }),
}));

export const curriculumEntryRelations = relations(curriculumEntry, ({ one }) => ({
  term: one(term, { fields: [curriculumEntry.termId], references: [term.id] }),
  gradeLevel: one(gradeLevel, {
    fields: [curriculumEntry.gradeLevelId],
    references: [gradeLevel.id],
  }),
  subject: one(subject, {
    fields: [curriculumEntry.subjectId],
    references: [subject.id],
  }),
}));

export const assignmentRelations = relations(assignment, ({ one }) => ({
  term: one(term, { fields: [assignment.termId], references: [term.id] }),
  classGroup: one(classGroup, {
    fields: [assignment.classGroupId],
    references: [classGroup.id],
  }),
  subject: one(subject, {
    fields: [assignment.subjectId],
    references: [subject.id],
  }),
  teacher: one(teacher, {
    fields: [assignment.teacherId],
    references: [teacher.id],
  }),
}));
