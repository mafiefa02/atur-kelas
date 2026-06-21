import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "#/lib/db";
import { gradeLevel, subject, teacher, term, timetable } from "#/lib/db/schema/app.ts";
import { organization } from "#/lib/db/schema/auth.ts";

import { requireOrgContext } from "./context.ts";
import { summarize } from "./coverage.ts";
import { hashInputs, loadAll } from "./timetable-data.ts";

// Single read powering the dashboard "school at a glance". Deliberately uses
// requireOrgContext (NOT requireActiveTerm, which redirects to /terms) so the home
// renders for an org with no active term yet — it returns a `hasTerm: false` shape and
// the page shows a set-up-a-term prompt. All db use stays inside the handler so the
// client RPC stub doesn't retain db/postgres (the "Buffer is not defined" leak).
export const getDashboardSummary = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireOrgContext();

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const schoolName = org?.name ?? "School";

  // Grades double as the stat count and the naming/ordering source for curriculum-by-grade.
  const grades = await db
    .select({ id: gradeLevel.id, name: gradeLevel.name })
    .from(gradeLevel)
    .where(eq(gradeLevel.organizationId, organizationId))
    .orderBy(asc(gradeLevel.sortOrder), asc(gradeLevel.name));

  const [activeTerm] = await db
    .select()
    .from(term)
    .where(and(eq(term.organizationId, organizationId), eq(term.isActive, true)))
    .limit(1);

  if (!activeTerm) {
    const [subjects, teachers] = await Promise.all([
      db.$count(subject, eq(subject.organizationId, organizationId)),
      db.$count(teacher, eq(teacher.organizationId, organizationId)),
    ]);
    return {
      schoolName,
      hasTerm: false as const,
      counts: { grades: grades.length, subjects, teachers },
    };
  }

  const loaded = await loadAll(activeTerm.id, organizationId);
  const summary = summarize(loaded);

  const [tt] = await db
    .select()
    .from(timetable)
    .where(eq(timetable.termId, activeTerm.id))
    .limit(1);

  // Timetable lifecycle. "live" = current classes present in the published snapshot — a
  // class added after publishing isn't in the point-in-time snapshot, so its share link
  // shows "not published". This is the only genuinely per-class metric the model supports.
  let timetableStatus:
    | { status: "none" }
    | {
        status: "draft" | "published";
        generatedAt: Date;
        stale: boolean;
        live: number;
        total: number;
      };
  if (!tt) {
    timetableStatus = { status: "none" };
  } else {
    const total = loaded.classes.length;
    let live = total;
    if (tt.status === "published") {
      const snapClasses = tt.publishedSnapshot?.classes ?? {};
      live = loaded.classes.filter((c) => snapClasses[c.id]).length;
    }
    timetableStatus = {
      status: tt.status,
      generatedAt: tt.generatedAt,
      stale: tt.inputsHash !== hashInputs(loaded),
      live,
      total,
    };
  }

  // Curriculum grouped per grade (only grades that actually have allocations), each
  // sorted by weekly count then name, with the per-grade total for eyeballing vs slots.
  const gradeName = new Map(grades.map((g) => [g.id, g.name]));
  const byGrade = new Map<string, { subjectName: string; weeklyCount: number }[]>();
  for (const c of loaded.curriculum) {
    if (c.weeklyCount <= 0) continue;
    const arr = byGrade.get(c.gradeLevelId) ?? [];
    arr.push({ subjectName: c.subjectName, weeklyCount: c.weeklyCount });
    byGrade.set(c.gradeLevelId, arr);
  }
  const curriculumByGrade = grades
    .filter((g) => byGrade.has(g.id))
    .map((g) => {
      const entries = (byGrade.get(g.id) ?? []).sort(
        (a, b) => b.weeklyCount - a.weeklyCount || a.subjectName.localeCompare(b.subjectName),
      );
      return {
        gradeLevelId: g.id,
        gradeName: gradeName.get(g.id) ?? "",
        entries,
        total: entries.reduce((sum, e) => sum + e.weeklyCount, 0),
      };
    });

  const issueCount =
    summary.slotCount === 0
      ? 1
      : summary.classes.filter((c) => c.status !== "ready").length +
        summary.teachers.filter((t) => t.overloaded).length;

  return {
    schoolName,
    hasTerm: true as const,
    termName: activeTerm.name,
    termStart: activeTerm.startDate,
    termEnd: activeTerm.endDate,
    counts: {
      grades: grades.length,
      subjects: loaded.subjects.length,
      teachers: loaded.teachers.length,
      classes: loaded.classes.length,
    },
    slotCount: summary.slotCount,
    classes: summary.classes,
    teachers: summary.teachers,
    curriculumByGrade,
    timetable: timetableStatus,
    readyToGenerate: issueCount === 0,
    issueCount,
  };
});
