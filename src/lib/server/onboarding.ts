import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "#/lib/auth.ts";
import { db } from "#/lib/db";
import {
  assignment,
  bellSchedule,
  classGroup,
  gradeLevel,
  subject,
  subjectHours,
  teacher,
  term,
  timetable,
} from "#/lib/db/schema/app.ts";
import { DEFAULT_BELL_CONFIG, totalTeachingSlots } from "#/lib/schedule.ts";

// One consolidated read powering the whole setup wizard: catalogs (org-scoped),
// the active term's bell config / classes / curriculum / assignments, and whether
// a timetable already exists. The wizard derives per-step completion + readiness
// from this on the client; the authoritative feasibility gate stays server-side in
// generateTimetable. Never redirects — the wizard handles the no-org / no-term
// branches itself, so it can also create the school from a clean slate.
export const getOnboardingState = createServerFn({ method: "GET" }).handler(async () => {
  const { headers } = getRequest();
  const sess = await auth.api.getSession({ headers });
  const organizationId = sess?.session.activeOrganizationId;
  if (!organizationId) {
    return { hasOrg: false as const };
  }
  const org = await auth.api.getFullOrganization({ headers });

  // Org-scoped catalogs exist independent of any term.
  const [grades, subjects, teachers, terms] = await Promise.all([
    db
      .select({ id: gradeLevel.id, name: gradeLevel.name, sortOrder: gradeLevel.sortOrder })
      .from(gradeLevel)
      .where(eq(gradeLevel.organizationId, organizationId))
      .orderBy(asc(gradeLevel.sortOrder), asc(gradeLevel.name)),
    db
      .select({
        id: subject.id,
        name: subject.name,
        code: subject.code,
        color: subject.color,
      })
      .from(subject)
      .where(eq(subject.organizationId, organizationId))
      .orderBy(asc(subject.name)),
    db
      .select({ id: teacher.id, name: teacher.name })
      .from(teacher)
      .where(eq(teacher.organizationId, organizationId))
      .orderBy(asc(teacher.name)),
    db
      .select({
        id: term.id,
        name: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
        isActive: term.isActive,
      })
      .from(term)
      .where(eq(term.organizationId, organizationId)),
  ]);

  const activeTerm = terms.find((t) => t.isActive) ?? null;

  // Term-scoped data only resolves once a term is active.
  let bellConfig = DEFAULT_BELL_CONFIG;
  let classes: { id: string; name: string; gradeLevelId: string; gradeName: string }[] = [];
  let curriculum: {
    gradeLevelId: string;
    subjectId: string;
    subjectName: string;
    weeklyCount: number;
  }[] = [];
  let assignments: {
    classGroupId: string;
    subjectId: string;
    teacherId: string;
    weeklyCount: number;
  }[] = [];
  let timetableGenerated = false;

  if (activeTerm) {
    const [bell] = await db
      .select({ config: bellSchedule.config })
      .from(bellSchedule)
      .where(eq(bellSchedule.termId, activeTerm.id))
      .limit(1);
    if (bell) {
      bellConfig = bell.config;
    }

    [classes, curriculum, assignments] = await Promise.all([
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
        .where(eq(classGroup.termId, activeTerm.id))
        .orderBy(asc(gradeLevel.sortOrder), asc(classGroup.name)),
      db
        .select({
          gradeLevelId: subjectHours.gradeLevelId,
          subjectId: subjectHours.subjectId,
          subjectName: subject.name,
          weeklyCount: subjectHours.weeklyCount,
        })
        .from(subjectHours)
        .innerJoin(subject, eq(subject.id, subjectHours.subjectId))
        .where(eq(subjectHours.termId, activeTerm.id)),
      db
        .select({
          classGroupId: assignment.classGroupId,
          subjectId: assignment.subjectId,
          teacherId: assignment.teacherId,
          weeklyCount: assignment.weeklyCount,
        })
        .from(assignment)
        .where(eq(assignment.termId, activeTerm.id)),
    ]);

    const [tt] = await db
      .select({ id: timetable.id })
      .from(timetable)
      .where(and(eq(timetable.termId, activeTerm.id), eq(timetable.organizationId, organizationId)))
      .limit(1);
    timetableGenerated = !!tt;
  }

  return {
    hasOrg: true as const,
    schoolName: org?.name ?? null,
    activeTerm,
    grades,
    subjects,
    teachers,
    classes,
    curriculum,
    assignments,
    bellConfig,
    weeklyTeachingSlots: totalTeachingSlots(bellConfig),
    timetableGenerated,
  };
});
