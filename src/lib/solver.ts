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
// A locked cell: the given assignment must land at exactly (dayOfWeek, slotIndex) for
// its class. Pins are fixed inputs to the solver, not a post-hoc repair (see docs §14).
export type PinInput = {
  classId: string;
  dayOfWeek: number;
  slotIndex: number;
  assignmentId: string;
};
export type SolverInput = {
  slots: Slot[]; // length T, the global teaching grid
  classIds: string[];
  teacherIds: string[];
  lessons: LessonInput[]; // per class, count must equal T
  seed: number;
  pins?: PinInput[]; // optional locked cells the solver builds around
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

type ForcedEdge = { c: number; t: number };

// Kuhn's augmenting-path matching for one round, saturating all L left vertices over R
// teachers. `forced` pre-binds class→teacher edges (pinned cells): those teachers are
// locked so augmenting paths can't steal them, and forced classes are matched outright.
// Returns matchL (class→teacher) or null if any left vertex (dummy included) can't be
// saturated — which, for a forced round, signals the pins can't be honored this round.
function matchRound(
  L: number,
  R: number,
  adj: number[][],
  forced: ForcedEdge[],
  cap: number[][],
): number[] | null {
  const matchR: number[] = Array.from({ length: R }, () => -1);
  const locked: boolean[] = Array.from({ length: R }, () => false);
  const forcedClass = new Set<number>();
  for (const f of forced) {
    if (cap[f.c][f.t] <= 0 || locked[f.t]) return null; // demand gone / teacher clash
    matchR[f.t] = f.c;
    locked[f.t] = true;
    forcedClass.add(f.c);
  }
  const tryKuhn = (l: number, seen: boolean[]): boolean => {
    for (const r of adj[l]) {
      if (locked[r] || seen[r]) continue;
      seen[r] = true;
      if (matchR[r] === -1 || tryKuhn(matchR[r], seen)) {
        matchR[r] = l;
        return true;
      }
    }
    return false;
  };
  for (let l = 0; l < L; l++) {
    if (forcedClass.has(l)) continue;
    if (
      !tryKuhn(
        l,
        Array.from({ length: R }, () => false),
      )
    ) {
      return null;
    }
  }
  const matchL: number[] = Array.from({ length: L }, () => -1);
  for (let r = 0; r < R; r++) {
    if (matchR[r] !== -1) matchL[matchR[r]] = r;
  }
  return matchL;
}

type Cell = { subjectId: string; teacherId: string; assignmentId: string };

type ConstructResult = {
  grid: (Cell | null)[][];
  // Indices "c|r" of cells that ended up locked to a pin (honored). Pins that couldn't
  // be honored without breaking feasibility are silently absent.
  pinned: Set<string>;
};

// Construct a hard-feasible grid: grid[classIndex][round] = lesson. Round r maps to
// slots[r]. Guaranteed by regularizing to a T-regular bipartite graph (dummy
// "free-period" classes absorb teacher slack) and extracting T perfect matchings.
// Pinned cells are fixed first: their rounds are matched ahead of the rest with the
// pin's class→teacher edge forced, so the remainder routes around them. A pin that
// can't be honored in its round is dropped (graceful — the precoloring-extension
// problem is NP-hard in general, so we never promise to honor an arbitrary pin set).
function construct(input: SolverInput, rng: () => number): ConstructResult {
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

  // Resolve pins to (round, class, teacher, assignment), dropping any that don't map to
  // a current slot/class/lesson, exceed available instances, or clash within a round.
  const asgTeacher = new Map(input.lessons.map((l) => [l.assignmentId, l.teacherId]));
  const slotRound = new Map(input.slots.map((s, i) => [`${s.dayOfWeek}:${s.slotIndex}`, i]));
  type ResolvedPin = { r: number; c: number; t: number; assignmentId: string };
  const pinsByRound = new Map<number, ResolvedPin[]>();
  const pinned = new Set<string>(); // "c|r" of accepted pins (may shrink on drop)
  const usedInstances = new Map<string, number>(); // assignmentId -> pins consuming it
  for (const pin of input.pins ?? []) {
    const r = slotRound.get(`${pin.dayOfWeek}:${pin.slotIndex}`);
    const c = cIdx.get(pin.classId);
    const teacherId = asgTeacher.get(pin.assignmentId);
    const t = teacherId === undefined ? undefined : tIdx.get(teacherId);
    if (r === undefined || c === undefined || t === undefined) continue;
    const have = rem[c][t].filter((x) => x.assignmentId === pin.assignmentId).length;
    const used = usedInstances.get(pin.assignmentId) ?? 0;
    if (used + 1 > have) continue; // can't pin more copies than exist
    const list = pinsByRound.get(r) ?? [];
    if (list.some((p) => p.c === c || p.t === t)) continue; // dup cell / teacher clash in round
    list.push({ r, c, t, assignmentId: pin.assignmentId });
    pinsByRound.set(r, list);
    usedInstances.set(pin.assignmentId, used + 1);
    pinned.add(`${c}|${r}`);
  }

  // Process pinned rounds first (residual is most flexible early), then the rest. With
  // no pins this is just 0..T-1, identical to the original schedule.
  const order = [
    ...pinsByRound.keys(),
    ...Array.from({ length: T }, (_, r) => r).filter((r) => !pinsByRound.has(r)),
  ];

  for (const r of order) {
    const adj: number[][] = [];
    for (let l = 0; l < L; l++) {
      const neighbors: number[] = [];
      for (let t = 0; t < Tea; t++) if (cap[l][t] > 0) neighbors.push(t);
      adj.push(shuffle(neighbors, rng)); // randomized for variety + determinism
    }
    // Try to honor this round's pins; drop them one at a time until the round saturates.
    // An empty forced set is an ordinary regular-bipartite match, which always succeeds.
    let forced = pinsByRound.get(r) ?? [];
    let match = matchRound(L, Tea, adj, forced, cap);
    while (!match && forced.length > 0) {
      const dropped = forced[forced.length - 1];
      forced = forced.slice(0, -1);
      pinned.delete(`${dropped.c}|${dropped.r}`);
      match = matchRound(L, Tea, adj, forced, cap);
    }
    if (!match) {
      throw new Error("Solver failed to find a matching — inputs are likely infeasible.");
    }
    const forcedAsg = new Map(forced.map((f) => [f.c, f.assignmentId]));
    for (let l = 0; l < L; l++) {
      const t = match[l];
      cap[l][t]--;
      if (l < C) {
        const want = forcedAsg.get(l);
        let cell: Cell | undefined;
        if (want !== undefined) {
          const i = rem[l][t].findIndex((x) => x.assignmentId === want);
          cell = i >= 0 ? rem[l][t].splice(i, 1)[0] : rem[l][t].pop();
        } else {
          cell = rem[l][t].pop();
        }
        if (cell) grid[l][r] = cell;
      }
    }
  }
  return { grid, pinned };
}

const pairs = (n: number) => (n * (n - 1)) / 2;
const W_SUBJECT = 3;
const W_TEACHER = 1;

// Improve subject spread (same subject not piled on one day for a class) and teacher
// daily balance, via within-class swaps between two different-day rounds. Bounded.
// Pinned cells stay put: they still count toward the penalty (so other lessons spread
// around them), but a swap touching a pinned cell is never proposed.
function optimize(
  input: SolverInput,
  grid: (Cell | null)[][],
  rng: () => number,
  pinned: Set<string>,
): number {
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
    if (pinned.has(`${c}|${r1}`) || pinned.has(`${c}|${r2}`)) {
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

export function solve(input: SolverInput): {
  placements: Placement[];
  softPenalty: number;
  // Cell keys "classId:dayOfWeek:slotIndex" of pins the solver honored. Requested pins
  // absent here couldn't be placed and should be treated as unpinned by the caller.
  honoredPinKeys: string[];
} {
  const rng = mulberry32(input.seed);
  const { grid, pinned } = construct(input, rng);
  const softPenalty = optimize(input, grid, rng, pinned);
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
  const honoredPinKeys = [...pinned].map((k) => {
    const [c, r] = k.split("|").map(Number);
    return `${input.classIds[c]}:${input.slots[r].dayOfWeek}:${input.slots[r].slotIndex}`;
  });
  return { placements, softPenalty, honoredPinKeys };
}

// Validation helper (used by tests): no teacher clash, every class slot filled.
export function validatePlacements(input: SolverInput, placements: Placement[]): string[] {
  const errors: string[] = [];
  const T = input.slots.length;
  const slotKey = (d: number, i: number) => `${d}:${i}`;
  const classSlot = new Map<string, Set<string>>();
  const teacherSlot = new Set<string>();
  for (const p of placements) {
    const sk = slotKey(p.dayOfWeek, p.slotIndex);
    const cs = classSlot.get(p.classId) ?? new Set();
    if (cs.has(sk)) errors.push(`class ${p.classId} double-booked at ${sk}`);
    cs.add(sk);
    classSlot.set(p.classId, cs);
    const tk = `${p.teacherId}@${sk}`;
    if (teacherSlot.has(tk)) errors.push(`teacher ${p.teacherId} clash at ${sk}`);
    teacherSlot.add(tk);
  }
  for (const c of input.classIds) {
    const filled = classSlot.get(c)?.size ?? 0;
    if (filled !== T) errors.push(`class ${c} has ${filled}/${T} slots filled`);
  }
  return errors;
}
