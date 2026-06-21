import {
  ArrowRightIcon,
  CheckCircleIcon,
  SparkleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import {
  type OnboardingData,
  STEP_COUNT,
  WizardTopbar,
  firstIncompleteStep,
} from "#/components/onboarding/chrome.tsx";
import {
  AssignmentsStep,
  BellStep,
  ClassesStep,
  CurriculumStep,
  GradesStep,
  type StepProps,
  SubjectsStep,
  TeachersStep,
  TermStep,
} from "#/components/onboarding/steps.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { authClient } from "#/lib/auth-client.ts";
import { getOnboardingState } from "#/lib/server/onboarding.ts";
import { generateTimetable } from "#/lib/server/timetable.ts";

export const Route = createFileRoute("/_authed/onboarding")({
  loader: async ({ cause }) => {
    const state = await getOnboardingState();
    // Once every step is done the wizard has nothing left to do — send re-entries
    // to the daily app, where editing individual entities lives under Setup. Only
    // on a real entry, never on the in-place invalidations the steps fire after
    // each save (cause === "stay"), so finishing the last step doesn't eject the
    // user before they reach the generate screen.
    if (cause === "enter" && state.hasOrg && firstIncompleteStep(state) === null) {
      throw redirect({ to: "/timetable" });
    }
    return state;
  },
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const state = Route.useLoaderData();
  if (!state.hasOrg) {
    return <CreateSchool />;
  }
  return <OnboardingWizard data={state} />;
}

/* ---- create school (no org yet) ------------------------------------------ */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CreateSchool() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const slug = slugify(name);
    if (!slug) {
      setError("Please enter a school name.");
      setPending(false);
      return;
    }
    const { data, error: createError } = await authClient.organization.create({ name, slug });
    if (createError || !data) {
      setError(createError?.message ?? "Could not create the school.");
      setPending(false);
      return;
    }
    // create() doesn't reliably set the active org — do it explicitly so the
    // loader re-reads with hasOrg and the wizard takes over.
    await authClient.organization.setActive({ organizationId: data.id });
    await router.invalidate();
  }

  return (
    <div className="flex min-h-svh flex-col bg-secondary text-foreground">
      <WizardTopbar schoolName={null} />
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="w-full max-w-[440px] text-center">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-2xl bg-primary/10 px-3 text-xs font-semibold text-primary">
            <SparkleIcon /> Let's get you set up
          </span>
          <h1 className="mt-4.5 font-heading text-[28px] leading-tight font-bold tracking-tight">
            Create your school
          </h1>
          <p className="mx-auto mt-2.5 max-w-[360px] text-[15px] leading-relaxed text-muted-foreground">
            One school is one organization. You'll build its weekly jadwal next, in eight guided
            steps.
          </p>
          <Card className="mt-6 text-left">
            <CardContent>
              <form
                onSubmit={onSubmit}
                className="flex flex-col gap-2"
              >
                <Label htmlFor="school">School name</Label>
                <Input
                  id="school"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="SMP Harapan Bangsa"
                  required
                />
                {name ? (
                  <p className="text-xs text-muted-foreground">
                    URL slug: <span className="font-mono">{slugify(name) || "…"}</span>
                  </p>
                ) : null}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button
                  type="submit"
                  size="lg"
                  className="mt-2"
                  disabled={pending}
                >
                  {pending ? "Creating…" : "Create school & begin"} <ArrowRightIcon />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---- wizard orchestration ------------------------------------------------ */

type View = "welcome" | "generate" | number;

const STEP_COMPONENTS: ((p: StepProps) => React.ReactNode)[] = [
  TermStep,
  GradesStep,
  SubjectsStep,
  TeachersStep,
  BellStep,
  ClassesStep,
  CurriculumStep,
  AssignmentsStep,
];

function initialView(data: OnboardingData): View {
  const incomplete = firstIncompleteStep(data);
  if (incomplete === null) return "generate";
  // Show the welcome splash only on a truly fresh start (before the first term).
  return data.activeTerm ? incomplete : "welcome";
}

function OnboardingWizard({ data }: { data: OnboardingData }) {
  const router = useRouter();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [view, setView] = useState<View>(() => initialView(data));

  async function exit() {
    await navigate({ to: "/dashboard" });
  }

  if (view === "welcome") {
    return (
      <WizardScreen
        schoolName={data.schoolName}
        termName={data.activeTerm?.name}
        right={<span className="text-[13px] text-muted-foreground">Signed in as {user.name}</span>}
      >
        <WelcomeScreen onBegin={() => setView(1)} />
      </WizardScreen>
    );
  }

  if (view === "generate") {
    return (
      <WizardScreen
        schoolName={data.schoolName}
        termName={data.activeTerm?.name}
      >
        <GenerateScreen
          data={data}
          onBack={() => setView(STEP_COUNT)}
          onGenerated={async () => {
            await router.invalidate();
            await navigate({ to: "/timetable" });
          }}
        />
      </WizardScreen>
    );
  }

  const n = view;
  const Step = STEP_COMPONENTS[n - 1];
  return (
    <WizardScreen
      schoolName={data.schoolName}
      right={
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={exit}
        >
          Save &amp; exit
        </Button>
      }
    >
      <Step
        data={data}
        onBack={() => setView(n > 1 ? n - 1 : "welcome")}
        onNext={() => setView(n < STEP_COUNT ? n + 1 : "generate")}
      />
    </WizardScreen>
  );
}

function WizardScreen({
  schoolName,
  termName,
  right,
  children,
}: {
  schoolName: string | null;
  termName?: string | null;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-secondary text-foreground">
      <WizardTopbar
        schoolName={schoolName}
        termName={termName}
        right={right}
      />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

/* ---- welcome ------------------------------------------------------------- */

const WELCOME_TILES = [
  { n: 1, title: "Term", sub: "The active semester" },
  { n: 2, title: "Grade levels", sub: "Kelas 7, 8, 9" },
  { n: 3, title: "Subjects & teachers", sub: "Who teaches what" },
  { n: 4, title: "Schedule & curriculum", sub: "Hours, classes, load" },
];

function WelcomeScreen({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="flex min-h-full items-center justify-center p-10">
      <div className="w-full max-w-[720px] text-center">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-2xl bg-primary/10 px-3 text-xs font-semibold text-primary">
          <SparkleIcon /> Let's get you set up
        </span>
        <h1 className="mt-4.5 font-heading text-[32px] leading-tight font-bold tracking-tight">
          Build your weekly jadwal in {STEP_COUNT} steps
        </h1>
        <p className="mx-auto mt-2.5 max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
          We'll walk you through it in order — about 10 minutes. Each step unlocks the next, and you
          can pause and come back anytime.
        </p>
        <div className="mx-auto mt-7 grid max-w-[600px] grid-cols-1 gap-2.5 text-left sm:grid-cols-2">
          {WELCOME_TILES.map((t) => (
            <div
              key={t.n}
              className="flex items-center gap-3 rounded-2xl bg-card px-3.5 py-3 ring-1 ring-foreground/5"
            >
              <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {t.n}
              </span>
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <Button
          size="lg"
          className="mt-7 h-[42px] px-6 text-[15px]"
          onClick={onBegin}
        >
          Begin setup <ArrowRightIcon />
        </Button>
      </div>
    </div>
  );
}

/* ---- generate ------------------------------------------------------------ */

function GenerateScreen({
  data,
  onBack,
  onGenerated,
}: {
  data: OnboardingData;
  onBack: () => void;
  onGenerated: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [blockers, setBlockers] = useState<string[] | null>(null);

  const target = data.weeklyTeachingSlots;
  const balancedGrades = data.grades.filter(
    (g) =>
      data.curriculum
        .filter((e) => e.gradeLevelId === g.id)
        .reduce((a, e) => a + e.weeklyCount, 0) === target,
  ).length;
  const assignedPairs = new Set(data.assignments.map((a) => `${a.classGroupId}:${a.subjectId}`));
  let needed = 0;
  let assigned = 0;
  for (const c of data.classes) {
    for (const e of data.curriculum.filter((x) => x.gradeLevelId === c.gradeLevelId)) {
      needed += 1;
      if (assignedPairs.has(`${c.id}:${e.subjectId}`)) assigned += 1;
    }
  }

  const checks = [
    {
      label: "Curriculum balanced for all grades",
      value: `${balancedGrades}/${data.grades.length} grades`,
    },
    { label: "Every subject has a teacher in every class", value: `${assigned}/${needed}` },
    { label: "No teacher is over weekly capacity", value: `${data.teachers.length} teachers` },
  ];

  async function onGenerate() {
    setPending(true);
    setBlockers(null);
    try {
      const res = await generateTimetable({ data: {} });
      if (res.ok) {
        await onGenerated();
      } else {
        setBlockers(res.blockers);
        setPending(false);
      }
    } catch {
      setBlockers(["Something went wrong while generating. Please try again."]);
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-10">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto flex size-[60px] items-center justify-center rounded-full bg-[#16a34a]/12 text-[#16a34a]">
          <CheckCircleIcon className="size-9" />
        </div>
        <h1 className="mt-4.5 font-heading text-[28px] leading-tight font-bold tracking-tight">
          Setup complete — let's build it
        </h1>
        <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed text-muted-foreground">
          Everything checks out. We'll generate a clash-free weekly jadwal for all{" "}
          {data.classes.length} classes in a few seconds.
        </p>
        <Card className="mt-6 text-left">
          <CardContent className="py-1">
            {checks.map((c, i) => (
              <div
                key={c.label}
                className={`flex items-center gap-2.5 py-2 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <CheckCircleIcon className="size-[18px] flex-none text-[#16a34a]" />
                <span className="text-[13.5px]">{c.label}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">{c.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {blockers ? (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-4 text-left text-[13px] text-destructive">
            <p className="mb-1.5 flex items-center gap-1.5 font-medium">
              <WarningCircleIcon /> Not ready yet
            </p>
            <ul className="ml-5 list-disc space-y-1">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onBack}
              className="mt-2 underline underline-offset-4"
            >
              Go back to fix it
            </button>
          </div>
        ) : null}

        <Button
          size="lg"
          className="mt-6 h-11 px-7 text-[15px]"
          onClick={onGenerate}
          disabled={pending}
        >
          <SparkleIcon /> {pending ? "Generating…" : "Generate timetable"}
        </Button>
        <div className="mt-3">
          <button
            type="button"
            onClick={onBack}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            Back to assignments
          </button>
        </div>
      </div>
    </div>
  );
}
