# Dashboard redesign — school-at-a-glance

**Status:** approved (design) · **Date:** 2026-06-21

## Problem

`src/routes/_authed/_app/dashboard.tsx` is the app home (the `HouseIcon` nav entry,
landed on after login). Today it shows only the organization **name, slug, member count,
and the viewer's role** — none of which relate to the app's actual job (generating the
weekly intrakurikuler timetable). It carries no meaningful at-a-glance signal.

Setup guidance is **out of scope** here: a full onboarding wizard already exists
(`/onboarding` + `firstIncompleteStep`), and the app shell already shows a _Continue
setup_ button when setup is incomplete. The dashboard is the steady-state home.

## Goal

Replace the current card with a **school-at-a-glance** overview of the active term,
sourced from data the app already computes (catalogs, feasibility readiness, timetable
status, published snapshot). Read-only.

## Decisions captured during brainstorming

- **Emphasis:** "school at a glance" (a data overview), not an ops command center or a
  next-action hub.
- **Panels (all four chosen):** timetable status, per-class coverage, teacher load,
  curriculum by grade — plus a top stat-card row.
- **Layout:** status strip + 2-column grid (see below).
- Dropping the slug / member-count / viewer-role info entirely (not meaningful to
  timetabling).
- Stat cards link to their respective setup pages.

## Layout

```
School name · Term name · (dates)
[Grades] [Subjects] [Teachers] [Classes] [Slots/week]   ← stat cards, each links to its setup page
┌─ Timetable status strip (full width) ───────────────────┐
└─────────────────────────────────────────────────────────┘
┌─ Per-class coverage ──┐  ┌─ Teacher load ──────────────┐
└───────────────────────┘  └─────────────────────────────┘
┌─ Curriculum by grade (full width) ──────────────────────┐
└─────────────────────────────────────────────────────────┘
```

The two-column grid collapses to a single column on mobile.

## Panels

### Stat cards (top row)

Five cards: **Grades, Subjects, Teachers, Classes, Slots/week**. Each shows a count, a
label, and a small Phosphor icon (reuse the nav icons). Each card is a `Link` to its
setup page (`/grades`, `/subjects`, `/teachers`, `/classes`; Slots/week → `/schedule`).
`Slots/week` is the derived teaching-slot count `T` (from the bell schedule); shows `—`
when no bell schedule/term exists.

### Timetable status strip (full width)

Reflects the **term-level** timetable lifecycle. (Verified: publish is term-level — one
`timetable.publishedSnapshot` per term written all-classes-at-once; every `classGroup`
already carries a `shareToken` unconditionally. There is no per-class publish flag.)

- **None** (no timetable row): "No timetable yet" + a readiness hint derived from the
  structured rows — green "Ready to generate" when there are zero blockers, else amber
  "N issue(s) to resolve". Primary action → `/timetable`.
- **Draft**: "Draft · generated {relativeTime}". A "stale — inputs changed" pill when
  `timetable.inputsHash !== hashInputs(loaded)`. Action → `/timetable`.
- **Published**: "Published · generated {relativeTime}". Stale pill as above. Plus a
  **live-classes** note: `{live}/{total} classes live`, where `live` = current classes
  whose id is a key in `publishedSnapshot.classes`. When `live < total` (a class added
  after publishing, not in the snapshot) the note is amber; otherwise "all {total}
  classes live". Action → `/timetable`. This live-count is the **only** genuinely
  per-class metric the snapshot supports — a term-level "Published/Not published" badge
  would otherwise be all-or-nothing.

### Per-class coverage (left column)

A row per rombel: `{gradeName} {className}` · `{assigned}/{T}` · a status `Badge`:

- **ready** (green): `assigned === T` and no missing subjects.
- **short N** (amber): `assigned < T` (`N = T - assigned`).
- **over N** (red): `assigned > T` (`N = assigned - T`).
- **missing teacher** (red): one or more curriculum subjects for the grade have no
  assignment; lists the subject name(s).

These are the same numbers the generate gate uses (see Architecture). Empty state (no
classes): a hint linking to `/classes`.

### Teacher load (right column)

A row per teacher (including idle teachers with zero load): name · a utilization bar ·
`{load}/{T}`. `load` = sum of `weeklyCount` across the teacher's assignments; capacity =
`T`.

- **overloaded** (red): `load > T` — consistent with `checkFeasibility`'s definition
  (`solver.ts`: `overloadedTeachers = ... filter(load > T)`).
- **full** (neutral/green): `load === T`.
- **under-loaded** (muted): `0 < load < T`.
- **idle** (muted): `load === 0` → "no load".

The bar is a small custom `div` (fill width = `min(load/T, 1)`, with an overflow marker
when `load > T`). Rationale: shadcn `Progress` models 0–100% only and cannot represent
overload (>100%); a load meter must. This is a data-viz primitive, not a UI control, so
hand-building it does not violate the "use shadcn, don't hand-roll components" rule.
Empty state (no teachers): a hint linking to `/teachers`.

### Curriculum by grade (full width)

