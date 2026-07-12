# Configuration

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/media_server` | PostgreSQL connection string |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Redis broker for Celery task queue |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/0` | Redis result backend for Celery task status |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llava` | Vision model for AI image analysis |
| `OLLAMA_TEXT_MODEL` | `llama3.2` | Text model for non-vision AI tasks |
| `FACE_DET_THRESH` | `0.5` | Minimum confidence for InsightFace detection (range 0.0–1.0) |
| `FACE_MATCH_THRESHOLD` | `0.3` | Cosine-distance threshold for face-to-person matching (lower = stricter) |
| `FACE_PROVIDERS` | `CUDA,TensorRT,CPU` | ONNX Runtime execution providers (comma-separated, tried in order) |
| `FACE_BATCH_SIZE` | `5` | Images per face-detection Celery task |
| `HIDDEN_FILES_PIN` | `"000000"` | 6-digit PIN for hidden files access |
| `EDITED_IMAGES_DIR` | `~/media-server-edited` | Where edited/cropped images are saved |
| `IMPORT_DEFAULT_PATH` | `~` | Default directory for import-from-folder dialog |
| `UPLOAD_DIR` | `/uploads` | Upload storage directory |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `SECRET_KEY` | `change-me-in-production` | Flask session signing key |
| `FLASK_ENV` | `development` | Runtime environment (development/production/testing) |
| `PROMETHEUS_MULTIPROC_DIR` | — | Enable Prometheus multiprocess mode (set to writable dir) |
| `FLASK_METRICS_PORT` | `9200` | Backend Prometheus metrics HTTP server port |
| `WORKER_METRICS_PORT` | `9201` | Celery worker Prometheus HTTP server port |
| `VITE_MAP_NEARBY_KM` | `10` | Map nearby-files query radius |
| `VITE_MAP_THUMBS_PER_PAGE` | `32` | Map thumbnail gallery page size |
| `SERVER_HOSTNAME` | `server` | Hostname for SSL certificate generation (Docker) |

The backend also reads Celery queue names from `.env`:
- `CELERY_QUEUE_IMPORT` (default `import_queue`)
- `CELERY_QUEUE_METADATA` (default `metadata`)
- `CELERY_QUEUE_AI` (default `ai_metadata`)
- `CELERY_QUEUE_THUMBNAIL` (default `thumbnail`)
- `CELERY_QUEUE_FACE` (default `face_queue`)

## Required Directories

The app needs these directories to exist and be writable:

| Path | Env Var | Purpose | Created Automatically? |
|------|---------|---------|----------------------|
| `~/media-server-edited` | `EDITED_IMAGES_DIR` | Stores edited/cropped images | Yes (on first edit) |
| `/uploads` (or `UPLOAD_DIR`) | `UPLOAD_DIR` | Upload storage | No — create it manually |
| `/media` (or `MEDIA_PATH`) | — | Source media files (read-only) | No — must exist with your media |

```bash
mkdir -p ~/media-server-edited /uploads
```

## Database Migrations

```bash
flask db upgrade              # Apply pending migrations
flask db migrate -m "desc"    # Create new migration
flask db downgrade            # Rollback one migration
```

See [docs/developer-guide.md](developer-guide.md) for Makefile shortcuts (`make db-upgrade`, `make db-migrate`, etc.).
