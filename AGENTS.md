# AGENTS.md - Media Server Repository

## Quick Setup
- `make backend-setup` - Complete backend setup (venv + pip install + migrations)
- `make frontend-setup` - Frontend setup and dependencies
- `make ollama-pull` - Pull default vision model (llava)
- `make db-current` - Check current database migration

## Development Workflow
- Start all services: `make backend` (Flask) + `make frontend` (Vite)
- Run Celery workers in parallel: `make celery-import`, `make celery-meta`, `make celery-ai`, `make celery-thumb`
- Backend runs on port 5000, frontend on 5173 (proxies `/api`)

## Database Operations
- `make db-migrate "description"` - Generate new migration
- `make db-upgrade` - Apply pending migrations
- `make db-downgrade` - Rollback one migration
- Run `flask db current` (in backend) to check

## Testing
- `make test` - Run backend pytest suite
- `make lint` - Run frontend ESLint
- Backend tests: `pytest backend/tests/` uses in-memory SQLite during testing

## Key Packages & Entrypoints
- **Backend**: `backend/run.py` (Flask app), `backend/app/__init__.py` (app factory)
- **Frontend**: `frontend/src/main.jsx` (React entry), `frontend/vite.config.js`
- **API Routes**: `backend/app/api/routes.py` (50+ endpoints), `backend/app/api/face_routes.py`
- **Celery Tasks**: `backend/app/tasks.py` (5 workers: import, metadata, AI, thumbnail, face)

## Critical Path Dependencies
- PostgreSQL for backend + Redis for Celery
- Ollama server with vision model (llava) for AI features
- `/media` directory or `MEDIA_PATH` env var must exist
- `UPLOAD_DIR` (~/media-server-edited) needs write permissions

## Configuration Files
- `backend/.env` - Core backend env vars
- `frontend/.env` - Frontend env vars
- `docker-compose.yml` - All 9 services
- `backend/.venv/` - Virtual environment, must run tests from here

## Docker vs Manual Setup
- **Docker**: `docker compose up --build -d` - All services with persistent volumes
- **Manual**: Start backend (Flask) + frontend (Vite) + individual Celery workers
- All expose: backend:5000, frontend:80/443, Flower:5555

## Test Setup
- Backend tests use `create_app(testing=True)` - in-memory SQLite
- Production uses PostgreSQL (from docker-compose.infra.yml or host)
- Redis essential for Celery workers
- Need Ollama with model for `regenerate-ai` endpoint tests

## Concurrency Notes
- Celery workers have different `concurrency` settings:
  - `make celery-import`: 1 (import_queue)
  - `make celery-meta`: 10 (metadata)
  - `make celery-ai`: 2 (ai_metadata)
  - `make celery-thumb`: 10 (thumbnail)
  - `make celery`: 1 (celery queue fallback)

## Face Worker Quirk
- Requires InsightFace model volume mounted from host (`/home/pritam/.insightface`)
- Set `FACE_DET_THRESH=0.3` and `FACE_MATCH_THRESHOLD=0.4` in .env
- Use DNS fallback 8.8.8.8 in dockerface worker

## File Structure
- `backend/` - Flask API + 5 Celery workers
- `frontend/` - React Vite frontend
- Shared via Docker network: frontend proxies `/api/*` to backend:5000

## Major Optimization Notes
- Video trim-only: `make CELERY_QUEUE_METADATA=metadata -l info --concurrency=10` maximizes metadata queue
- HEIC support: pillow-heif + ImageMagick with HEIF support required
- AI pipeline: Ollama vision model runs in separate `ai_metadata` worker
- Offline PWA: Service worker caches shell/API/media/map tiles for offline access

## Production Deployment
- Nginx reverse proxy with HTTPS, HTTP/2 support
- Auto-generated SSL certificates at build time
- Separate containers for each Celery queue for scalability
- All edits go to edited-images directory (~/media-server-edited)
