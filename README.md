# atur-kelas

Auto-generates the weekly **intrakurikuler** timetable (_jadwal pelajaran_) for Indonesian
schools under **Kurikulum Merdeka**. Set up a term, subjects, teachers, classes, and a bell
schedule, then generate a clash-free, fully-packed timetable in milliseconds — edit it,
publish it, and share read-only links with students and parents.

- **Live:** https://aturkelas.afiefabd.com — sign up to create your own school. (No demo account on production; to try the seeded demo school, run it locally — see below.)
- **Repo:** https://github.com/mafiefa02/atur-kelas

---

## What it is, and how to run it

A multi-tenant web app: one school is one account (organization). Inside its active term you
configure the inputs, the solver builds a valid weekly grid, and you publish a per-class
timetable behind a shareable link.

Prerequisites: **Node 20+**, **pnpm**, and **Docker** (for local Postgres).

```bash
make setup     # create .env.local, install deps, start Postgres, run migrations
make fresh     # reset the DB and seed a ready-to-use demo school
make dev       # start the app at http://localhost:3000
```

Demo login (local only, after `make fresh`): `admin@sekolah.test` / `password123`. The seeded
demo school is fully configured, so go straight to **Timetable → Generate** to try editing,
publishing, and share links. Production has no demo account — sign up to create your own school.
Run `make help` for every command.

## Who it's for, and the one job

For the person who builds the school timetable each semester — the _wakil kurikulum_ /
admin / TU staff. The one job it has to do well: turn a school's teachers, subjects, classes,
and hours into a **clash-free, fully-packed weekly jadwal** — no teacher double-booked, no
empty slot, every subject's weekly hours met — in seconds instead of days.

## Why this problem, and how I know it's worth solving

Indonesian schools build the jadwal by hand every semester, usually in a spreadsheet. It is a
genuine constraint puzzle: teachers are shared across classes, so a change in one class ripples
into clashes elsewhere, and mistakes are often found only after the term starts. The work is
universal (every school does it), recurring (every semester), and painful (days of manual
juggling) — that combination is what makes it worth automating.

## What's already out there, and why I built this anyway

Generic timetabling tools exist (aSc TimeTables, FET) but they are desktop-bound, complex to
configure, and not aware of Kurikulum Merdeka's term/rombel/alokasi-waktu model. The common
reality is still a hand-maintained spreadsheet. atur-kelas is web-based and multi-tenant,
modeled directly on the Indonesian domain, with a one-click generate, a live feasibility check
before you waste time, and public per-class share links — purpose-fit for this one job rather
than a general engine you have to bend into shape.

## In scope, out of scope, and why

**In scope:** the intrakurikuler weekly timetable for fixed-rombel **SD / SMP / SMA kelas X**;
the full flow of setup → feasibility check → generate → edit/pin/swap → publish → share/export.

**Out of scope (by decision, see `docs/adr/0001`):** kokurikuler / **P5** and
**ekstrakurikuler** — these run off the weekly jadwal, not inside it; and **SMA kelas XI–XII
mata pelajaran pilihan** (moving-class), which breaks the tractable scheduling model. **Known
limitation:** Pendidikan Agama that splits a class by religion (parallel teachers in one cell)
can't be represented by the one-subject-per-cell grid.

The reasoning: ship the one universal, tractable job well rather than a half-working everything.

## Where I didn't have answers — what I assumed

- Schools convert Kurikulum Merdeka's **annual** JP into constant **integer weekly** counts
  themselves; the app takes those weekly counts as given.
- Exactly **one active term (semester)** per school at a time.
- Teacher availability is the full week minus their total load — **no per-teacher
  unavailability windows** are modeled yet.
- The **bell schedule represents intrakurikuler time only**; a school excludes a fixed P5
  day/block by leaving it out of the schedule.
- One teacher per subject-per-class cell (the religion-split case above is not handled).

## Three questions I'd ask a real user before building more

1. When you build the jadwal today, what actually blocks you most — teacher availability
   windows, room/lab sharing, or fairness of the spread? (Decides what constraint to add next.)
2. How do you handle subjects that split a class into parallel groups, like Pendidikan Agama by
   religion?
3. Once it's generated, who has to see or approve it, and in what form — print, PDF, a share
   link, or an export into an existing system (Dapodik / school SIM)?

## How I'd know it's working, and what's next

**Working** = a school can set up a term and generate a valid (clash-free, fully-packed) jadwal
in one sitting, then publish and share it. The signals to watch: time-to-first-valid-timetable
and zero clashes in the published grid.

**Next:** per-teacher unavailability constraints, room/lab constraints, soft-preference tuning
(spread heavy subjects, avoid a subject twice in a day), cloning a term into the next semester,
and importing existing rosters.

---

## Tech stack

TanStack Start (React 19) · Postgres + Drizzle ORM · Better Auth (organization plugin) ·
Tailwind v4 with shadcn (Base UI) · Vitest · oxlint + oxfmt. The solver
(`src/lib/solver.ts`) is a pure, matching-based bipartite edge-coloring — fast and guaranteed
to produce a clash-free grid when the inputs are feasible.

See [`docs/timetabling-design.md`](docs/timetabling-design.md) for the full design,
[`CONTEXT.md`](CONTEXT.md) for the domain glossary, and [`CLAUDE.md`](CLAUDE.md) for
architecture conventions.
