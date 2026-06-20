// Timetable solver — pure, no DB. The hard core is bipartite edge-coloring, solved by
// a guaranteed matching-based construction (can't hang); soft objectives are then
// improved by a bounded within-class-swap hill-climb. See docs §14.

export type Slot = { dayOfWeek: number; slotIndex: number };
export type LessonInput = {
  classId: string;
  subjectId: string;
  teacherId: string;
  assignmentId: string;
};
export type SolverInput = {
  slots: Slot[]; // length T, the global teaching grid
  classIds: string[];
  teacherIds: string[];
  lessons: LessonInput[]; // per class, count must equal T
  seed: number;
};
export type Placement = {
  classId: string;
  dayOfWeek: number;
  slotIndex: number;
  subjectId: string;
  teacherId: string;
  assignmentId: string;
};

export type Feasibility = {
  ok: boolean;
  slotCount: number;
  classLessonCounts: { classId: string; count: number }[]; // count !== T are problems
  overloadedTeachers: { teacherId: string; load: number }[]; // load > T
  moreClassesThanTeachers: boolean;
};

// --- seeded PRNG (deterministic) ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function checkFeasibility(input: SolverInput): Feasibility {
  const T = input.slots.length;
  const perClass = new Map<string, number>(input.classIds.map((c) => [c, 0]));
  const perTeacher = new Map<string, number>(input.teacherIds.map((t) => [t, 0]));
  for (const l of input.lessons) {
    perClass.set(l.classId, (perClass.get(l.classId) ?? 0) + 1);
    perTeacher.set(l.teacherId, (perTeacher.get(l.teacherId) ?? 0) + 1);
  }
  const classLessonCounts = input.classIds.map((c) => ({
    classId: c,
    count: perClass.get(c) ?? 0,
  }));
  const overloadedTeachers = input.teacherIds
    .map((t) => ({ teacherId: t, load: perTeacher.get(t) ?? 0 }))
    .filter((x) => x.load > T);
  const classesBad = classLessonCounts.some((x) => x.count !== T);
  const moreClassesThanTeachers = input.classIds.length > input.teacherIds.length;
  return {
    ok: T > 0 && !classesBad && overloadedTeachers.length === 0 && !moreClassesThanTeachers,
    slotCount: T,
    classLessonCounts,
    overloadedTeachers,
    moreClassesThanTeachers,
  };
}

// Kuhn's augmenting-path perfect matching saturating all L left vertices.
function perfectMatching(L: number, R: number, adj: number[][]): number[] | null {
  const matchR: number[] = Array.from({ length: R }, () => -1);
  const tryKuhn = (l: number, seen: boolean[]): boolean => {
    for (const r of adj[l]) {
      if (!seen[r]) {
        seen[r] = true;
        if (matchR[r] === -1 || tryKuhn(matchR[r], seen)) {
          matchR[r] = l;
          return true;
        }
      }
    }
    return false;
  };
  for (let l = 0; l < L; l++) {
    if (
      !tryKuhn(
        l,
        Array.from({ length: R }, () => false),
      )
    ) {
      return null; // shouldn't happen for a regular graph
    }
  }
  const matchL: number[] = Array.from({ length: L }, () => -1);
  for (let r = 0; r < R; r++) {
    if (matchR[r] !== -1) matchL[matchR[r]] = r;
  }
  return matchL;
}

type Cell = { subjectId: string; teacherId: string; assignmentId: string };

// Construct a hard-feasible grid: grid[classIndex][round] = lesson. Round r maps to
// slots[r]. Guaranteed by regularizing to a T-regular bipartite graph (dummy
// "free-period" classes absorb teacher slack) and extracting T perfect matchings.
function construct(input: SolverInput, rng: () => number): (Cell | null)[][] {
  const T = input.slots.length;
  const classIds = input.classIds;
  const teacherIds = input.teacherIds;
  const C = classIds.length;
  const Tea = teacherIds.length;
  const tIdx = new Map(teacherIds.map((t, i) => [t, i]));
  const cIdx = new Map(classIds.map((c, i) => [c, i]));

  const D = Tea - C; // dummy classes (>= 0 when feasible)
  const L = C + D; // == Tea

  // cap[l][t] = remaining edges; rem[c][t] = remaining real lessons.
  const cap: number[][] = Array.from({ length: L }, () => Array.from({ length: Tea }, () => 0));
  const rem: Cell[][][] = Array.from({ length: C }, () => Array.from({ length: Tea }, () => []));
  const load: number[] = Array.from({ length: Tea }, () => 0);

  for (const l of input.lessons) {
    const c = cIdx.get(l.classId);
    const t = tIdx.get(l.teacherId);
    if (c === undefined || t === undefined) continue;
    cap[c][t]++;
    load[t]++;
    rem[c][t].push({
      subjectId: l.subjectId,
      teacherId: l.teacherId,
      assignmentId: l.assignmentId,
    });
  }

  // Distribute teacher slack across dummy classes so every left vertex has degree T.
  const units: number[] = [];
  for (let t = 0; t < Tea; t++) {
    for (let k = 0; k < T - load[t]; k++) units.push(t);
  }
  for (let i = 0; i < units.length; i++) {
    cap[C + Math.floor(i / T)][units[i]]++;
  }

  const grid: (Cell | null)[][] = Array.from({ length: C }, () =>
    Array.from({ length: T }, () => null as Cell | null),
  );

  for (let r = 0; r < T; r++) {
    const adj: number[][] = [];
    for (let l = 0; l < L; l++) {
      const neighbors: number[] = [];
      for (let t = 0; t < Tea; t++) if (cap[l][t] > 0) neighbors.push(t);
      adj.push(shuffle(neighbors, rng)); // randomized for variety + determinism
    }
    const match = perfectMatching(L, Tea, adj);
    if (!match) {
      throw new Error("Solver failed to find a matching — inputs are likely infeasible.");
    }
    for (let l = 0; l < L; l++) {
      const t = match[l];
      cap[l][t]--;
      if (l < C) {
        const cell = rem[l][t].pop();
        if (cell) grid[l][r] = cell;
      }
    }
  }
  return grid;
}

