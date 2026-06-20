// Pure timetable export helpers (no DOM, no server deps) — safe on client and testable.

import { SCHOOL_DAYS } from "./schedule.ts";

export type ExportSlot = { dayOfWeek: number; slotIndex: number; start: string; end: string };
export type ExportClass = { id: string; name: string; gradeName: string };
export type ExportPlacement = {
  classGroupId: string;
  dayOfWeek: number;
  slotIndex: number;
  subjectName: string;
  teacherName: string;
};
export type ExportData = {
  slots: ExportSlot[];
  classes: ExportClass[];
  placements: ExportPlacement[];
};

const dayLabel = (n: number) => SCHOOL_DAYS.find((d) => d.n === n)?.label ?? `Day ${n}`;
const hhmm = (t: string) => t.slice(0, 5);

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// Long-format CSV (one row per lesson) — easy to filter/pivot in Excel.
export function timetableToCsv(data: ExportData): string {
  const timeOf = new Map(
    data.slots.map((s) => [`${s.dayOfWeek}:${s.slotIndex}`, `${hhmm(s.start)}-${hhmm(s.end)}`]),
  );
  const nameOf = new Map(data.classes.map((c) => [c.id, `${c.gradeName} ${c.name}`]));
  const sorted = [...data.placements].sort(
    (a, b) =>
      (nameOf.get(a.classGroupId) ?? "").localeCompare(nameOf.get(b.classGroupId) ?? "") ||
      a.dayOfWeek - b.dayOfWeek ||
      a.slotIndex - b.slotIndex,
  );
  const rows: string[][] = [["Class", "Day", "Time", "Subject", "Teacher"]];
  for (const p of sorted) {
    rows.push([
      nameOf.get(p.classGroupId) ?? "",
      dayLabel(p.dayOfWeek),
      timeOf.get(`${p.dayOfWeek}:${p.slotIndex}`) ?? "",
      p.subjectName,
      p.teacherName,
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
