// Pure feasibility/coverage summary — NO db imports, so it stays unit-testable and can
// be shared by both the generate-gate readiness (timetable-data.ts) and the dashboard.
// This is the single source of truth for "is each class/teacher within its slot budget":
// computeReadiness stringifies these rows into blockers; the dashboard renders them.

export type ClassStatus = "ready" | "short" | "over" | "missing";

export type ClassCoverage = {
  classId: string;
  className: string;
  gradeName: string;
  gradeLevelId: string;
  assigned: number;
  required: number;
  missingSubjects: string[];
  status: ClassStatus;
};

export type TeacherCoverage = {
  teacherId: string;
  name: string;
  load: number;
  capacity: number;
  overloaded: boolean;
};

export type Summary = {
  slotCount: number;
  classes: ClassCoverage[];
  teachers: TeacherCoverage[];
};

// The structural subset of `Loaded` (timetable-data.ts) that the summary needs. Declared
// here so this module has no dependency on the db-backed loader.
export type SummarizeInput = {
  slots: readonly unknown[];
  classes: readonly { id: string; name: string; gradeName: string; gradeLevelId: string }[];
  assigns: readonly {
    classGroupId: string;
    subjectId: string;
    teacherId: string;
    weeklyCount: number;
  }[];
  curriculum: readonly {
    gradeLevelId: string;
    subjectId: string;
    subjectName: string;
    weeklyCount: number;
  }[];
  teachers: readonly { id: string; name: string }[];
};

export function summarize(input: SummarizeInput): Summary {
  const T = input.slots.length;

  // Per-class: assigned slot count + the set of subjects that have a teacher.
  const assignedByClass = new Map<string, number>();
  const subjectsByClass = new Map<string, Set<string>>();
  for (const a of input.assigns) {
    assignedByClass.set(a.classGroupId, (assignedByClass.get(a.classGroupId) ?? 0) + a.weeklyCount);
    const set = subjectsByClass.get(a.classGroupId) ?? new Set<string>();
    set.add(a.subjectId);
    subjectsByClass.set(a.classGroupId, set);
  }

  // Curriculum subjects required per grade (weeklyCount <= 0 means "not taught").
  const currByGrade = new Map<string, { subjectId: string; subjectName: string }[]>();
  for (const c of input.curriculum) {
    if (c.weeklyCount <= 0) continue;
    const arr = currByGrade.get(c.gradeLevelId) ?? [];
    arr.push({ subjectId: c.subjectId, subjectName: c.subjectName });
    currByGrade.set(c.gradeLevelId, arr);
  }

  const classes: ClassCoverage[] = input.classes.map((cls) => {
    const assigned = assignedByClass.get(cls.id) ?? 0;
    const have = subjectsByClass.get(cls.id) ?? new Set<string>();
    const need = currByGrade.get(cls.gradeLevelId) ?? [];
    const missingSubjects = need.filter((s) => !have.has(s.subjectId)).map((s) => s.subjectName);
    let status: ClassStatus;
    if (missingSubjects.length > 0) status = "missing";
    else if (assigned < T) status = "short";
    else if (assigned > T) status = "over";
    else status = "ready";
    return {
      classId: cls.id,
      className: cls.name,
      gradeName: cls.gradeName,
      gradeLevelId: cls.gradeLevelId,
      assigned,
      required: T,
      missingSubjects,
      status,
    };
  });

  // Per-teacher load. Overload (load > T) matches checkFeasibility's definition exactly,
  // so the dashboard can't disagree with the generate gate.
  const loadByTeacher = new Map<string, number>();
  for (const a of input.assigns) {
    loadByTeacher.set(a.teacherId, (loadByTeacher.get(a.teacherId) ?? 0) + a.weeklyCount);
  }
  const teachers: TeacherCoverage[] = input.teachers.map((t) => {
    const load = loadByTeacher.get(t.id) ?? 0;
    return { teacherId: t.id, name: t.name, load, capacity: T, overloaded: load > T };
  });

  return { slotCount: T, classes, teachers };
}
