import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  assignment,
  classGroup,
  curriculumEntry,
  gradeLevel,
  subject,
  teacher,
} from "#/lib/db/schema";

import { loadWeeklyTeachingSlots } from "./bell-schedule-data.ts";
import { requireActiveTerm } from "./context.ts";

export const getAssignmentsData = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  const [classes, teachers, curriculum, assignments, weeklyTeachingSlots] = await Promise.all([
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
      .where(and(eq(classGroup.organizationId, organizationId), eq(classGroup.termId, term.id)))
      .orderBy(asc(gradeLevel.sortOrder), asc(classGroup.name)),
    db
      .select({ id: teacher.id, name: teacher.name })
      .from(teacher)
      .where(eq(teacher.organizationId, organizationId))
      .orderBy(asc(teacher.name)),
    db
      .select({
        gradeLevelId: curriculumEntry.gradeLevelId,
        subjectId: curriculumEntry.subjectId,
        subjectName: subject.name,
        weeklyCount: curriculumEntry.weeklyCount,
      })
      .from(curriculumEntry)
      .innerJoin(subject, eq(subject.id, curriculumEntry.subjectId))
      .where(
        and(
          eq(curriculumEntry.organizationId, organizationId),
          eq(curriculumEntry.termId, term.id),
        ),
      )
      .orderBy(asc(subject.name)),
    db
      .select({
        classGroupId: assignment.classGroupId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        weeklyCount: assignment.weeklyCount,
      })
      .from(assignment)
      .where(and(eq(assignment.organizationId, organizationId), eq(assignment.termId, term.id))),
    loadWeeklyTeachingSlots(term.id),
  ]);
  return { classes, teachers, curriculum, assignments, weeklyTeachingSlots };
});

// Bulk set one class's teacher-per-subject. teacherId null/empty removes the
// assignment; otherwise upsert, seeding weeklyCount from the grade's curriculum.
export const setClassAssignments = createServerFn({ method: "POST" })
  .validator(
    (data: { classGroupId: string; teacherBySubject: Record<string, string | null> }) => data,
  )
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const [cls] = await db
      .select({ id: classGroup.id, gradeLevelId: classGroup.gradeLevelId })
      .from(classGroup)
      .where(
        and(
          eq(classGroup.id, data.classGroupId),
          eq(classGroup.organizationId, organizationId),
          eq(classGroup.termId, term.id),
        ),
      )
      .limit(1);
    if (!cls) {
      throw new Error("Class not found.");
    }

    const curr = await db
      .select({ subjectId: curriculumEntry.subjectId, weeklyCount: curriculumEntry.weeklyCount })
      .from(curriculumEntry)
      .where(
        and(
          eq(curriculumEntry.termId, term.id),
          eq(curriculumEntry.gradeLevelId, cls.gradeLevelId),
        ),
      );
    const weeklyBySubject = new Map(curr.map((c) => [c.subjectId, c.weeklyCount]));

    const teacherIds = Object.values(data.teacherBySubject).filter((v): v is string => Boolean(v));
    let ownedTeachers = new Set<string>();
    if (teacherIds.length > 0) {
      const owned = await db
        .select({ id: teacher.id })
        .from(teacher)
        .where(and(eq(teacher.organizationId, organizationId), inArray(teacher.id, teacherIds)));
      ownedTeachers = new Set(owned.map((t) => t.id));
    }

    await db.transaction(async (tx) => {
      for (const [subjectId, teacherId] of Object.entries(data.teacherBySubject)) {
        if (!teacherId) {
          await tx
            .delete(assignment)
            .where(
              and(
                eq(assignment.classGroupId, data.classGroupId),
                eq(assignment.subjectId, subjectId),
              ),
            );
          continue;
        }
        if (!ownedTeachers.has(teacherId)) {
          throw new Error("Unknown teacher.");
        }
        const weeklyCount = weeklyBySubject.get(subjectId);
        if (weeklyCount === undefined) {
          throw new Error("Subject is not in this grade's curriculum.");
        }
        await tx
          .insert(assignment)
          .values({
            organizationId,
            termId: term.id,
            classGroupId: data.classGroupId,
            subjectId,
            teacherId,
            weeklyCount,
          })
          .onConflictDoUpdate({
            target: [assignment.classGroupId, assignment.subjectId],
            set: { teacherId, weeklyCount },
          });
      }
    });
    return { ok: true };
  });
