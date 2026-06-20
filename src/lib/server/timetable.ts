import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { assignment, placement, subject, teacher, timetable } from "#/lib/db/schema";
import { solve } from "#/lib/solver.ts";

import { requireActiveTerm } from "./context.ts";
import {
  applyPins,
  buildLessons,
  buildPublishedSnapshot,
  computeReadiness,
  hashInputs,
  loadAll,
  randomSeed,
} from "./timetable-data.ts";

export const generateTimetable = createServerFn({ method: "POST" })
  .validator((data: { newSeed?: boolean }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const loaded = await loadAll(term.id, organizationId);
    const readiness = computeReadiness(loaded);
    if (!readiness.ok) {
      return { ok: false as const, blockers: readiness.blockers };
    }
    const [existing] = await db
      .select({ id: timetable.id, seed: timetable.seed })
      .from(timetable)
      .where(eq(timetable.termId, term.id))
      .limit(1);
    const seed = data.newSeed || !existing ? randomSeed() : existing.seed;

    // Capture pins so regenerate preserves them.
    const pinned = existing
      ? await db
          .select({
            classGroupId: placement.classGroupId,
            dayOfWeek: placement.dayOfWeek,
            slotIndex: placement.slotIndex,
            assignmentId: placement.assignmentId,
          })
          .from(placement)
          .where(and(eq(placement.timetableId, existing.id), eq(placement.isPinned, true)))
      : [];

    const result = solve({
      slots: loaded.slots,
      classIds: loaded.classes.map((c) => c.id),
      teacherIds: [...new Set(loaded.assigns.map((a) => a.teacherId))],
      lessons: buildLessons(loaded),
      seed,
    });
    const teacherByAssignment = new Map(loaded.assigns.map((a) => [a.id, a.teacherId]));
    const pinnedKeys = applyPins(result.placements, pinned, teacherByAssignment);
    const inputsHash = hashInputs(loaded);

    await db.transaction(async (tx) => {
      const [tt] = await tx
        .insert(timetable)
        .values({
          organizationId,
          termId: term.id,
          status: "draft",
          seed,
          slotCount: loaded.slots.length,
          inputsHash,
          generatedAt: new Date(),
          publishedAt: null,
        })
        .onConflictDoUpdate({
          target: timetable.termId,
          set: {
            status: "draft",
            seed,
            slotCount: loaded.slots.length,
            inputsHash,
            generatedAt: new Date(),
            publishedAt: null,
          },
        })
        .returning({ id: timetable.id });
      await tx.delete(placement).where(eq(placement.timetableId, tt.id));
      await tx.insert(placement).values(
        result.placements.map((p) => ({
          timetableId: tt.id,
          classGroupId: p.classId,
          dayOfWeek: p.dayOfWeek,
          slotIndex: p.slotIndex,
          assignmentId: p.assignmentId,
          isPinned: pinnedKeys.has(`${p.classId}:${p.dayOfWeek}:${p.slotIndex}`),
        })),
      );
    });
    return { ok: true as const };
  });

export const getTimetableView = createServerFn({ method: "GET" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  const loaded = await loadAll(term.id, organizationId);
  const readiness = computeReadiness(loaded);

  const [tt] = await db.select().from(timetable).where(eq(timetable.termId, term.id)).limit(1);

  let placements: {
    classGroupId: string;
    dayOfWeek: number;
    slotIndex: number;
    subjectName: string;
    subjectColor: string | null;
    teacherName: string;
    isPinned: boolean;
  }[] = [];
  let stale = false;
  if (tt) {
    stale = tt.inputsHash !== hashInputs(loaded);
    placements = await db
      .select({
        classGroupId: placement.classGroupId,
        dayOfWeek: placement.dayOfWeek,
        slotIndex: placement.slotIndex,
        subjectName: subject.name,
        subjectColor: subject.color,
        teacherName: teacher.name,
        isPinned: placement.isPinned,
      })
      .from(placement)
      .innerJoin(assignment, eq(assignment.id, placement.assignmentId))
      .innerJoin(subject, eq(subject.id, assignment.subjectId))
      .innerJoin(teacher, eq(teacher.id, assignment.teacherId))
      .where(eq(placement.timetableId, tt.id));
  }

  return {
    termName: term.name,
    readiness,
    slots: loaded.slots,
    classes: loaded.classes.map((c) => ({ id: c.id, name: c.name, gradeName: c.gradeName })),
    timetable: tt ? { status: tt.status, generatedAt: tt.generatedAt, stale } : null,
    placements,
  };
});

export const publishTimetable = createServerFn({ method: "POST" }).handler(async () => {
  const { term, organizationId } = await requireActiveTerm();
  const publishedAt = new Date();
  // Snapshot the current grid so the public page is a stable point-in-time copy,
  // immune to later assignment/curriculum edits.
  const snapshot = await buildPublishedSnapshot(term.id, organizationId, publishedAt);
  if (!snapshot) {
    return { ok: false as const, error: "Generate a timetable before publishing." };
  }
  await db
    .update(timetable)
    .set({ status: "published", publishedAt, publishedSnapshot: snapshot })
    .where(and(eq(timetable.termId, term.id), eq(timetable.organizationId, organizationId)));
  return { ok: true as const };
});

