# Media Server

A full-stack media server application with a React frontend and Flask API backend.

## Stack

| Layer           | Technology                                                       |
| --------------- | ---------------------------------------------------------------- |
| Frontend        | React 19, React Router 7, Vite, Axios                           |
| Backend         | Flask 3, SQLAlchemy, Flask-Migrate, Flask-CORS, gunicorn        |
| Task Queue      | Celery 5 + Redis (broker & result backend)                      |
| AI              | Ollama (local LLM, e.g. `llava` for vision)                     |
| Database        | PostgreSQL (production), SQLite (testing / CI)                  |

## Project Structure

```
media-server/
├── backend/
│   ├── app/
│   │   ├── __init__.py                  # App factory + DB init + Celery init
│   │   ├── config.py                    # Dev/Prod/Test configs
│   │   ├── celery_app.py                # Celery app factory
│   │   ├── tasks.py                     # Celery tasks (metadata extraction, AI)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py                # API routes
│   │   └── models/
│   │       ├── __init__.py              # Base model + model imports
│   │       ├── import_session.py        # ImportSession model
│   │       ├── imported_directory.py    # ImportedDirectory model
│   │       ├── imported_file.py         # ImportedFile model
│   │       └── file_metadata.py         # FileMetadata model (EXIF, tags, AI data)
│   ├── tests/
│   │   └── test_api.py                  # 14+ API tests
│   ├── requirements.txt
│   ├── run.py                           # Entry point
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx               # Navigation tabs
│   │   │   ├── Navbar.css
│   │   │   ├── TreeNode.jsx             # Lazy-loaded tree node
│   │   │   ├── TreeNode.css
│   │   │   ├── FileViewer.jsx           # Image/video modal viewer
│   │   │   └── FileViewer.css
│   │   ├── pages/
│   │   │   ├── Home.jsx                 # Status page
│   │   │   ├── Home.css
│   │   │   ├── Importer.jsx             # Import media page
│   │   │   ├── Importer.css
│   │   │   ├── Gallery.jsx              # Tree-view gallery
│   │   │   └── Gallery.css
│   │   ├── services/
│   │   │   └── api.js                   # Axios API client
│   │   ├── hooks/
│   │   │   └── useApi.js                # Generic fetch hook
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── README.md
└── .gitignore
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ running locally on port 5432
- Redis 6+ running locally on port 6379
- [Ollama](https://ollama.ai) installed and running with a vision model (e.g. `llava`)

Create the database:

```bash
createdb media_server
# or:
psql -c "CREATE DATABASE media_server;"
```

Pull the Ollama vision model:

```bash
ollama pull llava
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
cp .env.example .env
# Edit .env with your PostgreSQL credentials if needed
pip install -r requirements.txt
python run.py
```

Server starts at **http://localhost:5000**. Tables are created automatically on first run.

### Celery Workers (separate terminal)

Celery processes background tasks (metadata extraction, AI tagging). Start one worker per task type:

```bash
cd backend
source .venv/bin/activate
celery -A app.tasks.celery worker -Q celery -l info --concurrency=2
```



Tasks are dispatched automatically when files are imported. The `extract_file_metadata` task extracts EXIF/ffprobe data; the `generate_ai_metadata` task calls Ollama for tags and descriptions.

> **Note**: In testing mode, Celery runs tasks synchronously (`CELERY_TASK_ALWAYS_EAGER = True`), so no Redis or worker process is needed for tests.
>

### Flower celery UI(Optional)
```sh
pip install flower
celery -A app.tasks.celery flower
```
#### Purge all tasks
```sh
celery -A app.tasks.celery purge
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

App starts at **http://localhost:5173**. The Vite dev server proxies `/api` requests to the Flask backend.

## Available Scripts

### Backend

| Command                    | Description            |
| -------------------------- | ---------------------- |
| `python run.py`            | Start dev server       |
| `source .venv/bin/activate && pytest tests/` | Run 10 tests |

### Frontend

| Command           | Description          |
| ----------------- | -------------------- |
| `npm run dev`     | Start dev server     |
| `npm run build`   | Production build     |
| `npm run preview` | Preview build        |
| `npm run lint`    | Lint source code     |

## API Endpoints

| Method  | Path                          | Description                              |
| ------- | ----------------------------- | ---------------------------------------- |
| GET     | `/health`                     | Health check                            |
| GET     | `/api/status`                 | API status check                        |
| POST    | `/api/import`                 | Import media files from a folder          |
| GET     | `/api/sessions`               | List all import sessions                 |
| GET     | `/api/sessions/<id>/browse`   | Browse files/dirs in a session (lazy)    |
| GET     | `/api/files/<id>/serve`       | Serve the actual file for viewing        |
| PATCH   | `/api/files/<id>/favorite`    | Toggle favorite status on a file         |
| GET     | `/api/favorites`              | List all favorited files                 |

## Features

### Media Importer

Enter a folder path and select media types (Images / Videos). Click **Import** and the backend recursively scans the directory, filters files by MIME type (extension-based), and persists metadata (path, size, type, timestamps) to PostgreSQL — without copying file contents. Each import creates a new session.

### Gallery Tree View

Browse imported files in a **lazy-loaded tree view**. Directories and files are fetched from the database on demand (no disk access during browsing). Each import session is selectable from a dropdown.

### File Viewer

Click any file in the gallery tree to open an **overlay modal**. Images are rendered inline; videos play with native controls. Files are served from their original disk location via the API.

## Database Schema

Four tables store media metadata:

| Table                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `import_sessions`     | Tracks each import operation                     |
| `imported_directories`| Directory entries (for tree navigation)          |
| `imported_files`      | File metadata (path, size, mime, is_favorite)    |
| `file_metadata`       | EXIF data, GPS, tags, description, search words  |

`imported_directories` uses a `parent_path` column enabling efficient lazy-load tree queries without scanning the entire file list.

`file_metadata` is populated asynchronously by Celery tasks after each import:
- `extract_file_metadata` — reads EXIF (images via Pillow) or stream metadata (videos via ffprobe), stores GPS, dimensions, duration, date taken
- `generate_ai_metadata` — sends the file to a local Ollama model (`llava` for images, `llama3.2` for videos), saves generated tags, description, and search keywords

## Development

- Follow the existing file structure when adding new features.
- Add new API routes in `backend/app/api/routes.py` or create new route modules.
- Place reusable UI components in `frontend/src/components/`.
- Place page-level components in `frontend/src/pages/`.
- Update this README when adding new features.