Per grade: `{gradeName}` · subject chips `MTK 5 · IPA 4 · B.Indo 4 …` · `total {sum}`.
The total is colored amber when it `!== T` (a grade whose alokasi waktu doesn't sum to
the week's slots can't be exactly covered by any rombel in it). Empty state (no
curriculum): a hint linking to `/curriculum`.

## Data & architecture

### New server fn

`src/lib/server/dashboard.ts` exporting a single GET server fn `getDashboardSummary`.

- **Module discipline (db leak):** the file contains **only** server fns; all `db` use
  stays inside the handler. Structured helpers live in `timetable-data.ts` (already a
  server-only `*-data.ts` module). Verify after writing:
  `curl localhost:3000/src/lib/server/dashboard.ts | grep '^import' | grep -E '/lib/db|drizzle'`
  must be empty.
- **No redirect:** uses `requireOrgContext()` — **not** `requireActiveTerm()`, which
  redirects to `/terms` when no term is active. The home must render regardless.
- Looks up the active term itself. When none exists, returns a `hasTerm: false` shape
  carrying only the org-scoped catalog counts (grades, subjects, teachers).
- When a term is active: calls `loadAll(term.id, organizationId)` (existing), the new
  `summarize(loaded)` helper, and reads the `timetable` row (`status`, `generatedAt`,
  `inputsHash` for stale, `publishedSnapshot` for the live-class count).
- Returns `schoolName`, `termName`, term dates, the stat counts, `slotCount` (T), the
  structured `classes[]` and `teachers[]` rows, `curriculumByGrade[]`, and
  `timetable: { status: 'none' | 'draft' | 'published', generatedAt, stale, live, total }`.

### Refactor: one source of truth for feasibility

The per-class coverage and teacher load are exactly what `computeReadiness` in
`timetable-data.ts` already computes — it just stringifies the results into `blockers`.
To prevent drift (dashboard says "ready" while generate says "blocked"):

1. Extract a structured `summarize(input)` →
   `{ slotCount, classes: ClassCoverage[], teachers: TeacherCoverage[] }`, where
   `ClassCoverage = { classId, className, gradeName, gradeLevelId, assigned, required, missingSubjects, status }`
   and `TeacherCoverage = { teacherId, name, load, capacity, overloaded }`. It lives in a
   **new pure module `src/lib/server/coverage.ts`** (no `db` import — `timetable-data.ts`
   pulls in `db`/`env`, which would make `summarize` require a database to unit-test). It
   takes a structural `SummarizeInput` subset of `Loaded`, so there is no circular import.
2. `computeReadiness(loaded)` is rewritten to derive its **byte-identical** blocker
   strings from `summarize`'s rows (preserving the `slotCount === 0` guard and the exact
   message text used by `generateTimetable` and `getTimetableView`). Teacher overload via
   `load > T` is provably equivalent to the prior `checkFeasibility.overloadedTeachers`
   pass (same threshold; idle teachers never exceed T), so the gate's behavior is
   unchanged.
3. `getDashboardSummary` consumes the same `summarize` output.

### Route changes

`dashboard.tsx` loader calls only `getDashboardSummary` (one read, per the project's
loader paradigm). `getActiveOrganization` is dropped from this route. The route file is
split into small presentational components under `src/components/dashboard/`:
`StatCard`, `StatusStrip`, `CoveragePanel`, `TeacherLoadPanel`, `CurriculumPanel`.
Reuse `Badge`, `Card`, `Table`. Add a tiny `relativeTime(date)` helper to
`src/lib/utils.ts` (pure formatter, client-safe) for "generated 2d ago".

## Empty / degraded states

- **No active term:** stat cards show the org catalog counts (Classes 0, Slots/week —),
  and a prompt strip — "No active term — set one up to start timetabling" → `/terms`.
  (The header already provides _Continue setup_.)
- **Active term, panels empty:** each panel renders its own "add …" hint linking to the
  relevant setup page.

## Non-goals

- Not a setup wizard — onboarding owns that.
- Read-only — no mutations, no publish toggles on this page.
- No change to the term-level publish model.

## Testing

- `pnpm test` stays green — the refactor preserves `computeReadiness`'s blocker strings
  verbatim (covered indirectly by existing solver/export tests; add a focused assertion
  if a readiness test does not already exist).
- Add a unit test for `summarize(loaded)` covering ready / short / over / missing-teacher
  classes and overloaded / full / idle teachers.
- db-leak curl check on `dashboard.ts` (command above) returns empty.
- Browser-verify (Playwright) hydration and that all panels render against `make fresh`
  demo data — SSR HTML alone is insufficient.

## Files touched

- `src/lib/server/coverage.ts` — **new** pure `summarize` + `ClassCoverage` /
  `TeacherCoverage` / `SummarizeInput` types (db-free, unit-testable).
- `src/lib/server/coverage.test.ts` — **new** unit tests for `summarize`.
- `src/lib/server/dashboard.ts` — **new** (`getDashboardSummary`).
- `src/lib/server/timetable-data.ts` — rewrite `computeReadiness` to derive from
  `summarize`.
- `src/routes/_authed/_app/dashboard.tsx` — rewrite.
- `src/components/dashboard/*` — **new** presentational components.
- `src/lib/utils.ts` — `relativeTime` helper.
