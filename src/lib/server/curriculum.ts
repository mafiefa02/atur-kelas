import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "#/lib/db";
import { assignment, classGroup, subjectHours, gradeLevel, subject } from "#/lib/db/schema/app.ts";

import { loadWeeklyTeachingSlots } from "./bell-schedule-data.ts";
import { requireActiveTerm } from "./context.ts";

export const getCurriculum = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  const [grades, subjects, entries, weeklyTeachingSlots] = await Promise.all([
    db
      .select()
      .from(gradeLevel)
      .where(eq(gradeLevel.organizationId, organizationId))
      .orderBy(asc(gradeLevel.sortOrder), asc(gradeLevel.name)),
    db
      .select()
      .from(subject)
      .where(eq(subject.organizationId, organizationId))
      .orderBy(asc(subject.name)),
    db
      .select({
        gradeLevelId: subjectHours.gradeLevelId,
        subjectId: subjectHours.subjectId,
        weeklyCount: subjectHours.weeklyCount,
      })
      .from(subjectHours)
      .where(
        and(eq(subjectHours.organizationId, organizationId), eq(subjectHours.termId, term.id)),
      ),
    loadWeeklyTeachingSlots(term.id),
  ]);
  return { grades, subjects, entries, weeklyTeachingSlots };
});

// Bulk set one grade's curriculum: count > 0 upserts, count <= 0 removes the entry.
export const setGradeCurriculum = createServerFn({ method: "POST" })
  .validator((data: { gradeLevelId: string; counts: Record<string, number> }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    // IDOR: grade belongs to org.
    const [grade] = await db
      .select({ id: gradeLevel.id })
      .from(gradeLevel)
      .where(
        and(eq(gradeLevel.id, data.gradeLevelId), eq(gradeLevel.organizationId, organizationId)),
      )
      .limit(1);
    if (!grade) {
      throw new Error("Grade level not found.");
    }
    const subjectIds = Object.keys(data.counts ?? {});
    if (subjectIds.length > 0) {
      // IDOR: every subject must belong to org.
      const owned = await db
        .select({ id: subject.id })
        .from(subject)
        .where(and(eq(subject.organizationId, organizationId), inArray(subject.id, subjectIds)));
      const ownedSet = new Set(owned.map((s) => s.id));
      for (const sid of subjectIds) {
        if (!ownedSet.has(sid)) {
          throw new Error("Unknown subject.");
        }
      }
    }
    await db.transaction(async (tx) => {
      // `assignment.weeklyCount` is a denormalized copy of the curriculum count, so every
      // change here must cascade to the existing assignments of this grade's classes —
      // otherwise they silently drift and break the per-class feasibility balance with no
      // obvious cause. Scoped to the active term's classes for this grade.
      const gradeClasses = await tx
        .select({ id: classGroup.id })
        .from(classGroup)
        .where(
          and(
            eq(classGroup.organizationId, organizationId),
            eq(classGroup.termId, term.id),
            eq(classGroup.gradeLevelId, data.gradeLevelId),
          ),
        );
      const classIds = gradeClasses.map((c) => c.id);

      for (const [subjectId, raw] of Object.entries(data.counts ?? {})) {
        const count = Math.round(Number(raw));
        if (!Number.isFinite(count) || count <= 0) {
          await tx
            .delete(subjectHours)
            .where(
              and(
                eq(subjectHours.termId, term.id),
                eq(subjectHours.gradeLevelId, data.gradeLevelId),
                eq(subjectHours.subjectId, subjectId),
              ),
            );
          // Subject dropped from the curriculum → its assignments are now invalid; remove
          // them so they don't linger as orphans counted toward the class total.
          if (classIds.length > 0) {
            await tx
              .delete(assignment)
              .where(
                and(
                  eq(assignment.subjectId, subjectId),
                  inArray(assignment.classGroupId, classIds),
                ),
              );
          }
          continue;
        }
        if (count > 100) {
          throw new Error("Weekly count is too large.");
        }
        await tx
          .insert(subjectHours)
          .values({
            organizationId,
            termId: term.id,
            gradeLevelId: data.gradeLevelId,
            subjectId,
            weeklyCount: count,
          })
          .onConflictDoUpdate({
            target: [subjectHours.termId, subjectHours.gradeLevelId, subjectHours.subjectId],
            set: { weeklyCount: count },
          });
        // Keep existing assignments' counts in step with the new curriculum value.
        if (classIds.length > 0) {
          await tx
            .update(assignment)
            .set({ weeklyCount: count })
            .where(
              and(eq(assignment.subjectId, subjectId), inArray(assignment.classGroupId, classIds)),
            );
        }
      }
    });
    return { ok: true };
  });
