# atur-kelas

Automatic weekly timetable generator for schools. Set up your terms, subjects,
teachers, classes, and bell schedule, then generate a clash-free _jadwal pelajaran_
in milliseconds — tweak it, publish it, and share read-only links with students and
parents.

Built for the K-12 model (Indonesian SMP/SMA): students stay in a class, teachers
rotate between them, and teachers are shared across classes — which makes scheduling a
genuine constraint-satisfaction problem, not a simple grid fill.

## Features

- **Multi-tenant** — each school is its own organization (email/password auth).
- **Setup** — terms, grade levels, subjects, teachers, a per-term bell schedule
  (daily hours + breaks → auto-derived periods), classes, per-grade curriculum with a
  **live feasibility check**, and per-class teacher assignments.
- **Generator** — a matching-based solver produces a clash-free, fully-packed
  timetable; regenerate / try-again for a different layout, click-to-swap editing,
  pin lessons, then publish.
- **Public share links** — a read-only per-class timetable at `/p/<token>` (no login),
  e.g. to drop in a class WhatsApp group.
- **Export** — print / save-as-PDF, and CSV download.

Full design notes and decisions: [`docs/timetabling-design.md`](docs/timetabling-design.md).

## Tech stack

TanStack Start (React 19) · Postgres + Drizzle ORM · Better Auth (organization plugin)
· Tailwind v4 with shadcn (Base UI) · Vitest · oxlint + oxfmt.

## Quick start

Prerequisites: **Node 20+**, **pnpm**, and **Docker** (for local Postgres).

```bash
make setup     # create .env.local, install deps, start Postgres, run migrations
make fresh     # (optional) reset the DB and seed a ready-to-use demo school
make dev       # start the app at http://localhost:3000
```

Demo login (after `make fresh` or `make seed`):

- **Email:** `admin@sekolah.test`
- **Password:** `password123`

The demo school comes fully configured, so you can go straight to **Timetable →
Generate** and explore editing, publishing, and share links.

## Common commands

| Command                  | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `make dev`               | Start the dev server                             |
| `make stop`              | Stop the running dev server (frees port 3000)    |
| `make restart`           | Stop the dev server, reset the DB, then start it |
| `make restart-seed`      | Like `make restart`, but also seed demo data     |
| `make fresh`             | Reset the database and seed demo data            |
| `make seed`              | Seed the demo school                             |
| `make reset`             | Wipe the database volume and re-apply migrations |
| `make db-up` / `db-down` | Start / stop the Postgres container              |
| `make studio`            | Open Drizzle Studio                              |
| `pnpm test`              | Run tests (Vitest)                               |
| `pnpm lint`              | Lint (oxlint)                                    |
| `pnpm generate-routes`   | Regenerate the route tree after adding routes    |

Run `make` (or `make help`) to see everything.

## Project layout

```
src/
  routes/              TanStack file-based routes
    _authed/_app/      authenticated app (sidebar shell): setup + timetable + share
    p/$token.tsx       public per-class timetable (no auth)
  lib/
    server/            server functions — all DB access lives here
    solver.ts          the timetable solver (pure, matching-based edge-coloring)
    schedule.ts        bell-schedule config + slot derivation
    db/                Drizzle client + schema (auth.ts generated, app.ts domain)
  scripts/seed.ts      dev seed
scripts/               dev-env shell helpers (stop / restart the local stack)
drizzle/               SQL migrations (committed)
docs/                  design notes
```

## Development notes

- **Schema changes:** edit `src/lib/db/schema/`, then `pnpm db:generate` and
  `pnpm db:migrate`. Never edit the database by hand.
- **Environment:** `DATABASE_URL` and `BETTER_AUTH_SECRET` live in `.env.local`
  (see `.env.example`). `make env` generates a secret for you.
- Commits use [Conventional Commits](https://www.conventionalcommits.org/); the
  pre-commit hook formats, lints, and runs a production build.

See [`CLAUDE.md`](CLAUDE.md) for architecture conventions and gotchas.
