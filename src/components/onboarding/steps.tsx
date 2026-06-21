import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpIcon,
  InfoIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import {
  type BellConfig,
  type DayConfig,
  SCHOOL_DAYS,
  computeDaySlots,
  defaultDay,
  totalTeachingSlots,
} from "#/lib/schedule.ts";
import { setClassAssignments } from "#/lib/server/assignments.ts";
import { saveBellSchedule } from "#/lib/server/bell-schedule.ts";
import { createClass, deleteClass } from "#/lib/server/classes.ts";
import { setGradeCurriculum } from "#/lib/server/curriculum.ts";
import { createGradeLevel, deleteGradeLevel } from "#/lib/server/grade-levels.ts";
import { createSubject, deleteSubject } from "#/lib/server/subjects.ts";
import { createTeacher, deleteTeacher } from "#/lib/server/teachers.ts";
import { createTerm, setActiveTerm } from "#/lib/server/terms.ts";

import { type OnboardingData, StepLayout } from "./chrome.tsx";

export type StepProps = { data: OnboardingData; onBack: () => void; onNext: () => void };

// Default swatches for new subjects — the calm subject-tint palette.
const SUBJECT_TINTS = [
  "#2563eb",
  "#db2777",
  "#d97706",
  "#0d9488",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#e11d48",
  "#4f46e5",
  "#ca8a04",
];

/* ---- shared bits --------------------------------------------------------- */

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button
      variant="ghost"
      className="text-muted-foreground"
      onClick={onBack}
    >
      <ArrowLeftIcon /> Back
    </Button>
  );
}

function StepIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {eyebrow ? (
        <div className="text-[13px] font-semibold tracking-wide text-primary">{eyebrow}</div>
      ) : null}
      <h2 className="mt-1.5 font-heading text-[22px] font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function ErrText({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null;
}

/* ---- 1 · Term ------------------------------------------------------------ */

export function TermStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const existing = data.activeTerm;
  const [name, setName] = useState(existing?.name ?? "");
  const [start, setStart] = useState(existing?.startDate ?? "");
  const [end, setEnd] = useState(existing?.endDate ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    // A term has no update server fn; once created it's fixed, so just advance.
    if (existing) {
      onNext();
      return;
    }
    if (!name.trim()) {
      setError("Enter a term name.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const created = await createTerm({
        data: { name, startDate: start || undefined, endDate: end || undefined },
      });
      await setActiveTerm({ data: { termId: created.id } });
      await router.invalidate();
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the term.");
      setPending(false);
    }
  }

  return (
    <StepLayout
      current={1}
      footer={
        <>
          <BackButton onBack={onBack} />
          <Button
            size="lg"
            onClick={onContinue}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save & continue"} <ArrowRightIcon />
          </Button>
        </>
      }
    >
      <Card>
        <CardContent>
          <StepIntro
            eyebrow="STEP 1"
            title="Create your first term"
          >
            A term is one semester. Everything you set up — classes, schedule, curriculum — belongs
            to the active term.
          </StepIntro>
          <Label
            htmlFor="term-name"
            className="mb-2"
          >
            Term name
          </Label>
          <Input
            id="term-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="2026/2027 Ganjil"
            disabled={Boolean(existing)}
            className="mb-4"
          />
          <div className="flex gap-3.5">
            <div className="flex-1">
              <Label
                htmlFor="term-start"
                className="mb-2"
              >
                Start date
              </Label>
              <Input
                id="term-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={Boolean(existing)}
              />
            </div>
            <div className="flex-1">
              <Label
                htmlFor="term-end"
                className="mb-2"
              >
                End date
              </Label>
              <Input
                id="term-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={Boolean(existing)}
              />
            </div>
          </div>
          <p className="mt-3.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <InfoIcon className="text-primary" />
            {existing
              ? "This is your active term."
              : "This becomes your active term automatically."}
          </p>
          <ErrText error={error} />
        </CardContent>
      </Card>
    </StepLayout>
  );
}

