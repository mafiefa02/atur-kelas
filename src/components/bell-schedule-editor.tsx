import { CaretDownIcon, CaretRightIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Input } from "#/components/ui/input.tsx";
import { Switch } from "#/components/ui/switch.tsx";
import {
  type BellConfig,
  type DayConfig,
  SCHOOL_DAYS,
  computeDaySlots,
  defaultDay,
  totalTeachingSlots,
} from "#/lib/schedule.ts";
import { cn } from "#/lib/utils.ts";

const getDay = (c: BellConfig, n: number): DayConfig => c.days[String(n)] ?? defaultDay(false);

// Borderless time field so a dense row reads as text until you focus it. Wide enough
// for "07.00" plus the native picker icon at every locale.
const timeField =
  "h-7 w-24 rounded-lg bg-transparent px-1.5 text-center font-mono text-[13px] hover:bg-input/60 focus-visible:bg-input/60";

type Props = {
  config: BellConfig;
  /** Called with the next config on every edit. The parent owns dirty/save state. */
  onConfigChange: (next: BellConfig) => void;
};

// One school-wide bell schedule, edited as a table of weekdays. Teaching slots are
// derived (computeDaySlots), never typed — the per-day count + weekly total are the
// feasibility target T. Shared by the settings page and the onboarding wizard step.
export function BellScheduleEditor({ config, onConfigChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function patchDay(n: number, patch: Partial<DayConfig>) {
    onConfigChange({
      ...config,
      days: { ...config.days, [n]: { ...getDay(config, n), ...patch } },
    });
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
  function toggleExpanded(n: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  const weekly = totalTeachingSlots(config);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
        <label className="flex items-center gap-2.5">
          <span className="font-medium">Period length</span>
          <Input
            type="number"
            min={5}
            max={240}
            value={config.periodMinutes}
            onChange={(e) => onConfigChange({ ...config, periodMinutes: Number(e.target.value) })}
            className="w-20 bg-card text-center"
          />
          <span className="text-[13px] text-muted-foreground">minutes / lesson</span>
        </label>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Weekly teaching slots</div>
          <div className="font-heading text-2xl font-bold tracking-tight text-primary">
            {weekly}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-[9.5rem_6.5rem_6.5rem_minmax(0,1fr)_auto]">
          {/* Header */}
          <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 px-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>Day</span>
            <span>Start</span>
            <span>End</span>
            <span>Breaks</span>
            <span className="justify-self-end">Slots</span>
          </div>

          {SCHOOL_DAYS.map(({ n, label }) => {
            const day = getDay(config, n);
            const slots = computeDaySlots(day, config.periodMinutes);
            const isOpen = expanded.has(n);
            return (
              <div
                key={n}
                data-off={!day.schoolDay}
                className="col-span-full grid grid-cols-subgrid items-start gap-x-3 gap-y-1.5 border-t border-border px-3 py-2.5 data-[off=true]:bg-muted/30"
              >
                {/* Day + on/off switch */}
                <label className="flex h-7 cursor-pointer items-center gap-2.5">
                  <Switch
                    checked={day.schoolDay}
                    onCheckedChange={(c) => patchDay(n, { schoolDay: c })}
                  />
                  <span
                    className={cn(
                      "font-heading text-[15px] font-medium",
                      !day.schoolDay && "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </label>

                {day.schoolDay ? (
                  <>
                    <Input
                      type="time"
                      aria-label={`${label} start`}
                      value={day.start}
                      onChange={(e) => patchDay(n, { start: e.target.value })}
                      className={timeField}
                    />
                    <Input
                      type="time"
                      aria-label={`${label} end`}
                      value={day.end}
                      onChange={(e) => patchDay(n, { end: e.target.value })}
                      className={timeField}
                    />

                    {/* Breaks — edited inline; the row grows for 2+ breaks */}
                    <div className="flex min-w-0 flex-col gap-1.5">
                      {day.breaks.map((b, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          <Input
                            type="time"
                            aria-label="Break start"
                            value={b.start}
                            onChange={(e) => patchBreak(n, i, { start: e.target.value })}
                            className={cn(timeField, "bg-input/40")}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            aria-label="Break end"
                            value={b.end}
                            onChange={(e) => patchBreak(n, i, { end: e.target.value })}
                            className={cn(timeField, "bg-input/40")}
                          />
                          <Input
                            aria-label="Break label"
                            value={b.label ?? ""}
                            onChange={(e) => patchBreak(n, i, { label: e.target.value })}
                            placeholder="Istirahat"
                            className="h-7 min-w-0 flex-1 rounded-lg bg-input/40 px-2 text-[13px]"
                          />
                          <button
                            type="button"
                            onClick={() => removeBreak(n, i)}
                            aria-label="Remove break"
                            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addBreak(n)}
                        className="flex items-center gap-1 self-start text-xs text-primary hover:underline"
                      >
                        <PlusIcon className="size-3.5" /> Add break
                      </button>
                    </div>

                    {/* Slot count — click to reveal the derived times */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(n)}
                      aria-expanded={isOpen}
                      className={cn(
                        "flex h-7 items-center gap-1 justify-self-end rounded-lg px-2 text-[13px] font-medium tabular-nums hover:bg-muted",
                        slots.length === 0 && "text-destructive",
                      )}
                    >
                      {slots.length} {slots.length === 1 ? "slot" : "slots"}
                      {isOpen ? (
                        <CaretDownIcon className="size-3.5 text-muted-foreground" />
                      ) : (
                        <CaretRightIcon className="size-3.5 text-muted-foreground" />
                      )}
                    </button>

                    {isOpen ? (
                      <div className="col-span-full mt-1 rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                        {slots.length === 0
                          ? "No slots — check the start, end, and breaks."
                          : slots.map((s) => s.start).join(" · ")}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="col-span-3 self-center text-[13px] text-muted-foreground">
                      Day off
                    </span>
                    <span className="self-center justify-self-end text-[13px] text-muted-foreground">
                      —
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
