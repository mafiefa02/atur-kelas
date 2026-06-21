import {
  BellIcon,
  BookOpenIcon,
  ChalkboardTeacherIcon,
  GraduationCapIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { CoveragePanel } from "#/components/dashboard/coverage-panel.tsx";
import { CurriculumPanel } from "#/components/dashboard/curriculum-panel.tsx";
import { StatCard } from "#/components/dashboard/stat-card.tsx";
import { StatusStrip } from "#/components/dashboard/status-strip.tsx";
import { TeacherLoadPanel } from "#/components/dashboard/teacher-load-panel.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import { getDashboardSummary } from "#/lib/server/dashboard.ts";

export const Route = createFileRoute("/_authed/_app/dashboard")({
  loader: () => getDashboardSummary(),
  component: DashboardPage,
});

function termSubtitle(name: string, start: string | null, end: string | null): string {
  if (start && end) return `${name} · ${start} – ${end}`;
  return name;
}

function DashboardPage() {
  const data = Route.useLoaderData();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header>
        <h1 className="font-heading text-xl font-semibold">{data.schoolName}</h1>
        <p className="text-sm text-muted-foreground">
          {data.hasTerm
            ? termSubtitle(data.termName, data.termStart, data.termEnd)
            : "No active term"}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Grades"
          value={data.counts.grades}
          icon={GraduationCapIcon}
          to="/grades"
        />
        <StatCard
          label="Subjects"
          value={data.counts.subjects}
          icon={BookOpenIcon}
          to="/subjects"
        />
        <StatCard
          label="Teachers"
          value={data.counts.teachers}
          icon={ChalkboardTeacherIcon}
          to="/teachers"
        />
        <StatCard
          label="Classes"
          value={data.hasTerm ? data.counts.classes : 0}
          icon={UsersThreeIcon}
          to="/classes"
        />
        <StatCard
          label="Slots / week"
          value={data.hasTerm ? data.slotCount : "—"}
          icon={BellIcon}
          to="/schedule"
        />
      </div>

      {data.hasTerm ? (
        <>
          <StatusStrip
            timetable={data.timetable}
            readyToGenerate={data.readyToGenerate}
            issueCount={data.issueCount}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <CoveragePanel classes={data.classes} />
            <TeacherLoadPanel teachers={data.teachers} />
          </div>
          <CurriculumPanel
            curriculumByGrade={data.curriculumByGrade}
            slotCount={data.slotCount}
          />
        </>
      ) : (
        <Card className="items-start gap-3 px-5 py-5">
          <p className="font-medium">No active term</p>
          <p className="text-sm text-muted-foreground">
            Timetabling data is scoped to a term. Create one and mark it active to start setting up
            classes, the bell schedule, and assignments.
          </p>
          <Link
            to="/terms"
            className={buttonVariants({ size: "sm" })}
          >
            Set up a term
          </Link>
        </Card>
      )}
    </div>
  );
}
