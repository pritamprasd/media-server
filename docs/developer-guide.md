# Developer Guide

## Makefile Targets (30+)

The project provides a comprehensive Makefile for common development tasks.

### Setup
| Target | Description |
|--------|-------------|
| `make venv` | Create Python virtualenv |
| `make pip-install` | Install Python dependencies |
| `make backend-env` | Copy .env.example to .env |
| `make db-create` | Create PostgreSQL database `media_server` |
| `make backend-setup` | Full backend setup (venv + pip + .env + db + migrations) |
| `make frontend-setup` | Frontend setup (npm install + .env) |
| `make ollama-pull` | Pull default Ollama vision model (`llava`) |

### Database Migrations
| Target | Description |
|--------|-------------|
| `make db-migrate "msg"` | Generate new migration |
| `make db-upgrade` | Apply pending migrations |
| `make db-downgrade` | Rollback one migration |
| `make db-current` | Show current migration revision |
| `make db-history` | Show full migration history |
| `make db-stamp rev=xxxx` | Stamp DB at a specific revision |

### Development Servers
| Target | Description |
|--------|-------------|
| `make backend` | Start Flask dev server on :5000 |
| `make frontend` | Start Vite dev server on :5173 |
| `make celery` | Start all-queues Celery worker |
| `make celery-import` | Start import_queue worker (concurrency=1) |
| `make celery-meta` | Start metadata worker (concurrency=10) |
| `make celery-ai` | Start ai_metadata worker (concurrency=2) |
| `make celery-thumb` | Start thumbnail worker (concurrency=10) |
| `make flower` | Start Celery Flower monitoring on :5555 |

### Testing & Build
| Target | Description |
|--------|-------------|
| `make test` | Run backend pytest suite (`tests/test_api.py` + `tests/unit/`) |
| `make lint` | Run frontend ESLint |
| `make build` | Build frontend for production |
| `make preview` | Preview production frontend build |

### Docker
| Target | Description |
|--------|-------------|
| `make restart` | Interactive menu to rebuild/restart a single Docker service |
| `make logs` | Interactive menu to tail logs for a Docker service |

### Utility
| Target | Description |
|--------|-------------|
| `make celery-purge` | Purge all pending Celery tasks |

## Scripts

- **`backend/scripts/regenerate_heic_thumbnails.py`** — Standalone script to regenerate thumbnails for all HEIC/HEIF files in the database. Run via `python scripts/regenerate_heic_thumbnails.py` or `docker compose exec backend python scripts/regenerate_heic_thumbnails.py`.
- **`scripts/docker-restart`** — Python script for rebuilding and restarting a single Docker Compose service with spinner animation and colored output.
- **`frontend/entrypoint.sh`** — Container entrypoint that generates self-signed SSL certs and configures nginx.

## Queue Name Configuration

Celery queue names are dynamically read from `backend/.env` at build time. Configurable via environment variables:
- `CELERY_QUEUE_IMPORT` (default: `import_queue`)
- `CELERY_QUEUE_METADATA` (default: `metadata`)
- `CELERY_QUEUE_AI` (default: `ai_metadata`)
- `CELERY_QUEUE_THUMBNAIL` (default: `thumbnail`)
- `CELERY_QUEUE_FACE` (default: `face_queue`)

## Docker Commands

```bash
docker compose up -d                          # Start all services
docker compose -f docker-compose.infra.yml up -d  # Start infra (PG + Redis)
docker compose -f docker-compose.workers.yml up -d  # Combined worker
docker compose exec backend python scripts/regenerate_heic_thumbnails.py  # Run script
```

## Code Quality

- **Backend**: `pytest` with in-memory SQLite for fast tests
- **Frontend**: ESLint + Prettier for consistent code style
- **Pre-commit**: No pre-commit hooks configured

## Troubleshooting

- **Database already exists**: `make db-create` is idempotent — it silently skips if the database exists
- **Face worker DNS**: Docker face worker uses `8.8.8.8` as DNS fallback for network stability
- **HEIC support**: Requires `libheif-dev` (Debian) and `pillow-heif` Python package
- **`.env` variables not taking effect**: dotenv loads `.env` from the backend directory — make sure `backend/.env` exists (not just root `.env`).

See [docs/getting-started.md](getting-started.md) for the full troubleshooting matrix.