// Swap two cells within one class. Hard-blocks teacher clashes and pinned cells;
// returns a soft warning if it clusters a subject on a day. Any edit reverts to draft.
export const swapPlacements = createServerFn({ method: "POST" })
  .validator(
    (data: {
      classGroupId: string;
      a: { dayOfWeek: number; slotIndex: number };
      b: { dayOfWeek: number; slotIndex: number };
    }) => data,
  )
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const [tt] = await db
      .select({ id: timetable.id })
      .from(timetable)
      .where(and(eq(timetable.termId, term.id), eq(timetable.organizationId, organizationId)))
      .limit(1);
    if (!tt) {
      return { ok: false as const, error: "No timetable yet." };
    }
    const rows = await db
      .select({
        id: placement.id,
        classGroupId: placement.classGroupId,
        dayOfWeek: placement.dayOfWeek,
        slotIndex: placement.slotIndex,
        assignmentId: placement.assignmentId,
        isPinned: placement.isPinned,
        teacherId: assignment.teacherId,
        subjectId: assignment.subjectId,
      })
      .from(placement)
      .innerJoin(assignment, eq(assignment.id, placement.assignmentId))
      .where(eq(placement.timetableId, tt.id));

    const find = (d: number, s: number) =>
      rows.find(
        (r) => r.classGroupId === data.classGroupId && r.dayOfWeek === d && r.slotIndex === s,
      );
    const pa = find(data.a.dayOfWeek, data.a.slotIndex);
    const pb = find(data.b.dayOfWeek, data.b.slotIndex);
    if (!pa || !pb) {
      return { ok: false as const, error: "Cell not found." };
    }
    if (pa.isPinned || pb.isPinned) {
      return { ok: false as const, error: "A pinned lesson can't be moved — unpin it first." };
    }
    // Hard: teacher clash. pa.teacher would move to b's slot, pb.teacher to a's slot.
    if (pa.teacherId !== pb.teacherId) {
      const clashAtB = rows.some(
        (r) =>
          r.classGroupId !== data.classGroupId &&
          r.dayOfWeek === pb.dayOfWeek &&
          r.slotIndex === pb.slotIndex &&
          r.teacherId === pa.teacherId,
      );
      const clashAtA = rows.some(
        (r) =>
          r.classGroupId !== data.classGroupId &&
          r.dayOfWeek === pa.dayOfWeek &&
          r.slotIndex === pa.slotIndex &&
          r.teacherId === pb.teacherId,
      );
      if (clashAtB || clashAtA) {
        return {
          ok: false as const,
          error: "That move double-books a teacher in the target slot.",
        };
      }
    }
    // Soft: same subject twice on a day for this class after the move.
    const sameSubjectSameDay = (subjectId: string, day: number, ignore: string) =>
      rows.some(
        (r) =>
          r.classGroupId === data.classGroupId &&
          r.dayOfWeek === day &&
          r.subjectId === subjectId &&
          r.id !== ignore,
      );
    let warning: string | undefined;
    if (
      pa.dayOfWeek !== pb.dayOfWeek &&
      (sameSubjectSameDay(pa.subjectId, pb.dayOfWeek, pa.id) ||
        sameSubjectSameDay(pb.subjectId, pa.dayOfWeek, pb.id))
    ) {
      warning = "Heads up: this puts the same subject twice on one day for this class.";
    }

    await db.transaction(async (tx) => {
      await tx
        .update(placement)
        .set({ assignmentId: pb.assignmentId })
        .where(eq(placement.id, pa.id));
      await tx
        .update(placement)
        .set({ assignmentId: pa.assignmentId })
        .where(eq(placement.id, pb.id));
      await tx
        .update(timetable)
        .set({ status: "draft", publishedAt: null })
        .where(eq(timetable.id, tt.id));
    });
    return { ok: true as const, warning };
  });

export const togglePin = createServerFn({ method: "POST" })
  .validator((data: { classGroupId: string; dayOfWeek: number; slotIndex: number }) => data)
  .handler(async ({ data }) => {
    const { term, organizationId } = await requireActiveTerm();
    const [tt] = await db
      .select({ id: timetable.id })
      .from(timetable)
      .where(and(eq(timetable.termId, term.id), eq(timetable.organizationId, organizationId)))
      .limit(1);
    if (!tt) {
      return { ok: false as const };
    }
    const [p] = await db
      .select({ id: placement.id, isPinned: placement.isPinned })
      .from(placement)
      .where(
        and(
          eq(placement.timetableId, tt.id),
          eq(placement.classGroupId, data.classGroupId),
          eq(placement.dayOfWeek, data.dayOfWeek),
          eq(placement.slotIndex, data.slotIndex),
        ),
      )
      .limit(1);
    if (!p) {
      return { ok: false as const };
    }
    await db.update(placement).set({ isPinned: !p.isPinned }).where(eq(placement.id, p.id));
    return { ok: true as const, isPinned: !p.isPinned };
  });
