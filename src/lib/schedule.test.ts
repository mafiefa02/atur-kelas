import { describe, expect, it } from "vitest";

import { type SnapshotSlot, buildTimeGrid } from "./schedule.ts";

// Mon (day 1): four periods with a break between slot 1 and slot 2.
// Fri (day 5): only two periods — ends before Mon's break.
const slots: SnapshotSlot[] = [
  { dayOfWeek: 1, slotIndex: 0, start: "07:00", end: "07:45" },
  { dayOfWeek: 1, slotIndex: 1, start: "07:45", end: "08:30" },
  { dayOfWeek: 1, slotIndex: 2, start: "09:00", end: "09:45" }, // after a 08:30–09:00 break
  { dayOfWeek: 1, slotIndex: 3, start: "09:45", end: "10:30" },
  { dayOfWeek: 5, slotIndex: 0, start: "07:00", end: "07:45" },
  { dayOfWeek: 5, slotIndex: 1, start: "07:45", end: "08:30" },
];

describe("buildTimeGrid", () => {
  const { dayNums, rows } = buildTimeGrid(slots);

  it("orders day columns and rows by time", () => {
    expect(dayNums).toEqual([1, 5]);
    expect(rows.map((r) => r.label)).toEqual([
      "07:00–07:45",
      "07:45–08:30",
      "08:30–09:00", // break band
      "09:00–09:45",
      "09:45–10:30",
    ]);
  });

  it("gives the break its own row", () => {
    const breakRow = rows.find((r) => r.kind === "break");
    expect(breakRow?.label).toBe("08:30–09:00");
    // Only Mon has the break; it occupies the band as a break cell.
    expect(breakRow?.cells.get(1)).toEqual({ kind: "break" });
  });

  it("leaves a day empty where it has no slot or break (shorter day)", () => {
    const breakRow = rows.find((r) => r.kind === "break")!;
    const lastRow = rows.at(-1)!;
    // Fri has ended by the break band and the later lesson bands — no cell at all.
    expect(breakRow.cells.has(5)).toBe(false);
    expect(lastRow.cells.has(5)).toBe(false);
    // Mon still teaches in the last band.
    expect(lastRow.cells.get(1)).toEqual({ kind: "lesson", slotIndex: 3 });
  });

  it("carries each day's real slotIndex across the break (not the row position)", () => {
    // The 09:00–09:45 row is the 4th row (index 3) but is Mon's slotIndex 2.
    const afterBreak = rows.find((r) => r.label === "09:00–09:45")!;
    expect(rows.indexOf(afterBreak)).toBe(3);
    expect(afterBreak.cells.get(1)).toEqual({ kind: "lesson", slotIndex: 2 });
  });
});
