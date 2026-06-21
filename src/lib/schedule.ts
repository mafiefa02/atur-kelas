// Bell schedule model + slot derivation. Pure (no server deps) so it runs on both
// the server (feasibility counter, solver) and the client (live preview).

export type BreakBlock = { start: string; end: string; label?: string };
export type DayConfig = {
  schoolDay: boolean;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  breaks: BreakBlock[];
};
export type BellConfig = {
  periodMinutes: number;
  days: Record<string, DayConfig>; // keyed by day-of-week "1" (Senin) .. "6" (Sabtu)
};

export const SCHOOL_DAYS = [
  { n: 1, label: "Senin" },
  { n: 2, label: "Selasa" },
  { n: 3, label: "Rabu" },
  { n: 4, label: "Kamis" },
  { n: 5, label: "Jumat" },
  { n: 6, label: "Sabtu" },
] as const;

export const dayLabel = (n: number) => SCHOOL_DAYS.find((d) => d.n === n)?.label ?? `Day ${n}`;

export const defaultDay = (schoolDay: boolean): DayConfig => ({
  schoolDay,
  start: "07:00",
  end: "15:00",
  breaks: [],
});

// Default: Senin–Jumat are school days, Sabtu off, 45-minute periods.
export const DEFAULT_BELL_CONFIG: BellConfig = {
  periodMinutes: 45,
  days: {
    "1": defaultDay(true),
    "2": defaultDay(true),
    "3": defaultDay(true),
    "4": defaultDay(true),
    "5": defaultDay(true),
    "6": defaultDay(false),
  },
};

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "07:00:00" / "07:00" -> "07:00" — trims a stored time to hours:minutes for display.
export const hhmm = (t: string) => t.slice(0, 5);

export type Slot = { index: number; start: string; end: string };

// Walk the window in period-length steps; when a step would overlap a break, jump
// past the break and continue. Returns the teaching slots for one day.
export function computeDaySlots(day: DayConfig | undefined, periodMinutes: number): Slot[] {
  if (!day || !day.schoolDay || periodMinutes <= 0) {
    return [];
  }
  const start = toMinutes(day.start);
  const end = toMinutes(day.end);
  const breaks = (day.breaks ?? [])
    .map((b) => ({ s: toMinutes(b.start), e: toMinutes(b.end) }))
    .filter((b) => b.e > b.s)
    .sort((a, b) => a.s - b.s);

  const slots: Slot[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor + periodMinutes <= end && guard++ < 200) {
    const slotEnd = cursor + periodMinutes;
    const overlap = breaks.find((b) => cursor < b.e && slotEnd > b.s);
    if (overlap) {
      cursor = overlap.e;
      continue;
    }
    slots.push({ index: slots.length, start: toHHMM(cursor), end: toHHMM(slotEnd) });
    cursor = slotEnd;
  }
  return slots;
}

// Point-in-time copy of a published timetable, denormalized so the public page renders
// without any joins and is immune to later renames/reassignments. Stored as jsonb.
export type SnapshotSlot = { dayOfWeek: number; slotIndex: number; start: string; end: string };
export type SnapshotCell = {
  dayOfWeek: number;
  slotIndex: number;
  subjectName: string;
  subjectColor: string | null;
  teacherName: string;
};
export type SnapshotClass = { name: string; gradeName: string; cells: SnapshotCell[] };
export type PublishedSnapshot = {
  schoolName: string;
  termName: string;
  publishedAt: string;
  slots: SnapshotSlot[];
  classes: Record<string, SnapshotClass>; // keyed by classGroupId
};

// The full week of teaching slots, flattened across days and enriched with times.
// The single source the solver, feasibility counter, and every grid view derive from.
export function buildSlots(config: BellConfig): SnapshotSlot[] {
  const slots: SnapshotSlot[] = [];
  for (const { n } of SCHOOL_DAYS) {
    for (const s of computeDaySlots(config.days[String(n)], config.periodMinutes)) {
      slots.push({ dayOfWeek: n, slotIndex: s.index, start: s.start, end: s.end });
    }
  }
  return slots;
}