const pairs = (n: number) => (n * (n - 1)) / 2;
const W_SUBJECT = 3;
const W_TEACHER = 1;

// Improve subject spread (same subject not piled on one day for a class) and teacher
// daily balance, via within-class swaps between two different-day rounds. Bounded.
function optimize(input: SolverInput, grid: (Cell | null)[][], rng: () => number): number {
  const T = input.slots.length;
  const C = input.classIds.length;
  const dayOf = input.slots.map((s) => s.dayOfWeek);
  const days = [...new Set(dayOf)];

  // counts
  const subjDay = new Map<string, number>(); // key c|subject|day
  const teachDay = new Map<string, number>(); // key teacher|day
  const sKey = (c: number, s: string, d: number) => `${c}|${s}|${d}`;
  const tKey = (t: string, d: number) => `${t}|${d}`;
  // teacher occupancy per round (for clash checks): teacherId -> Set(round)
  const slotTeacher: Map<string, number>[] = Array.from({ length: T }, () => new Map());

  for (let c = 0; c < C; c++) {
    for (let r = 0; r < T; r++) {
      const cell = grid[c][r];
      if (!cell) continue;
      subjDay.set(
        sKey(c, cell.subjectId, dayOf[r]),
        (subjDay.get(sKey(c, cell.subjectId, dayOf[r])) ?? 0) + 1,
      );
      teachDay.set(
        tKey(cell.teacherId, dayOf[r]),
        (teachDay.get(tKey(cell.teacherId, dayOf[r])) ?? 0) + 1,
      );
      slotTeacher[r].set(cell.teacherId, (slotTeacher[r].get(cell.teacherId) ?? 0) + 1);
    }
  }

  const penalty = () => {
    let p = 0;
    for (const v of subjDay.values()) p += W_SUBJECT * pairs(v);
    for (const v of teachDay.values()) p += W_TEACHER * pairs(v);
    return p;
  };

  let current = penalty();
  if (days.length < 2) return current; // nothing to spread across

  const maxIter = Math.max(2000, C * T * 4);
  let sinceImprove = 0;
  for (let iter = 0; iter < maxIter && sinceImprove < maxIter / 2; iter++) {
    const c = Math.floor(rng() * C);
    const r1 = Math.floor(rng() * T);
    const r2 = Math.floor(rng() * T);
    if (r1 === r2 || dayOf[r1] === dayOf[r2]) {
      sinceImprove++;
      continue;
    }
    const a = grid[c][r1];
    const b = grid[c][r2];
    if (!a || !b) {
      sinceImprove++;
      continue;
    }
    const d1 = dayOf[r1];
    const d2 = dayOf[r2];
    // clash check: a.teacher must be free at r2, b.teacher free at r1 (excluding c's own).
    if (a.teacherId !== b.teacherId) {
      const aAtR2 = (slotTeacher[r2].get(a.teacherId) ?? 0) > 0;
      const bAtR1 = (slotTeacher[r1].get(b.teacherId) ?? 0) > 0;
      if (aAtR2 || bAtR1) {
        sinceImprove++;
        continue;
      }
    }
    // delta over affected (subject,day) and (teacher,day) cells
    const before =
      W_SUBJECT *
        (pairs(subjDay.get(sKey(c, a.subjectId, d1)) ?? 0) +
          pairs(subjDay.get(sKey(c, a.subjectId, d2)) ?? 0) +
          pairs(subjDay.get(sKey(c, b.subjectId, d1)) ?? 0) +
          pairs(subjDay.get(sKey(c, b.subjectId, d2)) ?? 0)) +
      W_TEACHER *
        (pairs(teachDay.get(tKey(a.teacherId, d1)) ?? 0) +
          pairs(teachDay.get(tKey(a.teacherId, d2)) ?? 0) +
          pairs(teachDay.get(tKey(b.teacherId, d1)) ?? 0) +
          pairs(teachDay.get(tKey(b.teacherId, d2)) ?? 0));

    const adj = (key: string, map: Map<string, number>, delta: number) =>
      map.set(key, (map.get(key) ?? 0) + delta);
    // apply move on counts
    adj(sKey(c, a.subjectId, d1), subjDay, -1);
    adj(sKey(c, a.subjectId, d2), subjDay, +1);
    adj(sKey(c, b.subjectId, d2), subjDay, -1);
    adj(sKey(c, b.subjectId, d1), subjDay, +1);
    adj(tKey(a.teacherId, d1), teachDay, -1);
    adj(tKey(a.teacherId, d2), teachDay, +1);
    adj(tKey(b.teacherId, d2), teachDay, -1);
    adj(tKey(b.teacherId, d1), teachDay, +1);

    const after =
      W_SUBJECT *
        (pairs(subjDay.get(sKey(c, a.subjectId, d1)) ?? 0) +
          pairs(subjDay.get(sKey(c, a.subjectId, d2)) ?? 0) +
          pairs(subjDay.get(sKey(c, b.subjectId, d1)) ?? 0) +
          pairs(subjDay.get(sKey(c, b.subjectId, d2)) ?? 0)) +
      W_TEACHER *
        (pairs(teachDay.get(tKey(a.teacherId, d1)) ?? 0) +
          pairs(teachDay.get(tKey(a.teacherId, d2)) ?? 0) +
          pairs(teachDay.get(tKey(b.teacherId, d1)) ?? 0) +
          pairs(teachDay.get(tKey(b.teacherId, d2)) ?? 0));

    if (after <= before) {
      // accept (also accept equal to allow plateau movement toward better configs)
      if (a.teacherId !== b.teacherId) {
        slotTeacher[r1].set(a.teacherId, (slotTeacher[r1].get(a.teacherId) ?? 0) - 1);
        slotTeacher[r2].set(a.teacherId, (slotTeacher[r2].get(a.teacherId) ?? 0) + 1);
        slotTeacher[r2].set(b.teacherId, (slotTeacher[r2].get(b.teacherId) ?? 0) - 1);
        slotTeacher[r1].set(b.teacherId, (slotTeacher[r1].get(b.teacherId) ?? 0) + 1);
      }
      grid[c][r1] = b;
      grid[c][r2] = a;
      if (after < before) {
        current -= before - after;
        sinceImprove = 0;
      } else {
        sinceImprove++;
      }
    } else {
      // revert counts
      adj(sKey(c, a.subjectId, d1), subjDay, +1);
      adj(sKey(c, a.subjectId, d2), subjDay, -1);
      adj(sKey(c, b.subjectId, d2), subjDay, +1);
      adj(sKey(c, b.subjectId, d1), subjDay, -1);
      adj(tKey(a.teacherId, d1), teachDay, +1);
      adj(tKey(a.teacherId, d2), teachDay, -1);
      adj(tKey(b.teacherId, d2), teachDay, +1);
      adj(tKey(b.teacherId, d1), teachDay, -1);
      sinceImprove++;
    }
  }
  return current;
}