/* ---- 2 · Grades ---------------------------------------------------------- */

export function GradesStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await createGradeLevel({ data: { name, sortOrder: data.grades.length } });
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the grade.");
    } finally {
      setPending(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await deleteGradeLevel({ data: { id } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <StepLayout
      current={2}
      maxWidth={720}
      footer={
        <>
          <BackButton onBack={onBack} />
          <ContinueWithCount
            count={data.grades.length}
            noun="grade"
            onNext={onNext}
          />
        </>
      }
    >
      <Card>
        <CardContent>
          <StepIntro title="Grade levels">
            The jenjang at your school, e.g. Kelas 7, 8, 9. Classes and curriculum hang off these.
          </StepIntro>
          <form
            onSubmit={onAdd}
            className="mb-4.5 flex items-end gap-2 rounded-2xl bg-muted p-3.5"
          >
            <div className="flex-1">
              <Label className="mb-1.5 text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Kelas 7"
                className="bg-card"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              <PlusIcon /> Add
            </Button>
          </form>
          <ListRows
            items={data.grades}
            empty="No grades yet."
            onRemove={onRemove}
            render={(g) => <span className="flex-1 font-medium">{g.name}</span>}
          />
          <ErrText error={error} />
        </CardContent>
      </Card>
    </StepLayout>
  );
}

/* ---- 3 · Subjects -------------------------------------------------------- */

export function SubjectsStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(SUBJECT_TINTS[data.subjects.length % SUBJECT_TINTS.length]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await createSubject({ data: { name, code: code || undefined, color } });
      setName("");
      setCode("");
      setColor(SUBJECT_TINTS[(data.subjects.length + 1) % SUBJECT_TINTS.length]);
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the subject.");
    } finally {
      setPending(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await deleteSubject({ data: { id } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <StepLayout
      current={3}
      maxWidth={720}
      footer={
        <>
          <BackButton onBack={onBack} />
          <ContinueWithCount
            count={data.subjects.length}
            noun="subject"
            onNext={onNext}
          />
        </>
      }
    >
      <Card>
        <CardContent>
          <StepIntro title="Subjects">
            The mata pelajaran taught at your school. The color shows up on the timetable.
          </StepIntro>
          <form
            onSubmit={onAdd}
            className="mb-4.5 flex items-end gap-2 rounded-2xl bg-muted p-3.5"
          >
            <div className="flex-1">
              <Label className="mb-1.5 text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Matematika"
                className="bg-card"
              />
            </div>
            <div className="w-28">
              <Label className="mb-1.5 text-xs">Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MTK"
                className="bg-card"
              />
            </div>
            <div>
              <Label className="mb-1.5 text-xs">Color</Label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Subject color"
                className="h-8 w-9 cursor-pointer rounded-2xl border border-border bg-card p-1"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              <PlusIcon /> Add
            </Button>
          </form>
          <ListRows
            items={data.subjects}
            empty="No subjects yet."
            onRemove={onRemove}
            render={(s) => (
              <>
                <span
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: s.color ?? "var(--muted-foreground)" }}
                />
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="w-14 font-mono text-xs text-muted-foreground">
                  {s.code ?? "—"}
                </span>
              </>
            )}
          />
          <ErrText error={error} />
        </CardContent>
      </Card>
    </StepLayout>
  );
}

/* ---- 4 · Teachers -------------------------------------------------------- */

export function TeachersStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await createTeacher({ data: { name } });
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the teacher.");
    } finally {
      setPending(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await deleteTeacher({ data: { id } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <StepLayout
      current={4}
      maxWidth={720}
      footer={
        <>
          <BackButton onBack={onBack} />
          <ContinueWithCount
            count={data.teachers.length}
            noun="teacher"
            onNext={onNext}
          />
        </>
      }
    >
      <Card>
        <CardContent>
          <StepIntro title="Teachers">
            Your teaching staff. You'll assign them to subjects per class in a moment.
          </StepIntro>
          <form
            onSubmit={onAdd}
            className="mb-4.5 flex items-end gap-2 rounded-2xl bg-muted p-3.5"
          >
            <div className="flex-1">
              <Label className="mb-1.5 text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pak Budi"
                className="bg-card"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              <PlusIcon /> Add
            </Button>
          </form>
          <ListRows
            items={data.teachers}
            empty="No teachers yet."
            onRemove={onRemove}
            render={(t) => <span className="flex-1 font-medium">{t.name}</span>}
          />
          <ErrText error={error} />
        </CardContent>
      </Card>
    </StepLayout>
  );
}

/* ---- 5 · Bell schedule --------------------------------------------------- */

const getDay = (c: BellConfig, n: number): DayConfig => c.days[String(n)] ?? defaultDay(false);

export function BellStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const [config, setConfig] = useState<BellConfig>(data.bellConfig);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchDay(n: number, patch: Partial<DayConfig>) {
    setConfig((c) => ({ ...c, days: { ...c.days, [n]: { ...getDay(c, n), ...patch } } }));
  }
  function addBreak(n: number) {
    patchDay(n, { breaks: [...getDay(config, n).breaks, { start: "", end: "", label: "" }] });
  }
  function patchBreak(
    n: number,
    i: number,
    patch: Partial<{ start: string; end: string; label: string }>,
  ) {
    patchDay(n, {
      breaks: getDay(config, n).breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    });
  }
  function removeBreak(n: number, i: number) {
    patchDay(n, { breaks: getDay(config, n).breaks.filter((_, j) => j !== i) });
  }

  async function onContinue() {
    setPending(true);
    setError(null);
    const clean: BellConfig = {
      periodMinutes: config.periodMinutes,
      days: Object.fromEntries(
        SCHOOL_DAYS.map(({ n }) => {
          const d = getDay(config, n);
          return [String(n), { ...d, breaks: d.breaks.filter((b) => b.start && b.end) }];
        }),
      ),
    };
    try {
      await saveBellSchedule({ data: { config: clean } });
      await router.invalidate();
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the schedule.");
      setPending(false);
    }
  }

  const weekly = totalTeachingSlots(config);

  return (
    <StepLayout
      current={5}
      maxWidth={860}
      footer={
        <>
          <BackButton onBack={onBack} />
          <Button
            size="lg"
            onClick={onContinue}
            disabled={pending || weekly === 0}
          >
            {pending ? "Saving…" : "Save & continue"} <ArrowRightIcon />
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start justify-between gap-5">
        <div>
          <h2 className="font-heading text-[22px] font-semibold tracking-tight">Bell schedule</h2>
          <p className="mt-1.5 max-w-[520px] text-sm leading-relaxed text-muted-foreground">
            Set the daily hours and breaks. The day auto-fills with back-to-back teaching slots,
            skipping breaks.
          </p>
        </div>
        <div className="flex-none text-right">
          <div className="text-xs text-muted-foreground">Weekly teaching slots</div>
          <div className="font-heading text-2xl font-bold tracking-tight text-primary">
            {weekly}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-muted px-4 py-3">
        <span className="font-medium">Period length</span>
        <Input
          type="number"
          min={5}
          max={240}
          value={config.periodMinutes}
          onChange={(e) => setConfig((c) => ({ ...c, periodMinutes: Number(e.target.value) }))}
          className="w-20 bg-card text-center"
        />
        <span className="text-[13px] text-muted-foreground">minutes / lesson</span>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {SCHOOL_DAYS.map(({ n, label }) => {
          const day = getDay(config, n);
          const slots = computeDaySlots(day, config.periodMinutes);
          if (!day.schoolDay) {
            return (
              <Card
                key={n}
                size="sm"
                className="items-center justify-center border border-dashed border-border bg-muted shadow-none ring-0"
              >
                <CardContent className="flex items-center gap-2 opacity-70">
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => patchDay(n, { schoolDay: true })}
                  />
                  <span className="font-medium text-muted-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">· day off</span>
                </CardContent>
              </Card>
            );
          }
          return (
            <Card
              key={n}
              size="sm"
            >
              <CardContent className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked
                    onCheckedChange={() => patchDay(n, { schoolDay: false })}
                  />
                  <span className="font-heading text-[15px] font-semibold">{label}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto"
                  >
                    {slots.length} slots
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <div className="mb-1 text-[11px] text-muted-foreground">Start</div>
                    <Input
                      type="time"
                      value={day.start}
                      onChange={(e) => patchDay(n, { start: e.target.value })}
                      className="font-mono text-[13px]"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 text-[11px] text-muted-foreground">End</div>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={(e) => patchDay(n, { end: e.target.value })}
                      className="font-mono text-[13px]"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {day.breaks.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5"
                    >
                      <Input
                        type="time"
                        value={b.start}
                        onChange={(e) => patchBreak(n, i, { start: e.target.value })}
                        className="w-[5.5rem] bg-muted font-mono text-xs"
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={b.end}
                        onChange={(e) => patchBreak(n, i, { end: e.target.value })}
                        className="w-[5.5rem] bg-muted font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeBreak(n, i)}
                        aria-label="Remove break"
                        className="px-1 text-muted-foreground hover:text-destructive"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addBreak(n)}
                    className="self-start text-xs text-primary hover:underline"
                  >
                    + Add break (istirahat)
                  </button>
                </div>
                <div className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {slots.length === 0
                    ? "No slots — check the hours."
                    : slots.map((s) => s.start).join(" · ")}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </StepLayout>
  );
}

/* ---- 6 · Classes --------------------------------------------------------- */

export function ClassesStep({ data, onBack, onNext }: StepProps) {
  const router = useRouter();
  const [gradeLevelId, setGradeLevelId] = useState(data.grades[0]?.id ?? "");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!gradeLevelId) {
      setError("Pick a grade.");
      return;
    }
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await createClass({ data: { gradeLevelId, name } });
      setName("");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the class.");
    } finally {
      setPending(false);
    }
  }

  async function onRemove(id: string) {
    setError(null);
    try {
      await deleteClass({ data: { id } });
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  return (
    <StepLayout
      current={6}
      maxWidth={720}
      footer={
        <>
          <BackButton onBack={onBack} />
          <ContinueWithCount
            count={data.classes.length}
            noun="class"
            plural="classes"
            onNext={onNext}
          />
        </>
      }
    >
      <Card>
        <CardContent>
          <StepIntro title="Classes">
            The rombel for this term, e.g. 7A, 7B. Each class belongs to a grade level.
          </StepIntro>
          <form
            onSubmit={onAdd}
            className="mb-4.5 flex items-end gap-2 rounded-2xl bg-muted p-3.5"
          >
            <div>
              <Label className="mb-1.5 text-xs">Grade</Label>
              <Select
                value={gradeLevelId}
                onValueChange={(v) => setGradeLevelId(v as string)}
              >
                <SelectTrigger className="w-40 bg-card">
                  <SelectValue>
                    {(v: string | null) =>
                      v ? (data.grades.find((g) => g.id === v)?.name ?? "") : "Pick a grade"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {data.grades.map((g) => (
                    <SelectItem
                      key={g.id}
                      value={g.id}
                    >
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="mb-1.5 text-xs">Class name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="7A"
                className="bg-card"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
            >
              <PlusIcon /> Add
            </Button>
          </form>
          <ListRows
            items={data.classes}
            empty="No classes yet."
            onRemove={onRemove}
            render={(c) => (
              <>
                <span className="w-24 text-muted-foreground">{c.gradeName}</span>
                <span className="flex-1 font-medium">{c.name}</span>
              </>
            )}
          />
          <ErrText error={error} />
        </CardContent>
      </Card>
    </StepLayout>
  );
}

/* ---- 7 · Curriculum ------------------------------------------------------ */

export function CurriculumStep({ data, onBack, onNext }: StepProps) {
  const target = data.weeklyTeachingSlots;
  const countsByGrade = new Map<string, Record<string, number>>();
  for (const e of data.curriculum) {
    const m = countsByGrade.get(e.gradeLevelId) ?? {};
    m[e.subjectId] = e.weeklyCount;
    countsByGrade.set(e.gradeLevelId, m);
  }
  const savedSum = (gradeId: string) =>
    Object.values(countsByGrade.get(gradeId) ?? {}).reduce((a, b) => a + b, 0);
  const unbalanced = data.grades.filter((g) => savedSum(g.id) !== target);
  const ready = data.subjects.length > 0 && unbalanced.length === 0;

  return (
    <StepLayout
      current={7}
      maxWidth={720}
      footer={
        <>
          <BackButton onBack={onBack} />
          <div className="flex items-center gap-3.5">
            {!ready ? (
              <span className="flex items-center gap-1 text-[12.5px] text-destructive">
                <WarningCircleIcon />
                {unbalanced[0]
                  ? `${unbalanced[0].name} needs ${Math.abs(target - savedSum(unbalanced[0].id))} ${
                      savedSum(unbalanced[0].id) < target ? "more" : "fewer"
                    } slots`
                  : "Add subjects first"}
              </span>
            ) : null}
            <Button
              size="lg"
              onClick={onNext}
              disabled={!ready}
            >
              Continue <ArrowRightIcon />
            </Button>
          </div>
        </>
      }
    >
      <div className="mb-4">
        <h2 className="font-heading text-[22px] font-semibold tracking-tight">
          Curriculum — weekly hours
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Per grade, set how many times each subject runs per week. The total must match the{" "}
          <strong className="text-foreground">{target} weekly slots</strong> from your bell
          schedule.
        </p>
      </div>
      <div className="flex flex-col gap-3.5">
        {data.grades.map((g) => (
          <GradeCurriculumCard
            key={g.id}
            gradeId={g.id}
            gradeName={g.name}
            subjects={data.subjects}
            initial={countsByGrade.get(g.id) ?? {}}
            target={target}
          />
        ))}
      </div>
    </StepLayout>
  );
}

function GradeCurriculumCard({
  gradeId,
  gradeName,
  subjects,
  initial,
  target,
}: {
  gradeId: string;
  gradeName: string;
  subjects: OnboardingData["subjects"];
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

  const sum = subjects.reduce((acc, s) => acc + (Number(counts[s.id]) || 0), 0);
  const diff = sum - target;
  const balanced = diff === 0;

  function bump(id: string, delta: number) {
    const next = Math.max(0, (Number(counts[id]) || 0) + delta);
    setCounts((c) => ({ ...c, [id]: String(next) }));
    setDirty(true);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      const numeric = Object.fromEntries(subjects.map((s) => [s.id, Number(counts[s.id]) || 0]));
      await setGradeCurriculum({ data: { gradeLevelId: gradeId, counts: numeric } });
      await router.invalidate();
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className={balanced ? "" : "ring-1 ring-destructive"}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-heading text-base font-semibold">{gradeName}</h3>
          {balanced ? (
            <Badge className="gap-1 bg-[#16a34a]">Balanced</Badge>
          ) : (
            <Badge variant="destructive">
              <WarningCircleIcon /> {Math.abs(diff)} {diff < 0 ? "short" : "over"}
            </Badge>
          )}
          <span
            className={`ml-auto font-mono text-[13px] ${
              balanced ? "text-muted-foreground" : "font-semibold text-destructive"
            }`}
          >
            {sum} / {target}
          </span>
        </div>

        {!balanced ? (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
            <WarningCircleIcon className="size-[15px]" />
            {diff < 0 ? (
              <span>
                Add <strong>{-diff} more</strong> weekly {-diff === 1 ? "lesson" : "lessons"} before
                you can generate.
              </span>
            ) : (
              <span>
                Remove <strong>{diff}</strong> weekly {diff === 1 ? "lesson" : "lessons"} — this
                grade is over the slot count.
              </span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-2xl bg-muted px-2.5 py-1.5 text-[13px]"
            >
              <span
                className="size-2 rounded-full"
                style={{ background: s.color ?? "var(--muted-foreground)" }}
              />
              <span>{s.name}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={counts[s.id] ?? ""}
                onChange={(e) => {
                  setCounts((c) => ({ ...c, [s.id]: e.target.value }));
                  setDirty(true);
                }}
                aria-label={`${s.name} weekly count`}
                className="w-10 rounded-md bg-card px-1 py-0.5 text-center font-mono font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => bump(s.id, 1)}
                  aria-label={`Increase ${s.name}`}
                  className="text-primary hover:opacity-70"
                >
                  <CaretUpIcon className="size-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => bump(s.id, -1)}
                  aria-label={`Decrease ${s.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <CaretDownIcon className="size-2.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          {error ? <span className="mr-auto text-sm text-destructive">{error}</span> : null}
          <Button
            size="sm"
            onClick={onSave}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : "Save grade"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---- 8 · Assignments ----------------------------------------------------- */

const NONE = "__none__";

export function AssignmentsStep({ data, onBack, onNext }: StepProps) {
  const [selectedId, setSelectedId] = useState(data.classes[0]?.id ?? "");
  const selected = data.classes.find((c) => c.id === selectedId) ?? data.classes[0];

  const gradeCurriculum = data.curriculum.filter((e) => e.gradeLevelId === selected?.gradeLevelId);
  const existing: Record<string, string> = {};
  for (const a of data.assignments) {
    if (a.classGroupId === selected?.id) existing[a.subjectId] = a.teacherId;
  }

  // Teacher load across every saved assignment in the term.
  const loadByTeacher = new Map<string, number>();
  for (const a of data.assignments) {
    loadByTeacher.set(a.teacherId, (loadByTeacher.get(a.teacherId) ?? 0) + a.weeklyCount);
  }
  const overCapacity = data.teachers.some(
    (t) => (loadByTeacher.get(t.id) ?? 0) > data.weeklyTeachingSlots,
  );

  // Every class must have a teacher for every curriculum subject in its grade.
  const assignedPairs = new Set(data.assignments.map((a) => `${a.classGroupId}:${a.subjectId}`));
  let needed = 0;
  let assigned = 0;
  for (const c of data.classes) {
    for (const e of data.curriculum.filter((x) => x.gradeLevelId === c.gradeLevelId)) {
      needed += 1;
      if (assignedPairs.has(`${c.id}:${e.subjectId}`)) assigned += 1;
    }
  }
  const ready = needed > 0 && assigned === needed && !overCapacity;

  return (
    <StepLayout
      current={8}
      maxWidth={820}
      footer={
        <>
          <BackButton onBack={onBack} />
          <div className="flex items-center gap-3.5">
            {!ready ? (
              <span className="flex items-center gap-1 text-[12.5px] text-destructive">
                <WarningCircleIcon />
                {overCapacity
                  ? "A teacher is over capacity"
                  : `${needed - assigned} subjects need a teacher`}
              </span>
            ) : null}
            <Button
              size="lg"
              onClick={onNext}
              disabled={!ready}
              className="bg-[#16a34a] text-white hover:bg-[#16a34a]/90"
            >
              Finish setup <ArrowRightIcon />
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <div className="md:flex-[1.6]">
          <div className="mb-3.5 flex items-center gap-3">
            <h2 className="font-heading text-[22px] font-semibold tracking-tight">Assignments</h2>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">Class</span>
              <Select
                value={selected?.id ?? ""}
                onValueChange={(v) => setSelectedId(v as string)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue>
                    {(v: string | null) => {
                      const c = data.classes.find((x) => x.id === v);
                      return c ? `${c.gradeName} · ${c.name}` : "Pick a class";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {data.classes.map((c) => (
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
          </div>
          {selected && gradeCurriculum.length > 0 ? (
            <ClassAssignEditor
              key={selected.id}
              classId={selected.id}
              rows={gradeCurriculum}
              teachers={data.teachers}
              existing={existing}
            />
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                {selected?.gradeName} has no curriculum yet — go back and set weekly counts first.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="md:flex-1 md:pt-12">
          <Card size="sm">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Teacher load</span>
                <Badge
                  variant="secondary"
                  className="ml-auto"
                >
                  {assigned} / {needed} assigned
                </Badge>
              </div>
              <div className="flex flex-col gap-2.5">
                {data.teachers.map((t) => {
                  const load = loadByTeacher.get(t.id) ?? 0;
                  const pct = data.weeklyTeachingSlots
                    ? Math.min(100, (load / data.weeklyTeachingSlots) * 100)
                    : 0;
                  const over = load > data.weeklyTeachingSlots;
                  const near = !over && pct >= 90;
                  const barColor = over
                    ? "var(--destructive)"
                    : near
                      ? "#d97706"
                      : "var(--primary)";
                  return (
                    <div key={t.id}>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <span>{t.name}</span>
                        <span
                          className="font-mono"
                          style={{
                            color: over ? "var(--destructive)" : near ? "#d97706" : undefined,
                          }}
                        >
                          {load} / {data.weeklyTeachingSlots}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.teachers.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">No teachers yet.</p>
                ) : null}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <InfoIcon className="text-primary" />
                {overCapacity ? "Someone is over capacity." : "No one is over capacity."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </StepLayout>
  );
}

function ClassAssignEditor({
  classId,
  rows,
  teachers,
  existing,
}: {
  classId: string;
  rows: { subjectId: string; subjectName: string; weeklyCount: number }[];
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

  const assignedCount = rows.filter((r) => pick[r.subjectId] && pick[r.subjectId] !== NONE).length;

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center border-b border-border pb-2.5 text-xs font-medium text-muted-foreground">
          <span className="flex-1">Subject</span>
          <span className="w-12 text-center">×/wk</span>
          <span className="w-40">Teacher</span>
        </div>
        {rows.map((r) => (
          <div
            key={r.subjectId}
            className="flex items-center"
          >
            <span className="flex-1 font-medium">{r.subjectName}</span>
            <span className="w-12 text-center font-mono text-muted-foreground">
              {r.weeklyCount}
            </span>
            <div className="w-40">
              <Select
                value={pick[r.subjectId] ?? NONE}
                onValueChange={(v) => {
                  setPick((p) => ({ ...p, [r.subjectId]: v as string }));
                  setDirty(true);
                }}
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
            </div>
          </div>
        ))}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          {error ? <span className="mr-auto text-sm text-destructive">{error}</span> : null}
          <Badge variant={assignedCount === rows.length ? "default" : "secondary"}>
            {assignedCount}/{rows.length} assigned
          </Badge>
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

/* ---- list helpers -------------------------------------------------------- */

function ListRows<T extends { id: string }>({
  items,
  empty,
  onRemove,
  render,
}: {
  items: T[];
  empty: string;
  onRemove: (id: string) => void;
  render: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div>
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`flex items-center gap-3 px-1.5 py-2.5 ${
            i < items.length - 1 ? "border-b border-border" : ""
          }`}
        >
          {render(item)}
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={() => onRemove(item.id)}
          >
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}

function ContinueWithCount({
  count,
  noun,
  plural,
  onNext,
}: {
  count: number;
  noun: string;
  plural?: string;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="text-[12.5px] text-muted-foreground">
        {count} {count === 1 ? noun : (plural ?? `${noun}s`)} added
      </span>
      <Button
        size="lg"
        onClick={onNext}
        disabled={count === 0}
      >
        Continue <ArrowRightIcon />
      </Button>
    </div>
  );
}
