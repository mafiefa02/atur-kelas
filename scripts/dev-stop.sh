#!/usr/bin/env bash
#
# dev-stop.sh — stop the local dev server.
#
# Kills whatever process is holding the dev port (the vite dev server and any
# children): a graceful TERM first, then a forced KILL for anything still alive.
# No-op when nothing is listening.
#
# Usage:
#   ./scripts/dev-stop.sh            stop the dev server on port 3000
#   DEV_PORT=4000 ./scripts/dev-stop.sh
#   ./scripts/dev-stop.sh --help
#
# Equivalent make target: `make stop`.

set -euo pipefail

DEV_PORT="${DEV_PORT:-3000}"

say() { printf '\033[36m▶ %s\033[0m\n' "$1"; }

case "${1:-}" in
	-h | --help)
		sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'
		exit 0
		;;
	"") ;;
	*)
		echo "Unknown argument: $1" >&2
		exit 1
		;;
esac

say "Stopping any dev server on port ${DEV_PORT}…"
pids=$(lsof -ti "tcp:${DEV_PORT}" || true)
if [ -n "$pids" ]; then
	# shellcheck disable=SC2086 # word-splitting is intended: one or more PIDs.
	kill $pids 2>/dev/null || true
	sleep 1
	# Force down anything that ignored the graceful TERM.
	stubborn=$(lsof -ti "tcp:${DEV_PORT}" || true)
	# shellcheck disable=SC2086
	[ -n "$stubborn" ] && kill -9 $stubborn 2>/dev/null || true
	echo "  stopped (pids: $pids)"
else
	echo "  nothing was listening."
fi
