# Getting Started

This guide covers setting up the Media Server on a **new machine** — from zero to fully running with both manual (development) and Docker (production) approaches. For a condensed quick start, see the [README](../README.md#quick-start).

## Prerequisites

Install these before proceeding:

| Dependency | Version | Required For | Check Command |
|------------|---------|-------------|---------------|
| Python | 3.10+ | Backend (Flask) | `python3 --version` |
| Node.js | 18+ | Frontend (Vite/React) | `node --version` |
| PostgreSQL | 14+ | Database | `psql --version` |
| Redis | 6+ | Celery broker + cache | `redis-cli --version` |
| Ollama | latest | AI vision/text models | `ollama --version` |
| ImageMagick | 6+ | HEIC/HEIF conversion | `convert --version` |
| ffmpeg | 4+ | Video processing | `ffmpeg -version` |
| Git | — | Clone repository | `git --version` |
| Docker & Docker Compose | — | Containerized deployment (optional) | `docker compose version` |

**System packages (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm \
  postgresql postgresql-client redis-server \
  imagemagick ffmpeg libheif-dev libglib2.0-0 libsm6 libxext6 \
  libxrender-dev libgomp1 build-essential libpq-dev
```

**macOS (Homebrew):**
```bash
brew install python@3.12 node postgresql@16 redis imagemagick ffmpeg libheif
```

## Step 1: Clone & Prepare

```bash
git clone <repo-url> media-server
cd media-server
cp .env.example .env
```

## Step 2: Start Infrastructure

**Option A — Manual (development):**
```bash
# Start PostgreSQL (adjust based on your OS)
sudo systemctl start postgresql    # Linux
brew services start postgresql@16  # macOS

# Start Redis
sudo systemctl start redis-server  # Linux
brew services start redis          # macOS

# Create database (auto-skipped if exists)
make db-create
```

**Option B — Docker (recommended for isolation):**
```bash
docker compose -f docker-compose.infra.yml up -d
```

> **Verify**: `psql -U postgres -c '\l' | grep media_server` should show the database.  
> **Verify**: `redis-cli ping` should return `PONG`.

## Step 3: Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
flask db upgrade
```

> **Troubleshooting**:
> - `pip install` fails on `psycopg2` → Install `libpq-dev` (`sudo apt install libpq-dev`)
> - `pip install` fails on `pillow-heif` → Install `libheif-dev` (`sudo apt install libheif-dev`)
> - `pip install` fails on `opencv-python-headless` → Install `libglib2.0-0 libsm6 libxext6 libxrender-dev` (`sudo apt install ...`)
> - `pip install` fails on `onnxruntime` or `insightface` → Make sure `libgomp1` is installed (`sudo apt install libgomp1`)
> - `flask db upgrade` fails with "connection refused" → PostgreSQL is not running. Start it first.
> - `flask db upgrade` fails with "role 'postgres' does not exist" → Create the postgres role: `sudo -u postgres createuser -s $(whoami)` or switch to peer auth.
> - `flask db upgrade` fails with "database 'media_server' does not exist" → Run `make db-create` or `createdb media_server`.
> - `flask db upgrade` fails with "FATAL: password authentication failed" → Edit `backend/.env` and update `DATABASE_URL` with correct credentials.
> - `flask db upgrade` shows "Target database is not up to date" → Run `flask db stamp head` to stamp the current revision, then `flask db upgrade` again.
> - `flask db upgrade` fails after pulling new code → New migrations exist. Run `flask db upgrade` to apply them. If it errors, check for conflicting migrations or missing tables.
> - `.env` not found → Copy the example: `cp .env.example .env`. Without it, Flask defaults to SQLite (no Celery/AI).

## Step 4: Start Ollama (AI Features)

```bash
# Pull the vision model (required for AI metadata, ingredient scanner, etc.)
ollama pull llava

# Pull the text model (required for ingredient analysis)
ollama pull llama3.2

# Start Ollama (if not already running)
ollama serve
```

> **Troubleshooting**:
> - `ollama pull` fails with "connection refused" → Ollama is not running. Start it with `ollama serve`.
> - Vision model downloads are large (~4GB for llava). Ensure sufficient disk space and a stable connection.
> - AI features work without Ollama running (they fail gracefully with "failed" status), but the frontend won't populate AI metadata.

## Step 5: Celery Workers (Background Processing)

```bash
# From the backend directory (with venv activated)
celery -A app.tasks.celery worker -Q import_queue,metadata,ai_metadata,thumbnail,face_detection -l info --concurrency=1
```

For better performance, run separate workers per queue (recommended):
```bash
make celery-import   # concurrency=1
make celery-meta     # concurrency=10
make celery-ai       # concurrency=2
make celery-thumb    # concurrency=10
```

Alternatively, run all queues with a single worker:
```bash
make celery         # concurrency=1 fallback for all queues
```

> **Troubleshooting**:
> - Worker fails to connect to Redis → Redis is not running. Start it: `sudo systemctl start redis-server` or `redis-server`.
> - Worker fails with "Consumer: Cannot connect to amqp://guest:**@127.0.0.1:5672//" → You set `CELERY_BROKER_URL` to an AMQP URL instead of Redis. In `backend/.env`, set it to `redis://localhost:6379/0`.
> - Worker fails with "KeyError: 'import_queue'" → The queue names in your `.env` don't match the worker's `-Q` flag. Ensure `CELERY_QUEUE_IMPORT=import_queue` in `.env` and use `-Q import_queue`.
> - Worker starts but no tasks execute → The queue name in the worker's `-Q` flag doesn't match the task's `queue` argument. Check `backend/app/tasks.py` for the queue assignments.
> - Tasks fail silently → Check Celery logs with `celery -A app.tasks.celery worker ... -l debug` for detailed output.

## Step 6: Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

> **Troubleshooting**:
> - `npm install` fails → Node.js version is too old (<18). Update Node.js: `nvm install 18` or download from nodejs.org.
> - `npm install` fails on `tesseract.js` → Native build tools needed. Install `build-essential` on Linux or Xcode CLI tools on macOS.
> - `npm run dev` fails with "port 5173 already in use" → Kill the existing process or change the port in `vite.config.js`.
> - Frontend shows blank page with CORS errors → Backend `CORS_ORIGINS` in `.env` must include the frontend URL. Default is `http://localhost:5173`.
> - Frontend shows "Cannot proxy /api" → Backend is not running on port 5000. Start it with `python run.py` from the `backend/` directory.
> - Frontend proxies to wrong host → Edit `frontend/vite.config.js` or `frontend/.env`'s `VITE_API_BASE_URL`.

## Step 7: Verify Everything Works

```bash
# 1. Backend health check
curl http://localhost:5000/health
# Expected: {"status":"ok"}

# 2. API status
curl http://localhost:5000/api/status
# Expected: {"message":"API is running"}

# 3. Frontend
# Open http://localhost:5173 in a browser — the app should load

# 4. Import a test folder
curl -X POST http://localhost:5000/api/import \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/media/folder", "groups": ["image", "video"]}'
# Expected: {"message":"Import started","task_id":"..."}
```

## Docker Deployment (Alternative to Manual Setup)

For a fully containerized setup instead of steps 2–6:

```bash
# 1. Clone and configure
cd media-server
cp .env.example .env

# 2. Start everything (9 containers)
docker compose up --build -d

# Or start infrastructure separately:
docker compose -f docker-compose.infra.yml up -d
docker compose up --build -d
```

> **Troubleshooting (Docker)**:
> - Docker build fails on `pip install` → Docker daemon can't reach PyPI. Check your network/DNS. Docker face worker uses `8.8.8.8` as DNS fallback.
> - Docker build fails on `apt-get install libheif-dev` → Your Docker base image is outdated. Run `docker pull python:3.12-slim`.
> - Container exits immediately → Run `docker compose logs <service>` to see the error. Common: database connection refused (PG not ready yet), port already in use, volume permissions.
> - Port conflicts → Change host port mappings in `docker-compose.yml` (e.g., `"15020:5000"` → `"15021:5000"`).
> - Face detection doesn't work in Docker → Ensure the InsightFace model is mounted: `~/.insightface:/root/.insightface`. First run `docker compose run worker-face python -c "from app.utility.face_utility import _get_face_app; _get_face_app()"` to download the model.
> - Video processing fails → ffmpeg is installed in the backend container. If using manual setup, ensure `ffmpeg` is on your `PATH`.
> - Ollama API errors from workers → Workers connect to `http://host.docker.internal:11434` or the Ollama container directly. Check `OLLAMA_BASE_URL` in the compose file.
> - "no space left on device" → Clean up Docker: `docker system prune -a`. Ensure volumes have enough space on the host.
> - SSL certificate errors → First-time setup generates self-signed certs. Your browser will warn about insecure connection — proceed anyway, or install the generated `ca.crt` from the frontend web root.

## Common Failure Scenarios

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `flask: command not found` | Virtualenv not activated | `source backend/.venv/bin/activate` |
| `ModuleNotFoundError: No module named 'flask'` | Dependencies not installed | `pip install -r backend/requirements.txt` |
| Backend starts but all requests return 500 | Database connection failed | Check `DATABASE_URL` in `.env`, ensure PostgreSQL is running |
| `sqlalchemy.exc.OperationalError: (psycopg2.OperationalError)` | PostgreSQL not running or wrong credentials | Verify DB: `psql -U postgres -d media_server -c 'SELECT 1'` |
| Frontend loads but API calls return 502 | Backend unreachable | Check if Flask is running on port 5000: `curl http://localhost:5000/health` |
| Image thumbnails not generating | ffmpeg or Pillow issue | Run `ffmpeg -version`; check Celery thumbnail worker logs |
| Face detection returns no faces | Low confidence threshold or model not downloaded | Set `FACE_DET_THRESH=0.3` in `.env`; run face detection script once to download InsightFace model |
| Import shows 0 files | Wrong MIME group or empty folder | Verify files exist at the path: `ls /path/to/folder`; try groups `["image", "video", "audio", "document"]` |
| Upload fails with 413 | Nginx/client_max_body_size too small | Docker: already 500MB in nginx.conf. Manual: check your reverse proxy limits |
| Video won't play in browser | Codec not supported | MP4 with H.264 is safest. Use the export endpoint to re-encode. |
| Celery tasks stuck in "pending" | Redis not running or wrong broker URL | `redis-cli ping` should return PONG. Check `CELERY_BROKER_URL` in `.env`. |
| AI description always returns "failed" | Ollama not running or model not pulled | `ollama list` should show `llava`. Check `OLLAMA_BASE_URL` in `.env`. |
| `make db-upgrade` shows "No changes detected" | Alembic cannot detect schema changes | This is normal if no new migrations exist. Check with `flask db current`. |
| `make db-upgrade` fails with "Multiple head revisions" | Migration conflict after merge | Resolve by running `flask db merge heads` or dropping and recreating the database. |
| `.env` variables not taking effect | dotenv not loaded | The app loads `.env` from the backend directory. Make sure `backend/.env` exists (not just `.env`). |

## Directory Requirements

The app needs these directories to exist and be writable:

| Path | Env Var | Purpose | Created Automatically? |
|------|---------|---------|----------------------|
| `~/media-server-edited` | `EDITED_IMAGES_DIR` | Stores edited/cropped images | Yes (on first edit) |
| `/uploads` (or `UPLOAD_DIR`) | `UPLOAD_DIR` | Upload storage | No — create it manually |
| `/media` (or `MEDIA_PATH`) | — | Source media files (read-only) | No — must exist with your media |

```bash
mkdir -p ~/media-server-edited /uploads
```
