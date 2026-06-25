BACKEND_DIR := backend
FRONTEND_DIR := frontend
VENV := $(BACKEND_DIR)/.venv
PIP := $(VENV)/bin/pip
PYTHON := $(VENV)/bin/python
FLASK := FLASK_APP=$(BACKEND_DIR)/run.py $(PYTHON) -m flask
CELERY := $(VENV)/bin/celery
NPM := npm

.PHONY: help
help:
	@echo 'Usage: make <target>'
	@echo ''
	@echo 'Setup'
	@echo '  venv           Create Python virtualenv'
	@echo '  pip-install    Install Python dependencies'
	@echo '  backend-setup  venv + pip-install + .env + db-create'
	@echo '  frontend-setup npm install + .env'
	@echo '  db-create      Create PostgreSQL database media_server'
	@echo '  ollama-pull    Pull default Ollama vision model'
	@echo ''
	@echo 'Database Migrations'
	@echo '  db-migrate     Generate a new migration (msg=description)'
	@echo '  db-upgrade     Apply pending migrations'
	@echo '  db-downgrade   Rollback one migration'
	@echo '  db-current     Show current revision'
	@echo '  db-history     Show full migration history'
	@echo '  db-stamp       Stamp DB at a given revision (rev=xxxx)'
	@echo ''
	@echo 'Development Servers'
	@echo '  backend        Start Flask dev server on :5000'
	@echo '  frontend       Start Vite dev server on :5173'
	@echo '  celery         Start all-queues Celery worker'
	@echo '  celery-import  Start import_queue worker only'
	@echo '  celery-meta    Start metadata queue worker only'
	@echo '  celery-ai      Start ai_metadata queue worker only'
	@echo '  celery-thumb   Start thumbnail queue worker only'
	@echo '  flower         Start Celery monitoring UI on :5555'
	@echo ''
	@echo 'Testing'
	@echo '  test           Run backend pytest suite'
	@echo '  lint           Run frontend ESLint'
	@echo ''
	@echo 'Build'
	@echo '  build          Build frontend for production'
	@echo '  preview        Preview production frontend build'
	@echo ''
	@echo 'Utility'
	@echo '  celery-purge   Purge all pending Celery tasks'

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

.PHONY: venv
venv:
	$(PYTHON) -m venv $(VENV)

.PHONY: pip-install
pip-install: venv
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt

.PHONY: backend-env
backend-env:
	cp -n $(BACKEND_DIR)/.env.example $(BACKEND_DIR)/.env || true
	@echo 'Edit $(BACKEND_DIR)/.env with your credentials if needed'

.PHONY: db-create
db-create:
	createdb media_server 2>/dev/null || psql -c "CREATE DATABASE media_server;" 2>/dev/null || echo 'Database media_server may already exist — skipping'

.PHONY: backend-setup
backend-setup: pip-install backend-env db-create
	$(FLASK) db upgrade
	@echo 'Backend ready'

.PHONY: frontend-setup
frontend-setup:
	cp -n $(FRONTEND_DIR)/.env.example $(FRONTEND_DIR)/.env || true
	$(NPM) --prefix $(FRONTEND_DIR) install
	@echo 'Frontend ready'

.PHONY: ollama-pull
ollama-pull:
	ollama pull llava

# ──────────────────────────────────────────────
# Database Migrations
# ──────────────────────────────────────────────

.PHONY: db-migrate
db-migrate:
	$(FLASK) db migrate -m "$(msg)"

.PHONY: db-upgrade
db-upgrade:
	$(FLASK) db upgrade

.PHONY: db-downgrade
db-downgrade:
	$(FLASK) db downgrade

.PHONY: db-current
db-current:
	$(FLASK) db current

.PHONY: db-history
db-history:
	$(FLASK) db history

.PHONY: db-stamp
db-stamp:
	$(FLASK) db stamp $(rev)

# ──────────────────────────────────────────────
# Development Servers
# ──────────────────────────────────────────────

.PHONY: backend
backend:
	$(PYTHON) $(BACKEND_DIR)/run.py

.PHONY: frontend
frontend:
	$(NPM) --prefix $(FRONTEND_DIR) run dev

.PHONY: celery
celery:
	$(CELERY) -A app.tasks.celery worker -Q celery,metadata,ai_metadata,thumbnail -l info

.PHONY: celery-import
celery-import:
	$(CELERY) -A app.tasks.celery worker -Q import_queue -l info --concurrency=1

.PHONY: celery-meta
celery-meta:
	$(CELERY) -A app.tasks.celery worker -Q metadata -l info --concurrency=10

.PHONY: celery-ai
celery-ai:
	$(CELERY) -A app.tasks.celery worker -Q ai_metadata -l info --concurrency=2

.PHONY: celery-thumb
celery-thumb:
	$(CELERY) -A app.tasks.celery worker -Q thumbnail -l info --concurrency=10

.PHONY: flower
flower:
	$(CELERY) -A app.tasks.celery flower --port=5555

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

.PHONY: test
test:
	$(PYTHON) -m pytest $(BACKEND_DIR)/tests/

.PHONY: lint
lint:
	$(NPM) --prefix $(FRONTEND_DIR) run lint

# ──────────────────────────────────────────────
# Build
# ──────────────────────────────────────────────

.PHONY: build
build:
	$(NPM) --prefix $(FRONTEND_DIR) run build

.PHONY: preview
preview:
	$(NPM) --prefix $(FRONTEND_DIR) run preview

# ──────────────────────────────────────────────
# Utility
# ──────────────────────────────────────────────

.PHONY: celery-purge
celery-purge:
	$(CELERY) -A app.tasks.celery purge
