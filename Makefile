# atur-kelas dev environment
#
# Common entry points:
#   make setup   first-time setup (env file, deps, database, migrations)
#   make reset   wipe the database and re-apply all migrations
#   make dev     start the dev server
#
# Run `make` or `make help` to see everything.

PNPM    ?= pnpm
COMPOSE ?= docker compose

.DEFAULT_GOAL := help

.PHONY: help setup env install dev stop restart restart-seed \
        db-up db-down migrate generate studio seed \
        reset fresh clean rebuild

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

## --- Setup ---------------------------------------------------------------

setup: env install db-up migrate ## First-time setup: env file, deps, database, migrations
	@echo ""
	@echo "✅ Dev environment ready. Run 'make dev' to start the app."

env: ## Create .env.local from .env.example (generates a secret) if it is missing
	@if [ -f .env.local ]; then \
		echo ".env.local already exists — leaving it untouched."; \
	else \
		secret=$$(openssl rand -base64 32); \
		sed "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$$secret|" .env.example > .env.local; \
		echo "Created .env.local with a generated BETTER_AUTH_SECRET."; \
	fi

install: ## Install dependencies with pnpm
	$(PNPM) install

## --- Database ------------------------------------------------------------

db-up: ## Start Postgres and wait until it is healthy
	$(COMPOSE) up -d --wait

db-down: ## Stop Postgres (keeps the data volume)
	$(COMPOSE) down

migrate: ## Apply pending Drizzle migrations
	$(PNPM) db:migrate

generate: ## Generate a new Drizzle migration from schema changes
	$(PNPM) db:generate

studio: ## Open Drizzle Studio
	$(PNPM) db:studio

seed: ## Seed one ready-to-use demo school (login: admin@sekolah.test / password123)
	$(PNPM) db:seed

## --- Reset / cleanup -----------------------------------------------------

reset: ## Wipe the database volume and re-apply all migrations (destructive)
	$(COMPOSE) down -v
	$(COMPOSE) up -d --wait
	$(PNPM) db:migrate
	@echo ""
	@echo "✅ Database reset and migrated from scratch."

fresh: reset seed ## Reset the database and seed demo data (destructive)
	@echo ""
	@echo "✅ Fresh database with demo data. Login: admin@sekolah.test / password123"

clean: ## Remove installed deps and build artifacts
	rm -rf node_modules .output .nitro dist dist-ssr

rebuild: clean setup ## Nuke everything (deps + db) and run a fresh setup

## --- Run -----------------------------------------------------------------

dev: ## Start the dev server
	$(PNPM) dev

stop: ## Stop the running dev server (kills whatever holds port 3000)
	./scripts/dev-stop.sh

restart: ## Kill the dev server, reset the DB from scratch, then start the dev server
	./scripts/dev-restart.sh

restart-seed: ## Like restart, but also seed demo data before starting (destructive)
	./scripts/dev-restart.sh --seed
