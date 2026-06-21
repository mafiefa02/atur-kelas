import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { getAssignmentsData, setClassAssignments } from "#/lib/server/assignments.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/_authed/_app/assignments")({
  loader: () => getAssignmentsData(),
  component: AssignmentsPage,
});

type Data = Awaited<ReturnType<typeof getAssignmentsData>>;
type CurriculumRow = { subjectId: string; subjectName: string; weeklyCount: number };
const NONE = "__none__";

function AssignmentsPage() {
  const { classes, teachers, curriculum, assignments, weeklyTeachingSlots } =
    Route.useLoaderData() as Data;
  const [selectedId, setSelectedId] = useState(classes[0]?.id ?? "");

  if (classes.length === 0) {
    return (
      <Empty>
        Add some{" "}
        <Link
          to="/classes"
          className="text-primary hover:underline"
        >
          classes
        </Link>{" "}
        first.
      </Empty>
    );
  }
  if (teachers.length === 0) {
    return (
      <Empty>
        Add some{" "}
        <Link
          to="/teachers"
          className="text-primary hover:underline"
        >
          teachers
        </Link>{" "}
        first.
      </Empty>
    );
  }

  const selected = classes.find((c) => c.id === selectedId) ?? classes[0];
  const gradeCurriculum: CurriculumRow[] = curriculum.filter(
    (e) => e.gradeLevelId === selected.gradeLevelId,
  );
  const existing: Record<string, string> = {};
  for (const a of assignments) {
    if (a.classGroupId === selected.id) {
      existing[a.subjectId] = a.teacherId;
    }
  }

  // Teacher load across all saved assignments.
  const loadByTeacher = new Map<string, number>();
  for (const a of assignments) {
    loadByTeacher.set(a.teacherId, (loadByTeacher.get(a.teacherId) ?? 0) + a.weeklyCount);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Assignments</h1>
        <p className="text-sm text-muted-foreground">
          Assign a teacher to each subject for a class. Weekly counts come from the grade
          curriculum. These are what the generator places.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Label>Class</Label>
        <Select
          value={selected.id}
          onValueChange={(v) => setSelectedId(v as string)}
        >
          <SelectTrigger className="w-56">
            <SelectValue>
              {(v: string | null) => {
                const c = classes.find((x) => x.id === v);
                return c ? `${c.gradeName} · ${c.name}` : "Pick a class";
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem
                key={c.id}
                value={c.id}
              >
                {c.gradeName} · {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {gradeCurriculum.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {selected.gradeName} has no{" "}
              <Link
                to="/curriculum"
                className="text-primary hover:underline"
              >
                curriculum
              </Link>{" "}
              yet — set subject weekly counts first.
            </CardContent>
          </Card>
        ) : (
          <ClassEditor
            key={selected.id}
            classId={selected.id}
            rows={gradeCurriculum}
            teachers={teachers}
            existing={existing}
          />
        )}

        <aside className="lg:sticky lg:top-6">
          <TeacherLoadCard
            teachers={teachers}
            loadByTeacher={loadByTeacher}
            weeklyTeachingSlots={weeklyTeachingSlots}
          />
        </aside>
      </div>
    </div>
  );
}

function TeacherLoadCard({
  teachers,
  loadByTeacher,
  weeklyTeachingSlots,
}: {
  teachers: { id: string; name: string }[];
  loadByTeacher: Map<string, number>;
  weeklyTeachingSlots: number;
}) {
  const overloaded = teachers.filter(
    (t) => (loadByTeacher.get(t.id) ?? 0) > weeklyTeachingSlots,
  ).length;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Teacher load</span>
          {overloaded > 0 ? <Badge variant="destructive">{overloaded} overloaded</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {teachers.map((t) => {
            const load = loadByTeacher.get(t.id) ?? 0;
            const over = load > weeklyTeachingSlots;
            const pct =
              weeklyTeachingSlots > 0 ? Math.min(100, (load / weeklyTeachingSlots) * 100) : 0;
            return (
              <li
                key={t.id}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className={over ? "font-semibold text-destructive" : "text-foreground"}>
                      {load}
                    </span>
                    <span className="text-muted-foreground"> / {weeklyTeachingSlots}</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          A teacher's weekly periods can't exceed the {weeklyTeachingSlots} weekly slots, or no
          clash-free timetable exists.
        </p>
      </CardContent>
    </Card>
  );
}

function ClassEditor({
  classId,
  rows,
  teachers,
  existing,
}: {
  classId: string;
  rows: CurriculumRow[];
  teachers: { id: string; name: string }[];
  existing: Record<string, string>;
}) {
  const router = useRouter();
  const [pick, setPick] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.subjectId, existing[r.subjectId] ?? NONE])),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const assignedCount = rows.filter((r) => pick[r.subjectId] && pick[r.subjectId] !== NONE).length;

  function setTeacher(subjectId: string, v: string) {
    setPick((p) => ({ ...p, [subjectId]: v }));
    setDirty(true);
    setSaved(false);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      const teacherBySubject: Record<string, string | null> = Object.fromEntries(
        rows.map((r) => [r.subjectId, pick[r.subjectId] === NONE ? null : pick[r.subjectId]]),
      );
      await setClassAssignments({ data: { classGroupId: classId, teacherBySubject } });
      await router.invalidate();
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Teachers for this class</span>
          <Badge variant={assignedCount === rows.length ? "default" : "secondary"}>
            {assignedCount}/{rows.length} assigned
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead className="w-16 text-right">×/wk</TableHead>
              <TableHead className="w-56">Teacher</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.subjectId}>
                <TableCell className="font-medium">{r.subjectName}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.weeklyCount}</TableCell>
                <TableCell>
                  <Select
                    value={pick[r.subjectId] ?? NONE}
                    onValueChange={(v) => setTeacher(r.subjectId, v as string)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string | null) =>
                          v && v !== NONE
                            ? (teachers.find((t) => t.id === v)?.name ?? "")
                            : "— Unassigned —"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Unassigned —</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          {error ? <span className="mr-auto text-sm text-destructive">{error}</span> : null}
          {saved ? <span className="text-xs text-muted-foreground">Saved</span> : null}
          <Button
            size="sm"
            onClick={onSave}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-semibold">Assignments</h1>
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}
