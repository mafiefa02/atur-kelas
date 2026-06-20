import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  type BellConfig,
  type DayConfig,
  SCHOOL_DAYS,
  computeDaySlots,
  totalTeachingSlots,
} from "#/lib/schedule.ts";
import { getBellSchedule, saveBellSchedule } from "#/lib/server/bell-schedule.ts";

export const Route = createFileRoute("/_authed/_app/schedule")({
  loader: () => getBellSchedule(),
  component: SchedulePage,
});

const emptyDay = (): DayConfig => ({ schoolDay: false, start: "07:00", end: "15:00", breaks: [] });
const getDay = (c: BellConfig, n: number): DayConfig => c.days[String(n)] ?? emptyDay();

function SchedulePage() {
  const { termName, config: loaded } = Route.useLoaderData();
  const router = useRouter();
  const [config, setConfig] = useState<BellConfig>(loaded);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  function patchDay(n: number, patch: Partial<DayConfig>) {
    setConfig((c) => ({ ...c, days: { ...c.days, [n]: { ...getDay(c, n), ...patch } } }));
    setDirty(true);
    setSavedAt(false);
  }
  function setPeriodMinutes(v: number) {
    setConfig((c) => ({ ...c, periodMinutes: v }));
    setDirty(true);
    setSavedAt(false);
  }
  function addBreak(n: number) {
    patchDay(n, { breaks: [...getDay(config, n).breaks, { start: "", end: "", label: "" }] });
  }
  function patchBreak(
    n: number,
    i: number,
    patch: Partial<{ start: string; end: string; label: string }>,
  ) {
    const breaks = getDay(config, n).breaks.map((b, j) => (j === i ? { ...b, ...patch } : b));
    patchDay(n, { breaks });
  }
  function removeBreak(n: number, i: number) {
    patchDay(n, { breaks: getDay(config, n).breaks.filter((_, j) => j !== i) });
  }

  async function onSave() {
    setPending(true);
    setError(null);
    // Drop incomplete breaks before saving.
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
      setDirty(false);
      setSavedAt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setPending(false);
    }
  }

  const weeklyTotal = totalTeachingSlots(config);

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

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Label
              htmlFor="period"
              className="whitespace-nowrap"
            >
              Period length
            </Label>
            <Input
              id="period"
              type="number"
              min={5}
              max={240}
              value={config.periodMinutes}
              onChange={(e) => setPeriodMinutes(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">minutes / lesson</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Weekly teaching slots: </span>
            <span className="font-semibold">{weeklyTotal}</span>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {SCHOOL_DAYS.map(({ n, label }) => {
          const day = getDay(config, n);
          const slots = computeDaySlots(day, config.periodMinutes);
          return (
            <Card
              key={n}
              data-inactive={!day.schoolDay}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 font-heading text-base font-medium">
                    <Checkbox
                      checked={day.schoolDay}
                      onCheckedChange={(c) => patchDay(n, { schoolDay: c === true })}
                    />
                    {label}
                  </Label>
                  {day.schoolDay ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {slots.length} slots
                    </span>
                  ) : (
                    <Badge variant="secondary">Off</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              {day.schoolDay ? (
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={`start-${n}`}
                        className="text-xs"
                      >
                        Start
                      </Label>
                      <Input
                        id={`start-${n}`}
                        type="time"
                        value={day.start}
                        onChange={(e) => patchDay(n, { start: e.target.value })}
                        className="w-28"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor={`end-${n}`}
                        className="text-xs"
                      >
                        End
                      </Label>
                      <Input
                        id={`end-${n}`}
                        type="time"
                        value={day.end}
                        onChange={(e) => patchDay(n, { end: e.target.value })}
                        className="w-28"
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
                          className="w-24"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={b.end}
                          onChange={(e) => patchBreak(n, i, { end: e.target.value })}
                          className="w-24"
                        />
                        <Input
                          value={b.label ?? ""}
                          onChange={(e) => patchBreak(n, i, { label: e.target.value })}
                          placeholder="Istirahat"
                          className="flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeBreak(n, i)}
                          className="px-1 text-xs text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addBreak(n)}
                      className="self-start text-xs text-primary hover:underline"
                    >
                      + Add break
                    </button>
                  </div>

                  <div className="rounded-lg bg-muted/40 p-2 text-xs">
                    {slots.length === 0 ? (
                      <span className="text-muted-foreground">No slots — check the hours.</span>
                    ) : (
                      <span className="font-mono text-muted-foreground">
                        {slots.map((s) => s.start).join(" · ")}
                      </span>
                    )}
                  </div>
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
