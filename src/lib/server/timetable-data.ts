// Server-only helpers for the timetable server functions. Kept OUT of timetable.ts so
// the client stub of the server fns doesn't retain these (and their db/postgres imports),
// which would crash the browser with "Buffer is not defined". Never import this from a
// client component/route.

import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  assignment,
  bellSchedule,
  classGroup,
  curriculumEntry,
  gradeLevel,
  organization,
  placement,
  subject,
  teacher,
  term,
  timetable,
} from "#/lib/db/schema";
import { DEFAULT_BELL_CONFIG, type PublishedSnapshot, buildSlots } from "#/lib/schedule.ts";
import { type LessonInput, checkFeasibility } from "#/lib/solver.ts";

export type Loaded = Awaited<ReturnType<typeof loadAll>>;

export async function loadAll(termId: string, organizationId: string) {
  const [schedRow] = await db
    .select({ config: bellSchedule.config })
    .from(bellSchedule)
    .where(eq(bellSchedule.termId, termId))
    .limit(1);
  const config = schedRow?.config ?? DEFAULT_BELL_CONFIG;
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
        gradeLevelId: curriculumEntry.gradeLevelId,
        subjectId: curriculumEntry.subjectId,
        subjectName: subject.name,
        weeklyCount: curriculumEntry.weeklyCount,
      })
      .from(curriculumEntry)
      .innerJoin(subject, eq(subject.id, curriculumEntry.subjectId))
      .where(
        and(eq(curriculumEntry.organizationId, organizationId), eq(curriculumEntry.termId, termId)),
      ),
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

export function computeReadiness(loaded: Loaded) {
  const T = loaded.slots.length;
  const blockers: string[] = [];
  if (T === 0) {
    blockers.push("The bell schedule has no teaching slots — set it up first.");
    return { ok: false, slotCount: T, blockers };
  }
  const assignedByClass = new Map<string, number>();
  const subjectsByClass = new Map<string, Set<string>>();
  for (const a of loaded.assigns) {
    assignedByClass.set(a.classGroupId, (assignedByClass.get(a.classGroupId) ?? 0) + a.weeklyCount);
    const set = subjectsByClass.get(a.classGroupId) ?? new Set();
    set.add(a.subjectId);
    subjectsByClass.set(a.classGroupId, set);
  }
  const currByGrade = new Map<string, { subjectId: string; subjectName: string }[]>();
  for (const c of loaded.curriculum) {
    if (c.weeklyCount <= 0) continue;
    const arr = currByGrade.get(c.gradeLevelId) ?? [];
    arr.push({ subjectId: c.subjectId, subjectName: c.subjectName });
    currByGrade.set(c.gradeLevelId, arr);
  }
  for (const cls of loaded.classes) {
    const assigned = assignedByClass.get(cls.id) ?? 0;
    const have = subjectsByClass.get(cls.id) ?? new Set();
    const need = currByGrade.get(cls.gradeLevelId) ?? [];
    const missing = need.filter((s) => !have.has(s.subjectId)).map((s) => s.subjectName);
    if (missing.length > 0) {
      blockers.push(`${cls.gradeName} ${cls.name}: no teacher for ${missing.join(", ")}.`);
    } else if (assigned !== T) {
      blockers.push(
        `${cls.gradeName} ${cls.name}: ${assigned}/${T} weekly slots assigned (${
          assigned < T ? `${T - assigned} short` : `${assigned - T} over`
        }).`,
      );
    }
  }
  const usedTeachers = [...new Set(loaded.assigns.map((a) => a.teacherId))];
  const feas = checkFeasibility({
    slots: loaded.slots,
    classIds: loaded.classes.map((c) => c.id),
    teacherIds: usedTeachers,
    lessons: buildLessons(loaded),
    seed: 1,
  });
  const teacherName = new Map(loaded.teachers.map((t) => [t.id, t.name]));
  for (const o of feas.overloadedTeachers) {
    blockers.push(
      `${teacherName.get(o.teacherId) ?? "A teacher"} is overloaded: ${o.load}/${T} weekly periods.`,
    );
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

// After a fresh solve, move each pinned lesson back into its pinned cell via a
// within-class swap (clash-checked), so regenerate preserves pins. Returns the set of
// cell keys that ended up pinned (un-honorable pins are silently dropped). Bounded.
export function applyPins(
  placements: { classId: string; dayOfWeek: number; slotIndex: number; assignmentId: string }[],
  pinned: { classGroupId: string; dayOfWeek: number; slotIndex: number; assignmentId: string }[],
  teacherByAssignment: Map<string, string>,
): Set<string> {
  const cellKey = (c: string, d: number, s: number) => `${c}:${d}:${s}`;
  const occKey = (t: string, d: number, s: number) => `${t}:${d}:${s}`;
  const byCell = new Map<string, (typeof placements)[number]>();
  const occ = new Map<string, string>(); // teacher@cell -> classId
  for (const p of placements) {
    byCell.set(cellKey(p.classId, p.dayOfWeek, p.slotIndex), p);
    const t = teacherByAssignment.get(p.assignmentId);
    if (t) occ.set(occKey(t, p.dayOfWeek, p.slotIndex), p.classId);
  }
  const pinnedKeys = new Set<string>();
  for (const pin of pinned) {
    const tgt = byCell.get(cellKey(pin.classGroupId, pin.dayOfWeek, pin.slotIndex));
    const tNew = teacherByAssignment.get(pin.assignmentId);
    if (!tgt || !tNew) continue; // cell/assignment no longer exists
    if (tgt.assignmentId === pin.assignmentId) {
      pinnedKeys.add(cellKey(pin.classGroupId, pin.dayOfWeek, pin.slotIndex));
      continue;
    }
    const src = placements.find(
      (p) => p.classId === pin.classGroupId && p.assignmentId === pin.assignmentId,
    );
    if (!src) continue;
    const tOld = teacherByAssignment.get(tgt.assignmentId);
    const tNewClash = occ.get(occKey(tNew, tgt.dayOfWeek, tgt.slotIndex));
    const tOldClash = tOld ? occ.get(occKey(tOld, src.dayOfWeek, src.slotIndex)) : undefined;
    if (
      (tNewClash && tNewClash !== pin.classGroupId) ||
      (tOldClash && tOldClash !== pin.classGroupId)
    ) {
      continue; // can't honor without a teacher clash
    }
    if (tOld) occ.delete(occKey(tOld, tgt.dayOfWeek, tgt.slotIndex));
    occ.delete(occKey(tNew, src.dayOfWeek, src.slotIndex));
    const tmp = tgt.assignmentId;
    tgt.assignmentId = src.assignmentId;
    src.assignmentId = tmp;
    occ.set(occKey(tNew, tgt.dayOfWeek, tgt.slotIndex), pin.classGroupId);
    if (tOld) occ.set(occKey(tOld, src.dayOfWeek, src.slotIndex), pin.classGroupId);
    pinnedKeys.add(cellKey(pin.classGroupId, pin.dayOfWeek, pin.slotIndex));
  }
  return pinnedKeys;
}
