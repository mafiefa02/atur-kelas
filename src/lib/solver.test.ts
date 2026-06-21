import { describe, expect, it } from "vitest";

import { type SolverInput, checkFeasibility, solve, validatePlacements } from "./solver.ts";

// Build a feasible instance: C classes, Tea teachers, T slots (Tea must divide T,
// C <= Tea). Each class takes each teacher T/Tea times → class load T, teacher load
// C*(T/Tea) <= T. C === Tea makes every teacher load == T (tightest, zero slack).
function makeInstance(C: number, Tea: number, T: number, seed = 1): SolverInput {
  const slotsPerDay = 8;
  const slots = Array.from({ length: T }, (_, i) => ({
    dayOfWeek: Math.floor(i / slotsPerDay) + 1,
    slotIndex: i % slotsPerDay,
  }));
  const classIds = Array.from({ length: C }, (_, i) => `c${i}`);
  const teacherIds = Array.from({ length: Tea }, (_, i) => `t${i}`);
  const k = T / Tea;
  const lessons = [];
  for (const c of classIds) {
    for (const t of teacherIds) {
      for (let n = 0; n < k; n++) {
        lessons.push({
          classId: c,
          subjectId: `subj-${t}`,
          teacherId: t,
          assignmentId: `${c}-${t}-${n}`,
        });
      }
    }
  }
  return { slots, classIds, teacherIds, lessons, seed };
}

describe("solver", () => {
  it("produces a clash-free, fully-packed timetable (slack instance)", () => {
    const input = makeInstance(6, 12, 24); // k=2, teacher load 12 of 24 (lots of slack)
    const feas = checkFeasibility(input);
    expect(feas.ok).toBe(true);
    const { placements } = solve(input);
    expect(validatePlacements(input, placements)).toEqual([]);
    expect(placements.length).toBe(6 * 24);
  });

  it("is deterministic for a given seed", () => {
    const a = solve(makeInstance(8, 10, 40, 42));
    const b = solve(makeInstance(8, 10, 40, 42));
    expect(b.placements).toEqual(a.placements);
  });

  it("different seeds give different layouts", () => {
    const a = solve(makeInstance(8, 10, 40, 1));
    const b = solve(makeInstance(8, 10, 40, 2));
    // same set of lessons, but at least some placed in different slots
    const key = (p: {
      classId: string;
      assignmentId: string;
      dayOfWeek: number;
      slotIndex: number;
    }) => `${p.assignmentId}@${p.dayOfWeek}:${p.slotIndex}`;
    const setA = new Set(a.placements.map(key));
    const differ = b.placements.some((p) => !setA.has(key(p)));
    expect(differ).toBe(true);
  });

  it("flags infeasible: a teacher overloaded beyond T", () => {
    const input = makeInstance(4, 8, 24);
    // pile extra lessons on one teacher to exceed T, removing others to keep class totals
    const feas = checkFeasibility({
      ...input,
      lessons: input.lessons.map((l, i) => (i % 3 === 0 ? { ...l, teacherId: "t0" } : l)),
    });
    expect(feas.ok).toBe(false);
    expect(feas.overloadedTeachers.length).toBeGreaterThan(0);
  });

  it("BENCHMARK: tight instance (every teacher at load == T, zero slack) is fast", () => {
    // 20 classes, 20 teachers, T=40 — each (class,teacher) twice; all teachers at load 40.
    const input = makeInstance(20, 20, 40);
    const feas = checkFeasibility(input);
    expect(feas.ok).toBe(true);
    const start = performance.now();
    const { placements } = solve(input);
    const ms = performance.now() - start;
    console.log(`[bench] tight 20×20×40 (${placements.length} placements): ${ms.toFixed(1)}ms`);
    expect(validatePlacements(input, placements)).toEqual([]);
    expect(ms).toBeLessThan(5000);
  });

  it("BENCHMARK: large tight instance 40×40×40 (k=1) is fast", () => {
    const input = makeInstance(40, 40, 40); // each class×teacher once; a 40×40 Latin square
    const start = performance.now();
    const { placements } = solve(input);
    const ms = performance.now() - start;
    console.log(`[bench] tight 40×40×40 (${placements.length} placements): ${ms.toFixed(1)}ms`);
    expect(validatePlacements(input, placements)).toEqual([]);
    expect(ms).toBeLessThan(8000);
  });
});

