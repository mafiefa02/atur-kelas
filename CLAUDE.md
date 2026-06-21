# CLAUDE.md

Guidance for agents working in this repo. Keep changes consistent with these
conventions. Full design rationale lives in `docs/timetabling-design.md`; domain glossary
in `CONTEXT.md`; scope decisions in `docs/adr/`.

## What this is

**atur-kelas** — a multi-tenant SaaS that auto-generates the weekly **intrakurikuler**
timetable (_jadwal pelajaran_) for Indonesian schools under **Kurikulum Merdeka**, for the
fixed-rombel jenjang **SD / SMP / SMA kelas X**. One school = one Better Auth
**organization**; nearly all data is scoped to the organization's **active term**
(= one semester).

Out of scope (see `docs/adr/0001`): **kokurikuler / P5** and **ekstrakurikuler** (run off
the weekly jadwal), and **SMA kelas XI–XII mata pelajaran pilihan** (moving-class — breaks
the König-tractable model). Known pre-existing limitation: **Pendidikan Agama** that splits
by religion (parallel teachers in one rombel-slot) can't be represented by the
one-subject-per-cell grid.

## Stack

TanStack Start (React 19) + Vite 8 + Nitro · Postgres + Drizzle (drizzle-kit) ·
Better Auth (email/password + organization plugin) · Tailwind v4 + shadcn (Base UI) +
Phosphor icons · Vitest · oxlint + oxfmt · React Compiler (babel plugin).

## Commands

- `make dev` — dev server at http://localhost:3000
- `make stop` — stop the running dev server (frees port 3000)
- `make restart` — stop the dev server, reset the DB from scratch, then start dev
  (`make restart-seed` also seeds the demo school)
- `make fresh` — reset DB + seed demo school (`admin@sekolah.test` / `password123`)
- `make seed` / `make reset` / `make db-up` / `make studio`
- `pnpm db:generate` then `pnpm db:migrate` — after schema changes
- `pnpm generate-routes` — after adding/moving route files
- `pnpm test` · `pnpm lint` · `pnpm fmt`

## Architecture & conventions

### Data flow — one paradigm

All DB access is in **server functions** (`createServerFn`) under `src/lib/server/*`.
Reads: a route `loader` calls a GET server fn. Writes: a POST server fn, then
`router.invalidate()` in the component. Do **not** introduce react-query mutation hooks.

### ⚠️ Server-fn modules must not leak `db` into the client bundle

A server-fn module imported by a client route is rewritten to RPC stubs — **but
module-level declarations (helper functions/types) and their imports survive in the
client bundle.** If a top-level helper imports `db` (→ `postgres` → `Buffer`), the
browser throws `Buffer is not defined` and **hydration silently breaks app-wide** (pages
still SSR fine, but nothing is interactive).

Rules:

- A file with `createServerFn` exports imported by client routes should contain **only**
  the server fns; keep all `db` use **inside** handlers.
- Put shared server-only helpers in a separate `*-data.ts` module imported **only inside
  handlers** (see `src/lib/server/timetable.ts` + `timetable-data.ts`).
- Verify: `curl localhost:3000/src/lib/server/<mod>.ts | grep '^import' | grep -E '/lib/db|drizzle'`
  must be empty.

### Multi-tenancy & security

- Every server fn re-derives the org from the session via `requireOrgContext()` /
  `requireActiveTerm()` (`src/lib/server/context.ts`). **Never** accept an
  `organizationId`/`termId` from the client for scoping — that's an IDOR. Scope every
  query and mutation by the session-derived org.
- `/p/<token>` is the only unauthenticated route. The share token is the capability; it
  returns only that class's published snapshot — no org or other-class data.

### Database

- Schema split: `src/lib/db/schema/auth.ts` is **generated** by the Better Auth CLI
  (`pnpm auth:generate`) — don't hand-edit it; `app.ts` is the domain schema.
- Change schema → `pnpm db:generate` → `pnpm db:migrate`. Migrations in `drizzle/` are
  committed. Never edit the DB by hand.
- Env is loaded from `.env.local` via `process.loadEnvFile` in `src/lib/env.ts`
  (server-only — never import `env.ts` or `db` from client code).

### Domain model (active-term scoped)

- `term` (one active per org, DB-enforced via partial unique index) → bell schedule,
  classes, curriculum (per grade), assignments (per class).
- **Bell schedule** is a JSON `config` (period length + per-day window + breaks);
  teaching slots are **derived** via `computeDaySlots` in `src/lib/schedule.ts`, not
  stored.
- **Generator**: `src/lib/solver.ts` is pure (no db) — matching-based bipartite
  edge-coloring, guaranteed/fast, plus a within-class-swap pass for soft goals.
  `timetable` + `placement` hold the generated grid. **Publish** writes a denormalized
  `publishedSnapshot` (point-in-time) that the public page reads.
- Feasibility before generating: each class's assigned hours must equal the weekly slot
  count, every curriculum subject must have a teacher, and no teacher's load may exceed
  the slot count.

### UI

- Add components with the shadcn CLI (`pnpm dlx shadcn@latest add <name>`) — **don't
  hand-roll** them. They are Base UI-based, not Radix.
- **Verify interactivity in a real browser** (Playwright is installed). SSR HTML can
  render perfectly while client hydration is broken, so curl/SSR checks are not enough.
  When grepping SSR HTML: React splits dynamic text with `<!-- -->`, escapes entities
  (e.g. `&#x27;` for `'`), and files may be classified binary — strip markers and/or use
  `grep -a`.

## Commits

Use Conventional Commits (`feat:`, `fix:`, `chore:`, …). The pre-commit hook runs
lint-staged (oxlint --fix + oxfmt) and a full `vite build` that **aborts the commit on
failure** — make sure the build passes.
