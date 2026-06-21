import { Fragment, useState, type ReactNode } from "react";

import { dayLabel, hhmm } from "#/lib/schedule.ts";
import { cn } from "#/lib/utils.ts";

// A single-day agenda view of the weekly jadwal: day-tab pills over a vertical timeline
// of colored subject cards, with break ("istirahat") dividers derived from the gaps
// between consecutive teaching slots. Purely presentational (no db) so it is safe to
// import from both the public route and the authenticated app.

export type AgendaSlot = {
  dayOfWeek: number;
  slotIndex: number;
  start: string;
  end: string;
};

export type AgendaCell = {
  dayOfWeek: number;
  slotIndex: number;
  subjectName: string;
  subjectColor: string | null;
  teacherName: string;
};

const FALLBACK_COLOR = "#64748b";

// "07:00" / "07:00:00" -> "07.00" — the dot-separated clock style of the agenda gutter.
const clock = (t: string) => hhmm(t).replace(":", ".");

type AgendaTimetableProps = {
  slots: readonly AgendaSlot[];
  cells: readonly AgendaCell[];
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function AgendaTimetable({
  slots,
  cells,
  eyebrow,
  title,
  subtitle,
  footer,
  className,
}: AgendaTimetableProps) {
  const dayNums = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);
  const [day, setDay] = useState(dayNums[0] ?? 1);
  const active = dayNums.includes(day) ? day : (dayNums[0] ?? 1);
  const hasHeader = eyebrow != null || title != null || subtitle != null;

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {hasHeader ? (
        <header className="flex flex-col gap-1">
          {eyebrow ? (
            <span className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {eyebrow}
            </span>
          ) : null}
          {title ? (
            <h1 className="font-heading text-2xl leading-tight font-bold">{title}</h1>
          ) : null}
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </header>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1 print:hidden">
        {dayNums.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={d === active}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              d === active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {dayLabel(d)}
          </button>
        ))}
      </div>

      <div className="flex flex-col">
        {dayNums.map((d) => (
          <DaySection
            key={d}
            day={d}
            visible={d === active}
            slots={slots}
            cells={cells}
          />
        ))}
      </div>

      {footer ? <div className="mt-auto">{footer}</div> : null}
    </div>
  );
}

function DaySection({
  day,
  visible,
  slots,
  cells,
}: {
  day: number;
  visible: boolean;
  slots: readonly AgendaSlot[];
  cells: readonly AgendaCell[];
}) {
  // Per-day, sorted by time. Never key off a shared slotIndex->time map: days can have
  // different windows/breaks, so each slot must render its own start time.
  const daySlots = slots
    .filter((s) => s.dayOfWeek === day)
    .sort((a, b) => a.slotIndex - b.slotIndex);
  const bySlot = new Map<number, AgendaCell>();
  for (const c of cells) {
    if (c.dayOfWeek === day) bySlot.set(c.slotIndex, c);
  }

  return (
    <section
      className={cn(
        visible ? "flex" : "hidden",
        "flex-col gap-2.5 print:mt-6 print:flex print:break-inside-avoid print:first:mt-0",
      )}
    >
      <h2 className="hidden font-heading text-base font-semibold print:block">{dayLabel(day)}</h2>
      {daySlots.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Tidak ada jadwal hari ini.</p>
      ) : (
        daySlots.map((slot, i) => {
          const prev = i > 0 ? daySlots[i - 1] : null;
          // A gap between one slot's end and the next slot's start is a break.
          const isBreak = prev != null && prev.end !== slot.start;
          return (
            <Fragment key={slot.slotIndex}>
              {isBreak ? <BreakRow at={prev.end} /> : null}
              <SlotRow
                time={clock(slot.start)}
                cell={bySlot.get(slot.slotIndex)}
              />
            </Fragment>
          );
        })
      )}
    </section>
  );
}

function SlotRow({ time, cell }: { time: string; cell: AgendaCell | undefined }) {
  const color = cell?.subjectColor ?? FALLBACK_COLOR;
  return (
    <div className="grid grid-cols-[4rem_1fr] items-start gap-3">
      <span className="pt-3 font-mono text-xs text-muted-foreground">{time}</span>
      {cell ? (
        <div
          className="rounded-xl border-l-4 px-4 py-3"
          style={{ borderLeftColor: color, backgroundColor: `${color}1a` }}
        >
          <div className="leading-snug font-medium">{cell.subjectName}</div>
          <div className="text-sm text-muted-foreground">{cell.teacherName}</div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          —
        </div>
      )}
    </div>
  );
}

function BreakRow({ at }: { at: string }) {
  return (
    <div className="grid grid-cols-[4rem_1fr] items-center gap-3 py-1">
      <span className="font-mono text-[0.7rem] leading-tight text-muted-foreground">
        <span className="block">{clock(at)}</span>
        <span className="block">istirahat</span>
      </span>
      <span className="border-t border-dashed border-border" />
    </div>
  );
}