describe("solver pins", () => {
  const base = makeInstance(6, 12, 24, 1);
  const ref = solve(base).placements;
  const cellKey = (p: { classId: string; dayOfWeek: number; slotIndex: number }) =>
    `${p.classId}:${p.dayOfWeek}:${p.slotIndex}`;

  it("keeps a locked lesson at its exact cell/assignment across many seeds, post-optimize", () => {
    const target = ref[3];
    const pin = {
      classId: target.classId,
      dayOfWeek: target.dayOfWeek,
      slotIndex: target.slotIndex,
      assignmentId: target.assignmentId,
    };
    for (let seed = 1; seed <= 20; seed++) {
      const res = solve({ ...base, seed, pins: [pin] });
      expect(res.honoredPinKeys).toContain(cellKey(target));
      const placed = res.placements.find((p) => cellKey(p) === cellKey(target));
      // exact cell holds the exact pinned assignment even after the optimize pass
      expect(placed?.assignmentId).toBe(pin.assignmentId);
      expect(validatePlacements(base, res.placements)).toEqual([]);
    }
  });

  it("every honored key actually holds its pinned assignment (multi-pin)", () => {
    const seen = new Set<string>();
    const pins = [];
    for (const p of ref) {
      if (seen.has(p.classId)) continue;
      seen.add(p.classId);
      pins.push({
        classId: p.classId,
        dayOfWeek: p.dayOfWeek,
        slotIndex: p.slotIndex,
        assignmentId: p.assignmentId,
      });
    }
    const res = solve({ ...base, seed: 777, pins });
    const byCell = new Map(res.placements.map((p) => [cellKey(p), p.assignmentId]));
    const want = new Map(pins.map((p) => [cellKey(p), p.assignmentId]));
    for (const key of res.honoredPinKeys) {
      expect(byCell.get(key)).toBe(want.get(key)); // contract generateTimetable trusts
    }
    expect(validatePlacements(base, res.placements)).toEqual([]);
  });

  it("drops conflicting pins (same teacher + slot) gracefully and stays clash-free", () => {
    const slot = base.slots[0];
    const pins = [
      {
        classId: "c0",
        dayOfWeek: slot.dayOfWeek,
        slotIndex: slot.slotIndex,
        assignmentId: "c0-t0-0",
      },
      {
        classId: "c1",
        dayOfWeek: slot.dayOfWeek,
        slotIndex: slot.slotIndex,
        assignmentId: "c1-t0-0",
      },
    ];
    const res = solve({ ...base, seed: 5, pins });
    // both demand teacher t0 in the same slot — at most one can be honored
    expect(res.honoredPinKeys.length).toBeLessThanOrEqual(1);
    expect(res.honoredPinKeys).not.toContain(`c1:${slot.dayOfWeek}:${slot.slotIndex}`);
    expect(validatePlacements(base, res.placements)).toEqual([]);
  });

  it("ignores pins that don't resolve to a current slot/assignment", () => {
    const slot = base.slots[0];
    const pins = [
      { classId: "c0", dayOfWeek: 99, slotIndex: 99, assignmentId: "c0-t0-0" }, // no such slot
      { classId: "c0", dayOfWeek: slot.dayOfWeek, slotIndex: slot.slotIndex, assignmentId: "nope" }, // no such lesson
    ];
    const res = solve({ ...base, seed: 5, pins });
    expect(res.honoredPinKeys).toEqual([]);
    expect(validatePlacements(base, res.placements)).toEqual([]);
  });
});
