import type { ReactNode } from "react";

import type { getOnboardingState } from "#/lib/server/onboarding.ts";

// The hasOrg:true shape — the rich state every wizard step reads from.
export type OnboardingData = Extract<
  Awaited<ReturnType<typeof getOnboardingState>>,
  { hasOrg: true }
>;

// The eight steps in setup order. Index 0 == "Step 1 of 8" in the UI.
export const STEP_NAMES = [
  "Term",
  "Grades",
  "Subjects",
  "Teachers",
  "Bell schedule",
  "Classes",
  "Curriculum",
  "Assignments",
] as const;

export const STEP_COUNT = STEP_NAMES.length;

// Per-step completion, derived from the loaded state. Mirrors the feasibility
// rules the server enforces in generateTimetable so the wizard never advertises
// "ready" for something the generator would reject.
export function stepsDone(data: OnboardingData): boolean[] {
  const balanced = (gradeId: string) =>
    data.curriculum
      .filter((e) => e.gradeLevelId === gradeId)
      .reduce((acc, e) => acc + e.weeklyCount, 0) === data.weeklyTeachingSlots;

  const curriculumDone =
    data.grades.length > 0 &&
    data.subjects.length > 0 &&
    data.weeklyTeachingSlots > 0 &&
    data.grades.every((g) => balanced(g.id));

  const assignedSubjects = new Set(data.assignments.map((a) => `${a.classGroupId}:${a.subjectId}`));
  const assignmentsDone =
    data.classes.length > 0 &&
    curriculumDone &&
    data.classes.every((c) =>
      data.curriculum
        .filter((e) => e.gradeLevelId === c.gradeLevelId)
        .every((e) => assignedSubjects.has(`${c.id}:${e.subjectId}`)),
    );

  return [
    Boolean(data.activeTerm), // Term
    data.grades.length > 0, // Grades
    data.subjects.length > 0, // Subjects
    data.teachers.length > 0, // Teachers
    data.weeklyTeachingSlots > 0, // Bell schedule
    data.classes.length > 0, // Classes
    curriculumDone, // Curriculum
    assignmentsDone, // Assignments
  ];
}

// 1-based index of the first incomplete step, or null when all eight are done.
export function firstIncompleteStep(data: OnboardingData): number | null {
  const done = stepsDone(data);
  const i = done.findIndex((d) => !d);
  return i === -1 ? null : i + 1;
}

/* ----------------------------------------------------------------------------
 * Chrome
 * ------------------------------------------------------------------------- */

export function WizardTopbar({
  schoolName,
  termName,
  right,
}: {
  schoolName: string | null;
  termName?: string | null;
  right?: ReactNode;
}) {
  return (
    <header className="flex h-14 flex-none items-center gap-3.5 border-b border-border bg-card px-6">
      <span className="font-heading text-base font-semibold tracking-tight">atur&#8209;kelas</span>
      <span className="text-border">|</span>
      <span className="truncate text-[13px] text-muted-foreground">
        {schoolName ?? "Your school"}
        {termName ? ` · ${termName}` : ""}
      </span>
      {right ? <div className="ml-auto flex items-center">{right}</div> : null}
    </header>
  );
}

// Eight progress segments + the "Step N of 8" line and the dotted step-name trail.
export function ProgressTrail({ current }: { current: number }) {
  return (
    <div className="mx-auto max-w-[620px]">
      <div className="flex gap-1.5">
        {STEP_NAMES.map((name, i) => (
          <div
            key={name}
            className={`h-1.5 flex-1 rounded-full ${i < current ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-[12.5px] text-muted-foreground">
          Step {current} of {STEP_COUNT}
          {current === STEP_COUNT ? " — last one!" : ""}
        </span>
        <span className="hidden truncate text-[12.5px] text-muted-foreground sm:block">
          {STEP_NAMES.map((name, i) => (
            <span key={name}>
              {i > 0 ? " · " : ""}
              <span className={i + 1 === current ? "font-semibold text-primary" : ""}>{name}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

// Shared step frame: progress band on top, a width-capped content column, and an
// optional footer row (Back on the left, the continue control on the right).
export function StepLayout({
  current,
  maxWidth = 620,
  children,
  footer,
}: {
  current: number;
  maxWidth?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="px-6 pt-6 pb-12">
      <ProgressTrail current={current} />
      <div
        className="mx-auto mt-7"
        style={{ maxWidth }}
      >
        {children}
      </div>
      {footer ? (
        <div
          className="mx-auto mt-5 flex items-center justify-between gap-4"
          style={{ maxWidth }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