export function totalTeachingSlots(config: BellConfig): number {
  return buildSlots(config).length;
}

// Shared scaffolding for the three timetable grids (admin, print, public): the ordered
// day columns, the row count, each row's time label, and which (day,slot) cells exist.
export function buildGridFrame(slots: readonly SnapshotSlot[]) {
  const dayNums = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);
  const maxSlot = slots.reduce((m, s) => Math.max(m, s.slotIndex + 1), 0);
  const rowTime = new Map<number, string>();
  for (const s of slots) {
    if (!rowTime.has(s.slotIndex)) rowTime.set(s.slotIndex, `${hhmm(s.start)}–${hhmm(s.end)}`);
  }
  const hasSlot = new Set(slots.map((s) => `${s.dayOfWeek}:${s.slotIndex}`));
  return { dayNums, maxSlot, rowTime, hasSlot };
}

// What a single day holds in one time-band row: a teaching slot (carrying the slotIndex
// the placement/pin/swap handlers key off), or a break. A day with no interval covering
// the row is simply absent from the row's `cells` map (renders empty).
export type GridDayCell = { kind: "lesson"; slotIndex: number } | { kind: "break" };
export type GridRow = {
  start: string;
  end: string;
  label: string; // "07:00–07:45"
  kind: "lesson" | "break";
  cells: Map<number, GridDayCell>; // dayOfWeek -> what that day has in this band
};

// Time-accurate grid: rows are real (start,end) bands, not slot indices. Unlike
// buildGridFrame, this never assumes slotIndex N lands at the same time across days —
// each day's slots/breaks are placed by their own clock times. Breaks (the gaps between
// consecutive teaching slots) get their own rows, and a day that ends early simply has
// no cell in the later rows (so it renders empty rather than borrowing another day's time).
export function buildTimeGrid(slots: readonly SnapshotSlot[]): {
  dayNums: number[];
  rows: GridRow[];
} {
  const dayNums = [...new Set(slots.map((s) => s.dayOfWeek))].sort((a, b) => a - b);

  // Per-day, chronological intervals: each teaching slot, plus a break for every gap
  // between one slot's end and the next slot's start.
  type Interval = { start: string; end: string; cell: GridDayCell };
  const perDay = new Map<number, Interval[]>();
  for (const d of dayNums) {
    const daySlots = slots
      .filter((s) => s.dayOfWeek === d)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    const intervals: Interval[] = [];
    for (let i = 0; i < daySlots.length; i++) {
      const s = daySlots[i];
      const prev = daySlots[i - 1];
      if (prev && toMinutes(prev.end) < toMinutes(s.start)) {
        intervals.push({ start: prev.end, end: s.start, cell: { kind: "break" } });
      }
      intervals.push({
        start: s.start,
        end: s.end,
        cell: { kind: "lesson", slotIndex: s.slotIndex },
      });
    }
    perDay.set(d, intervals);
  }

  // Merge every day's intervals into rows keyed by exact (start,end). Days that share a
  // band collapse onto one row; misaligned bands become their own rows (an honest
  // staircase rather than a fudged alignment).
  const rowMap = new Map<string, GridRow>();
  for (const [d, intervals] of perDay) {
    for (const iv of intervals) {
      const key = `${hhmm(iv.start)}-${hhmm(iv.end)}`;
      let row = rowMap.get(key);
      if (!row) {
        row = {
          start: iv.start,
          end: iv.end,
          label: `${hhmm(iv.start)}–${hhmm(iv.end)}`,
          kind: iv.cell.kind,
          cells: new Map(),
        };
        rowMap.set(key, row);
      }
      // If any day teaches in this band, the row reads as a lesson row.
      if (iv.cell.kind === "lesson") row.kind = "lesson";
      row.cells.set(d, iv.cell);
    }
  }

  const rows = [...rowMap.values()].sort(
    (a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end),
  );
  return { dayNums, rows };
}
