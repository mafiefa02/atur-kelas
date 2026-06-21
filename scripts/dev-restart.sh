#!/usr/bin/env bash
#
# dev-restart.sh — fresh-start the local dev environment.
#
# Kills any running dev server, wipes the database and re-applies all migrations
# from scratch, optionally seeds the demo school, then starts the dev server.
#
# Usage:
#   ./scripts/dev-restart.sh            reset the DB, then start the dev server
#   ./scripts/dev-restart.sh --seed     also seed the demo school before starting
#   ./scripts/dev-restart.sh --help
#
# Equivalent make targets: `make restart` and `make restart-seed`.

set -euo pipefail

# Always run from the repo root so pnpm / docker compose resolve correctly,
# regardless of where the script is invoked from.
cd "$(dirname "$0")/.."

PNPM="${PNPM:-pnpm}"
COMPOSE="${COMPOSE:-docker compose}"
SEED=0

say() { printf '\033[36m▶ %s\033[0m\n' "$1"; }

usage() {
	sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
	exit "${1:-0}"
}

while [ $# -gt 0 ]; do
	case "$1" in
		-s | --seed) SEED=1 ;;
		-h | --help) usage 0 ;;
		*)
			echo "Unknown argument: $1" >&2
			usage 1 >&2
			;;
	esac
	shift
done

# The DB tooling (drizzle-kit, the seed script) reads DATABASE_URL from .env.local.
if [ ! -f .env.local ]; then
	echo "✗ .env.local is missing — run 'make setup' first." >&2
	exit 1
fi

# 1. Kill any running dev server (delegated to the standalone stop script, so
#    the kill logic lives in one place — `make stop` runs the same thing).
./scripts/dev-stop.sh

# 2. Reset the database from scratch (destroys the data volume).
say "Resetting the database from scratch…"
$COMPOSE down -v
$COMPOSE up -d --wait
$PNPM db:migrate

# 3. Optionally seed the demo school.
if [ "$SEED" -eq 1 ]; then
	say "Seeding demo data…"
	$PNPM db:seed
	echo "  login: admin@sekolah.test / password123"
fi

# 4. Start the dev server (replaces this process so Ctrl-C stops it cleanly).
say "Starting the dev server…"
exec $PNPM dev
