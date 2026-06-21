import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
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
import { getCurriculum, setGradeCurriculum } from "#/lib/server/curriculum.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/_authed/_app/curriculum")({
  loader: () => getCurriculum(),
  component: CurriculumPage,
});

type Grade = Awaited<ReturnType<typeof getCurriculum>>["grades"][number];
type Subject = Awaited<ReturnType<typeof getCurriculum>>["subjects"][number];

function CurriculumPage() {
  const { grades, subjects, entries, weeklyTeachingSlots } = Route.useLoaderData();

  const countsByGrade = new Map<string, Record<string, number>>();
  for (const e of entries) {
    const m = countsByGrade.get(e.gradeLevelId) ?? {};
    m[e.subjectId] = e.weeklyCount;
    countsByGrade.set(e.gradeLevelId, m);
  }

  const ready = grades.length > 0 && subjects.length > 0;

  const [selectedGradeId, setSelectedGradeId] = useState(() => grades[0]?.id ?? "");
  // Keep the selection valid if the active grade goes away (e.g. it was deleted).
  const activeGradeId = grades.some((g) => g.id === selectedGradeId)
    ? selectedGradeId
    : (grades[0]?.id ?? "");

  const gradeItems = Object.fromEntries(grades.map((g) => [g.id, g.name]));
  // Saved (persisted) total per grade — drives the at-a-glance dot in the picker.
  const savedSum = (gradeId: string) =>
    subjects.reduce((acc, s) => acc + (countsByGrade.get(gradeId)?.[s.id] ?? 0), 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Curriculum</h1>
        <p className="text-sm text-muted-foreground">
          Per grade, set how many times each subject runs per week. The total must equal the{" "}
          <span className="font-medium">{weeklyTeachingSlots}</span> weekly teaching slots from the
          bell schedule, so every class is fully packed.
        </p>
      </div>

      {!ready ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Add{" "}
            <Link
              to="/grades"
              className="text-primary hover:underline"
            >
              grade levels
            </Link>{" "}
            and{" "}
            <Link
              to="/subjects"
              className="text-primary hover:underline"
            >
              subjects
            </Link>{" "}
            first.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Grade</span>
            <Select
              items={gradeItems}
              value={activeGradeId}
              onValueChange={(value) => setSelectedGradeId(value as string)}
            >
              <SelectTrigger className="min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grades.map((g) => (
                  <SelectItem
                    key={g.id}
                    value={g.id}
                  >
                    <span className="flex-1">{g.name}</span>
                    <GradeStatusDot
                      sum={savedSum(g.id)}
                      target={weeklyTeachingSlots}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* All grades stay mounted so unsaved edits survive switching; only the active one shows. */}
          {grades.map((grade) => (
            <div
              key={grade.id}
              className={grade.id === activeGradeId ? undefined : "hidden"}
            >
              <GradeCurriculum
                grade={grade}
                subjects={subjects}
                initial={countsByGrade.get(grade.id) ?? {}}
                target={weeklyTeachingSlots}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function GradeCurriculum({
  grade,
  subjects,
  initial,
  target,
}: {
  grade: Grade;
  subjects: Subject[];
  initial: Record<string, number>;
  target: number;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(subjects.map((s) => [s.id, initial[s.id] ? String(initial[s.id]) : ""])),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const sum = subjects.reduce((acc, s) => acc + (Number(counts[s.id]) || 0), 0);
  const diff = sum - target;

  function setCount(subjectId: string, value: string) {
    setCounts((c) => ({ ...c, [subjectId]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      const numeric = Object.fromEntries(subjects.map((s) => [s.id, Number(counts[s.id]) || 0]));
      await setGradeCurriculum({ data: { gradeLevelId: grade.id, counts: numeric } });
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
        <CardTitle className="flex items-center justify-between">
          <span>{grade.name}</span>
          <FeasibilityBadge
            sum={sum}
            target={target}
            diff={diff}
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead className="w-32 text-right">Per week</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subjects.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={counts[s.id] ?? ""}
                    onChange={(e) => setCount(s.id, e.target.value)}
                    placeholder="0"
                    className="ml-auto w-20 text-right"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {sum} / {target} slots{" "}
            {diff === 0 ? "" : diff < 0 ? `(${-diff} short)` : `(${diff} over)`}
          </span>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-xs text-muted-foreground">Saved</span> : null}
            <Button
              size="sm"
              onClick={onSave}
              disabled={pending || !dirty}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function GradeStatusDot({ sum, target }: { sum: number; target: number }) {
  const { color, label } =
    target === 0
      ? { color: "bg-muted-foreground/40", label: "Set the bell schedule first" }
      : sum === target
        ? { color: "bg-primary", label: "Balanced" }
        : sum < target
          ? { color: "bg-amber-500", label: `${target - sum} short` }
          : { color: "bg-destructive", label: `${sum - target} over` };
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", color)}
      title={label}
      aria-label={label}
    />
  );
}

function FeasibilityBadge({ sum, target, diff }: { sum: number; target: number; diff: number }) {
  if (target === 0) {
    return <Badge variant="secondary">Set the bell schedule first</Badge>;
  }
  if (diff === 0) {
    return <Badge>Balanced ✓</Badge>;
  }
  if (diff < 0) {
    return <Badge variant="secondary">{`${sum}/${target} — ${-diff} short`}</Badge>;
  }
  return <Badge variant="destructive">{`${sum}/${target} — ${diff} over`}</Badge>;
}
