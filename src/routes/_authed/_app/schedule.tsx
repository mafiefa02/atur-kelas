import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { BellScheduleEditor } from "#/components/bell-schedule-editor.tsx";
import { Button } from "#/components/ui/button.tsx";
import { type BellConfig, SCHOOL_DAYS } from "#/lib/schedule.ts";
import { getBellSchedule, saveBellSchedule } from "#/lib/server/bell-schedule.ts";

export const Route = createFileRoute("/_authed/_app/schedule")({
  loader: () => getBellSchedule(),
  component: SchedulePage,
});

function SchedulePage() {
  const { termName, config: loaded } = Route.useLoaderData();
  const router = useRouter();
  const [config, setConfig] = useState<BellConfig>(loaded);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  function onConfigChange(next: BellConfig) {
    setConfig(next);
    setDirty(true);
    setSavedAt(false);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    // Drop incomplete breaks before saving.
    const clean: BellConfig = {
      periodMinutes: config.periodMinutes,
      days: Object.fromEntries(
        SCHOOL_DAYS.map(({ n }) => {
          const d = config.days[String(n)] ?? { schoolDay: false, start: "", end: "", breaks: [] };
          return [String(n), { ...d, breaks: d.breaks.filter((b) => b.start && b.end) }];
        }),
      ),
    };
    try {
      await saveBellSchedule({ data: { config: clean } });
      await router.invalidate();
      setDirty(false);
      setSavedAt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-xl font-semibold">Bell schedule</h1>
          <p className="text-sm text-muted-foreground">
            Set the daily hours and breaks for <span className="font-medium">{termName}</span>. The
            day auto-fills with back-to-back teaching slots, skipping breaks.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={onSave}
            disabled={pending || !dirty}
          >
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {savedAt ? <span className="text-xs text-muted-foreground">Saved</span> : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <BellScheduleEditor
        config={config}
        onConfigChange={onConfigChange}
      />
    </div>
  );
}
