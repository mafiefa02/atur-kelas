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

const defaultDay = (schoolDay: boolean): DayConfig => ({
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

export function totalTeachingSlots(config: BellConfig): number {
  return SCHOOL_DAYS.reduce(
    (sum, d) => sum + computeDaySlots(config.days[String(d.n)], config.periodMinutes).length,
    0,
  );
}