export function solve(input: SolverInput): { placements: Placement[]; softPenalty: number } {
  const rng = mulberry32(input.seed);
  const grid = construct(input, rng);
  const softPenalty = optimize(input, grid, rng);
  const placements: Placement[] = [];
  for (let c = 0; c < input.classIds.length; c++) {
    for (let r = 0; r < input.slots.length; r++) {
      const cell = grid[c][r];
      if (!cell) continue;
      placements.push({
        classId: input.classIds[c],
        dayOfWeek: input.slots[r].dayOfWeek,
        slotIndex: input.slots[r].slotIndex,
        subjectId: cell.subjectId,
        teacherId: cell.teacherId,
        assignmentId: cell.assignmentId,
      });
    }
  }
  return { placements, softPenalty };
}

// Validation helper (used by tests): no teacher clash, every class slot filled.
export function validatePlacements(input: SolverInput, placements: Placement[]): string[] {
  const errors: string[] = [];
  const T = input.slots.length;
  const slotKey = (d: number, i: number) => `${d}:${i}`;
  const classSlot = new Map<string, Set<string>>();
  const teacherSlot = new Map<string, Set<string>>();
  for (const p of placements) {
    const sk = slotKey(p.dayOfWeek, p.slotIndex);
    const cs = classSlot.get(p.classId) ?? new Set();
    if (cs.has(sk)) errors.push(`class ${p.classId} double-booked at ${sk}`);
    cs.add(sk);
    classSlot.set(p.classId, cs);
    const tk = `${p.teacherId}@${sk}`;
    const ts = teacherSlot.get(tk) ? teacherSlot.get(tk)! : new Set<string>();
    if (teacherSlot.has(tk)) errors.push(`teacher ${p.teacherId} clash at ${sk}`);
    teacherSlot.set(tk, ts);
  }
  for (const c of input.classIds) {
    const filled = classSlot.get(c)?.size ?? 0;
    if (filled !== T) errors.push(`class ${c} has ${filled}/${T} slots filled`);
  }
  return errors;
}
