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
│   │   │   ├── Home.jsx                 # Infinite-scroll gallery grid with search & filters
│   │   │   ├── Home.css
│   │   │   ├── Importer.jsx             # Import media page
│   │   │   ├── Importer.css
│   │   │   ├── Gallery.jsx              # Tree-view gallery (renamed to "Imported Media")
│   │   │   ├── Gallery.css
│   │   │   ├── Favorites.jsx            # Favorites grid
│   │   │   └── Favorites.css
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

Celery processes background tasks (metadata extraction, AI tagging, thumbnails). Tasks are routed to named queues so you can scale each type independently:

| Queue          | Task                         | Concurrency |
| -------------- | ---------------------------- | ----------- |
| `import_queue` | `process_import_folder`      | 1           |
| `metadata`     | `extract_file_metadata`      | 4           |
| `ai_metadata`  | `generate_ai_metadata`       | 2           |
| `thumbnail`    | `generate_thumbnail`         | 3           |

Start separate workers per queue:

```bash
cd backend
source .venv/bin/activate

celery -A app.tasks.celery worker -Q import_queue -l info --concurrency=1
celery -A app.tasks.celery worker -Q metadata -l info --concurrency=10
celery -A app.tasks.celery worker -Q ai_metadata -l info --concurrency=2
celery -A app.tasks.celery worker -Q thumbnail -l info --concurrency=10
```

Or a single worker handling all queues:

```bash
celery -A app.tasks.celery worker -Q celery,metadata,ai_metadata,thumbnail -l info
```

Tasks are dispatched automatically when files are imported or edited:

- `extract_file_metadata` — extracts EXIF/ffprobe data (dimensions, duration, GPS, date taken)
- `generate_ai_metadata` — calls Ollama for tags, description, and search keywords
- `generate_thumbnail` — generates 400×400 JPEG thumbnails (Pillow for images, ffmpeg for videos)

> **Note**: In testing mode, Celery runs tasks synchronously (`CELERY_TASK_ALWAYS_EAGER = True`), so no Redis or worker process is needed for tests.

### Flower (Celery monitoring UI)

Install and run:

```sh
pip install flower
celery -A app.tasks.celery flower --port=5555
```

Open **http://localhost:5555**.

**Filtering tasks**:
- Use the search box in the **Tasks** tab — type task name (`extract_file_metadata`), state (`SUCCESS`, `FAILURE`, `RECEIVED`, `STARTED`), worker hostname, or any substring
- Click column headers (**Name**, **State**, **Received**, **Worker**) to sort ascending/descending
- URL query params: `?state=FAILURE` or `?task=app.tasks.extract_file_metadata`

**Monitor per queue**:
- The **Broker** tab shows queue depths (pending tasks in each queue)

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
| `source .venv/bin/activate && pytest tests/` | Run 14 tests |

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
| GET     | `/api/files`                   | List files (paginated, with `?mime_group=`, `?q=` search) |
| GET     | `/api/files/<id>/serve`       | Serve the actual file for viewing        |
| GET     | `/api/files/<id>/metadata`    | Get file metadata (EXIF, GPS, tags, AI)  |
| GET     | `/api/files/<id>/thumbnail`   | Get base64 thumbnail data URI            |
| POST    | `/api/files/<id>/edit`        | Apply image edits (rotate, flip, grayscale) |
| PATCH   | `/api/files/<id>/favorite`    | Toggle favorite status on a file         |
| GET     | `/api/favorites`              | List all favorited files                 |

## Features

### Media Importer

Enter a folder path and select media types (Images / Videos). Click **Import** and the backend recursively scans the directory, filters files by MIME type (extension-based), and persists metadata (path, size, type, timestamps) to PostgreSQL — without copying file contents. Each import creates a new session.

### Gallery Tree View

Browse imported files in a **lazy-loaded tree view**. Directories and files are fetched from the database on demand (no disk access during browsing). Each import session is selectable from a dropdown.

### File Viewer

Click any file in the gallery tree to open an **overlay modal**. Images are rendered inline; videos play with native controls. Files are served from their original disk location via the API.

Features:
- **Favorite toggle** — mark files with a star; view all favorites on the Favorites page
- **Metadata panel** — see EXIF, GPS, dimensions, duration, date taken, AI-generated tags and description in a sidebar
- **Image editing** — rotate, flip (H/V), grayscale directly in the viewer; edits save as new files
- **Download** — download the original file with one click

### Home Gallery

The Home page shows an **infinite-scroll grid** of all imported media with:
- **Thumbnails** — 400×400 previews (generated asynchronously by Celery)
- **Search** — type to search across tags, description, and filename (400ms debounce)
- **Media type filters** — toggle between All / Images / Videos

### Thumbnails

Thumbnails are generated asynchronously by the `generate_thumbnail` Celery task:
- **Images** — Pillow `thumbnail()` resized to 400×400, saved as base64 JPEG data URI in the database
- **Videos** — ffmpeg extracts a frame at 30% duration, resized to 400×400

## Database Schema

Four tables store media metadata:

| Table                 | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `import_sessions`     | Tracks each import operation                     |
| `imported_directories`| Directory entries (for tree navigation)          |
| `imported_files`      | File metadata (path, size, mime, is_favorite)    |
| `file_metadata`       | EXIF data, GPS, tags, description, search words, thumbnail (base64 JPEG) |

`imported_directories` uses a `parent_path` column enabling efficient lazy-load tree queries without scanning the entire file list.

`file_metadata` is populated asynchronously by Celery tasks after each import or edit:
- `extract_file_metadata` — reads EXIF (images via Pillow) or stream metadata (videos via ffprobe), stores GPS, dimensions, duration, date taken
- `generate_ai_metadata` — sends the file to a local Ollama model (`llava` for images, `gemma4:12b` / `llama3.2` for videos), saves generated tags, description, and search keywords
- `generate_thumbnail` — creates 400×400 base64 JPEG thumbnails

## Development

- Follow the existing file structure when adding new features.
- Add new API routes in `backend/app/api/routes.py` or create new route modules.
- Place reusable UI components in `frontend/src/components/`.
- Place page-level components in `frontend/src/pages/`.
- Update this README when adding new features.
