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
    // eslint-disable-next-line no-console
    console.log(`[bench] tight 20×20×40 (${placements.length} placements): ${ms.toFixed(1)}ms`);
    expect(validatePlacements(input, placements)).toEqual([]);
    expect(ms).toBeLessThan(5000);
  });

  it("BENCHMARK: large tight instance 40×40×40 (k=1) is fast", () => {
    const input = makeInstance(40, 40, 40); // each class×teacher once; a 40×40 Latin square
    const start = performance.now();
    const { placements } = solve(input);
    const ms = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[bench] tight 40×40×40 (${placements.length} placements): ${ms.toFixed(1)}ms`);
    expect(validatePlacements(input, placements)).toEqual([]);
    expect(ms).toBeLessThan(8000);
  });
});
