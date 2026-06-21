// Server-only helpers for the timetable server functions. Kept OUT of timetable.ts so
// the client stub of the server fns doesn't retain these (and their db/postgres imports),
// which would crash the browser with "Buffer is not defined". Never import this from a
// client component/route.

import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  assignment,
  classGroup,
  subjectHours,
  gradeLevel,
  placement,
  subject,
  teacher,
  term,
  timetable,
} from "#/lib/db/schema/app.ts";
import { organization } from "#/lib/db/schema/auth.ts";
import { type PublishedSnapshot, buildSlots } from "#/lib/schedule.ts";
import type { LessonInput } from "#/lib/solver.ts";

import { loadBellConfig } from "./bell-schedule-data.ts";
import { summarize } from "./coverage.ts";

export type Loaded = Awaited<ReturnType<typeof loadAll>>;

export async function loadAll(termId: string, organizationId: string) {
  const config = await loadBellConfig(termId);
  // Enriched with times for the grid; extra fields are ignored by the solver.
  const slots = buildSlots(config);
  const [classes, assigns, curriculum, subjects, teachers] = await Promise.all([
    db
      .select({
        id: classGroup.id,
        name: classGroup.name,
        gradeLevelId: classGroup.gradeLevelId,
        gradeName: gradeLevel.name,
        gradeSort: gradeLevel.sortOrder,
      })
      .from(classGroup)
      .innerJoin(gradeLevel, eq(gradeLevel.id, classGroup.gradeLevelId))
      .where(and(eq(classGroup.organizationId, organizationId), eq(classGroup.termId, termId)))
      .orderBy(asc(gradeLevel.sortOrder), asc(classGroup.name)),
    db
      .select({
        id: assignment.id,
        classGroupId: assignment.classGroupId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        weeklyCount: assignment.weeklyCount,
      })
      .from(assignment)
      .where(and(eq(assignment.organizationId, organizationId), eq(assignment.termId, termId))),
    db
      .select({
        gradeLevelId: subjectHours.gradeLevelId,
        subjectId: subjectHours.subjectId,
        subjectName: subject.name,
        weeklyCount: subjectHours.weeklyCount,
      })
      .from(subjectHours)
      .innerJoin(subject, eq(subject.id, subjectHours.subjectId))
      .where(and(eq(subjectHours.organizationId, organizationId), eq(subjectHours.termId, termId))),
    db
      .select({ id: subject.id, name: subject.name, color: subject.color })
      .from(subject)
      .where(eq(subject.organizationId, organizationId)),
    db
      .select({ id: teacher.id, name: teacher.name })
      .from(teacher)
      .where(eq(teacher.organizationId, organizationId)),
  ]);
  return { config, slots, classes, assigns, curriculum, subjects, teachers };
}

export function buildLessons(loaded: Loaded): LessonInput[] {
  const lessons: LessonInput[] = [];
  for (const a of loaded.assigns) {
    for (let i = 0; i < a.weeklyCount; i++) {
      lessons.push({
        classId: a.classGroupId,
        subjectId: a.subjectId,
        teacherId: a.teacherId,
        assignmentId: a.id,
      });
    }
  }
  return lessons;
}

// The generate gate. Derives its blocker strings from the shared `summarize` so the
// dashboard's per-class/per-teacher view and this gate can never disagree.
export function computeReadiness(loaded: Loaded) {
  const { slotCount: T, classes, teachers } = summarize(loaded);
  const blockers: string[] = [];
  if (T === 0) {
    blockers.push("The bell schedule has no teaching slots — set it up first.");
    return { ok: false, slotCount: T, blockers };
  }
  for (const c of classes) {
    if (c.missingSubjects.length > 0) {
      blockers.push(
        `${c.gradeName} ${c.className}: no teacher for ${c.missingSubjects.join(", ")}.`,
      );
    } else if (c.assigned !== T) {
      blockers.push(
        `${c.gradeName} ${c.className}: ${c.assigned}/${T} weekly slots assigned (${
          c.assigned < T ? `${T - c.assigned} short` : `${c.assigned - T} over`
        }).`,
      );
    }
  }
  for (const t of teachers) {
    if (t.overloaded) {
      blockers.push(`${t.name} is overloaded: ${t.load}/${T} weekly periods.`);
    }
  }
  return { ok: blockers.length === 0, slotCount: T, blockers };
}

export function hashInputs(loaded: Loaded): string {
  const sig = JSON.stringify({
    slots: loaded.slots.map((s) => `${s.dayOfWeek}:${s.slotIndex}`),
    assigns: loaded.assigns
      .map((a) => `${a.classGroupId}|${a.subjectId}|${a.teacherId}|${a.weeklyCount}`)
      .sort(),
  });
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 33) + sig.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647);
}

// Build the denormalized public snapshot from the current placements (written on publish).
export async function buildPublishedSnapshot(
  termId: string,
  organizationId: string,
  publishedAt: Date,
): Promise<PublishedSnapshot | null> {
  const [tt] = await db
    .select({ id: timetable.id })
    .from(timetable)
    .where(eq(timetable.termId, termId))
    .limit(1);
  if (!tt) return null;
  const loaded = await loadAll(termId, organizationId);
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const [t] = await db.select({ name: term.name }).from(term).where(eq(term.id, termId)).limit(1);
  const rows = await db
    .select({
      classGroupId: placement.classGroupId,
      dayOfWeek: placement.dayOfWeek,
      slotIndex: placement.slotIndex,
      subjectName: subject.name,
      subjectColor: subject.color,
      teacherName: teacher.name,
    })
    .from(placement)
    .innerJoin(assignment, eq(assignment.id, placement.assignmentId))
    .innerJoin(subject, eq(subject.id, assignment.subjectId))
    .innerJoin(teacher, eq(teacher.id, assignment.teacherId))
    .where(eq(placement.timetableId, tt.id));

  const classes: PublishedSnapshot["classes"] = {};
  for (const c of loaded.classes) {
    classes[c.id] = { name: c.name, gradeName: c.gradeName, cells: [] };
  }
  for (const r of rows) {
    classes[r.classGroupId]?.cells.push({
      dayOfWeek: r.dayOfWeek,
      slotIndex: r.slotIndex,
      subjectName: r.subjectName,
      subjectColor: r.subjectColor,
      teacherName: r.teacherName,
    });
  }
  return {
    schoolName: org?.name ?? "School",
    termName: t?.name ?? "",
    publishedAt: publishedAt.toISOString(),
    slots: loaded.slots.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      slotIndex: s.slotIndex,
      start: s.start,
      end: s.end,
    })),
    classes,
  };
}
