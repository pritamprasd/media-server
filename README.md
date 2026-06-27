# Media Server

A scalable, semantic-searchable media viewer for your home media collection. Features AI-powered tagging, face detection & recognition, image/video editing, GPS map visualization, duplicate detection, and full PWA offline support.

## Stack

| Layer           | Technology                                                       |
| --------------- | ---------------------------------------------------------------- |
| Frontend        | React 19, React Router 7, Vite 6, Axios, Recharts               |
| Backend         | Flask 3, SQLAlchemy, Flask-Migrate, Gunicorn                     |
| Task Queue      | Celery 5 + Redis (5 workers: import, metadata, AI, thumbnail, face) |
| AI              | Ollama (vision models) + InsightFace (face detection/recognition)|
| Database        | PostgreSQL 16                                                    |
| Maps            | Leaflet + React-Leaflet (OpenStreetMap tiles with service worker caching) |

## Features

### 📂 Media Import & Management
- **Recursive directory scan** — import folders without copying files; filters by MIME type groups (image, video, audio, document)
- **Import sessions** — each import creates a session; re-importing the same folder updates in-place
- **Upload** — drag-and-drop zone + file picker; nickname field persisted to IndexedDB; multi-file upload with progress bars
- **Trash** — soft-delete files (library-only or library + disk)
- **Nickname persistence** — default nickname stored in IndexedDB, editable from Settings

### 🖼️ Gallery & File Viewer
- **Infinite-scroll grid** — Home page with configurable column layout (auto/1/2); click any thumbnail to open the overlay viewer
- **Directory tree** — Gallery page organized by import session; lazy-loaded expandable directories with file counts
- **Overlay viewer** — full-screen modal with zoom, rotate, flip, contrast/saturation/brightness controls; left/right arrow and button navigation through the current file list; keyboard shortcuts (← → navigate, Esc close)
- **Metadata sidebar** — EXIF data, GPS coordinates, dimensions, duration, date taken, AI-generated description and tags, search words, file hash, thumbnail status
- **Tags** — view, add, and remove tags inline; person names auto-synced as tags from face detection
- **Filter presets** — save custom filter combinations (brightness, contrast, saturation, warmth, sharpness, highlights, shadows, vignette, crop) as named presets; apply and delete presets from the viewer

### ✏️ Image Editing
- **Live CSS preview** — all edits previewed instantly with CSS filters before saving; 9 built-in filter presets (vivid, dramatic, vintage, noir, soft, clarity, warm, cool)
- **Adjust** — brightness, contrast, saturation, warmth, sharpness, highlights, shadows, vignette sliders
- **Crop** — draggable crop overlay with corner handles; aspect ratio presets (free, 1:1, 4:3, 3:2, 16:9, 21:9); normalized 0–1 coordinates converted to pixels on save
- **Rotate & Flip** — 90° clockwise/counter-clockwise, horizontal/vertical flip
- **Server-side processing** — all edits applied via Pillow (images) or ffmpeg (videos) on save; saves as a new file in the edited images directory
- **HEIC/HEIF support** — automatic conversion via ImageMagick + pillow-heif throughout the app (display, thumbnail, EXIF, AI metadata, hashing)

### 🎬 Video Support
- **Metadata extraction** — duration, dimensions, codec, frame rate via ffprobe
- **Thumbnails** — keyframe extraction via ffmpeg
- **Video editing** — trim (start/end time), color adjustment (brightness/contrast/saturation), rotate/flip via ffmpeg subprocess; trim-only operations use stream copy for speed
- **AI metadata** — multi-frame extraction sent to Ollama vision model for description and tags

### 🤖 AI Metadata (Ollama)
- **Automatic tagging** — files sent to a local Ollama vision model for description, 5–10 tags, and 5–10 search keywords
- **Folder tag merging** — tags extracted from parent folder names merged with AI tags
- **Retrigger** — regenerate AI metadata, EXIF, or thumbnail individually from the viewer sidebar
- **Configurable model** — choose any Ollama vision model (default: `llava`)

### 👤 Face Detection & Recognition
- **InsightFace buffalo_l** — ONNX-based face detection with configurable confidence threshold (default 0.3); 512-dimensional embeddings for cross-angle recognition
- **Age & gender estimation** — per-face age and gender metadata stored alongside each detection
- **Auto-grouping** — detected faces matched against known persons via cosine distance (threshold 0.4); new faces auto-grouped into new persons
- **Person management** — rename persons inline; merge multiple persons into one (recomputes average encoding); view all images containing a person
- **Scan all faces** — one-click scan of all unscanned images; modal shows queue count; auto-triggered on import, upload, and edit
- **Tag propagation** — naming a person adds the name as a tag to all containing images (removed on rename)
- **Face viewer** — view detected face thumbnails per image in the file viewer sidebar; name individual faces inline (creates or reuses persons)
- **Stats** — total persons, faces, named persons, files with faces

### 📍 Map & Locations
- **GPS visualization** — Leaflet map with clustered markers for all GPS-tagged files; markers grouped by rounded coordinates (3 decimal places)
- **Nearby filtering** — click on the map to find files within a configurable radius (default 10 km via `VITE_MAP_NEARBY_KM`)
- **Thumbnail gallery** — split-panel layout: map (left) + scrollable thumbnail grid (right); paginated (32 per page via `VITE_MAP_THUMBS_PER_PAGE`)
- **Saved locations** — CRUD management of named locations (name, lat/lng, radius); click a saved location to navigate the map
- **Tile caching** — OpenStreetMap tiles cached via service worker (cache-first, persistent across sessions)

### 🔍 Search & Filters
- **Full-text search** — search across filename, tags, AI description, and search keywords
- **Media type filter** — toggle between All / Images / Videos
- **AI filter** — show only files with AI-generated metadata
- **Dimension filter** — preset resolution thresholds (VGA, HD, Full HD, 4K)
- **Tag filter** — dropdown with tag search and count badges
- **Sort** — by name, date, or size; asc/desc toggle per column
- **Directory filter** — tree dialog to filter by import directory

### 📊 Statistics
- **Charts** — files by day (bar chart), files by file type (bar chart), storage by type (pie chart) via Recharts
- **Summary** — total files, total size, per-type breakdown

### 🔄 Duplicate Detection
- **Exact duplicates** — SHA-256 hash grouping
- **Near duplicates** — 64-bit difference hash (dhash) with band-indexed lookup; Hamming distance ≤ 10
- **Side-by-side comparison** — overlay viewer for reviewing duplicate groups

### ❤️ Favorites
- **Toggle** — favorite/unfavorite from the grid or viewer; heart icon with fill animation
- **Filtered view** — dedicated Favorites page with unfavorite inline

### ⚙️ Settings
- **Theme** — dark/light toggle with smooth transition
- **Accent color** — 8 preset accent colors; applied via CSS custom property `--color-primary`
- **Default tab** — choose which page loads on app start
- **Columns** — default grid column layout (auto/1/2)
- **Nickname** — edit default upload nickname

### 🎨 Design System
- **Neumorphic UI** — custom box-shadow system (`--neu-raised`, `--neu-inset`, `--neu-flat`) across all interactive elements
- **Dark/Light themes** — 50+ CSS custom properties; dark base `#0d0d0d`, light base `#e4e4ed`
- **Animations** — 10 CSS-only SpinKit spinner variants (ring, dual-ring, dots, pulse, bars, hourglass, ripple, infinity, grid, circle) with size/color theming
- **Lucide icons** — every button uses a thoughtful lucide-react icon
- **Responsive** — mobile layouts for Faces sidebar, Upload bottom sheet, map layout

### 🌐 PWA & Offline
- **Installable** — full PWA manifest with standalone display, theme color, icon set (192/512 PNG + SVG)
- **Service worker** — 4 cache stores with different strategies:
  | Cache | Strategy | Contents |
  |-------|----------|----------|
  | Shell | Cache-first | App JS/CSS (precached) |
  | API | Network-first | File listings, metadata, tags |
  | Media | Network-first | Full images and videos |
  | Map Tiles | Cache-first | OpenStreetMap tile images |
- **Loading animation** — animated gradient blobs, rotating rings, orbiting dots, pulsing icon in `index.html` until React mounts

### 🖥️ Docker Deployment
- **9 services** — backend (Flask/Gunicorn), 5 Celery workers (import, metadata, AI, thumbnail, face), frontend (Nginx), PostgreSQL, Redis
- **HTTPS** — self-signed certificate generated at build time; nginx reverse proxy with HTTP/2 and secure ciphers
- **Workers** — separate concurrency settings per queue (import=1, metadata=3, ai=1, thumbnail=3, face=1)
- **Face worker** — InsightFace model volume-mounted from host; `FACE_DET_THRESH=0.3`, `FACE_MATCH_THRESHOLD=0.4`; DNS fallback `8.8.8.8`

## Architecture

```mermaid
flowchart LR
    U[User] --> F[Frontend<br/>React SPA]
    F --> N[nginx<br/>HTTPS + Proxy]
    N --> B[Flask API<br/>:5000]
    B --> R[Redis<br/>:6379]
    B --> P[(PostgreSQL)]
    R --> W1[Celery Worker<br/>import_queue]
    R --> W2[Celery Worker<br/>metadata]
    R --> W3[Celery Worker<br/>ai_metadata]
    R --> W4[Celery Worker<br/>thumbnail]
    R --> W5[Celery Worker<br/>face_detection]
    W1 --> P
    W2 --> P
    W3 --> O[Ollama API]
    W4 --> P
    W5 --> P
    B --> M[(Media Files<br/>on Disk)]
```

## Project Structure

```
media-server/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes.py           # 40+ API endpoints
│   │   │   └── face_routes.py      # Face/person API endpoints
│   │   ├── models/                 # 10 SQLAlchemy models
│   │   ├── utility/                # 11 utility modules
│   │   ├── tasks.py                # 5 Celery task definitions
│   │   ├── config.py               # App configuration
│   │   └── __init__.py             # App factory
│   ├── migrations/                 # 6 Alembic migrations
│   ├── scripts/
│   │   └── regenerate_heic_thumbnails.py
│   ├── tests/
│   │   └── test_api.py             # 12 test cases
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                  # 11 pages
│   │   ├── components/             # 5 components
│   │   ├── services/               # API client, IndexedDB store
│   │   ├── contexts/               # ThemeContext
│   │   └── hooks/                  # useApi
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js                   # Service worker
│   │   └── icons
│   ├── index.html                  # Loading animation
│   ├── nginx.conf                  # HTTPS reverse proxy
│   └── Dockerfile
├── docker-compose.yml              # 7 application services
├── docker-compose.infra.yml        # PostgreSQL + Redis
├── Makefile                        # 20+ targets
└── README.md
```

## Quick Start

### Prerequisites

- Python 3.10+, Node.js 18+
- PostgreSQL 14+, Redis 6+
- [Ollama](https://ollama.ai) with a vision model (`ollama pull llava`)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
cp .env.example .env
pip install -r requirements.txt
flask db upgrade
python run.py
```

### Celery Workers

```bash
celery -A app.tasks.celery worker -Q import_queue,metadata,ai_metadata,thumbnail,face_detection -l info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:5173** (proxies `/api` to backend).

## PWA

The app is installable as a Progressive Web App.

| Platform | URL                                           |
| -------- | --------------------------------------------- |
| Dev      | `http://localhost:5173` (install prompt)      |
| Docker   | `https://homeserver.local:3443`                |

## Database Migrations

```bash
flask db upgrade              # Apply pending migrations
flask db migrate -m "desc"    # Create new migration
flask db downgrade            # Rollback one migration
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/media_server` | PostgreSQL DSN |
| `CELERY_BROKER_URL` | `redis://localhost:6379/0` | Redis broker |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llava` | Ollama vision model |
| `FACE_DET_THRESH` | `0.3` | Face detection confidence threshold |
| `FACE_MATCH_THRESHOLD` | `0.4` | Face match cosine distance threshold |
| `VITE_MAP_NEARBY_KM` | `10` | Map nearby-files query radius |
| `VITE_MAP_THUMBS_PER_PAGE` | `32` | Map thumbnail gallery page size |

## API Endpoints

### Files
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/files` | Paginated file list with filters (search, directory, mime, dimensions, tag, sort) |
| GET | `/api/files/<id>/serve` | Serve file (image/video/HEIC converted to JPEG) |
| GET | `/api/files/<id>/metadata` | Full metadata (EXIF, GPS, AI, tags, thumbnail) |
| GET | `/api/files/<id>/thumbnail` | Base64 thumbnail |
| GET | `/api/files/<id>/near-duplicates` | Perceptually similar images |
| PATCH | `/api/files/<id>/tags` | Update tags |
| PATCH | `/api/files/<id>/favorite` | Toggle favorite |
| POST | `/api/files/<id>/edit` | Apply image/video edits |
| POST | `/api/files/<id>/regenerate-ai` | Retrigger AI metadata |
| POST | `/api/files/<id>/regenerate-exif` | Retrigger EXIF extraction |
| POST | `/api/files/<id>/regenerate-thumbnail` | Retrigger thumbnail generation |
| POST | `/api/files/<id>/detect-faces` | Trigger face detection for file |
| DELETE | `/api/files/<id>` | Soft-delete file (library or library + disk) |
| GET | `/api/files/with-gps` | All GPS-tagged files with thumbnails |

### Import & Upload
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/import` | Import media folder (creates session) |
| POST | `/api/upload` | Upload files |
| GET | `/api/sessions` | List import sessions |
| GET | `/api/sessions/<id>` | Session details with file list |
| DELETE | `/api/sessions/<id>` | Delete session |
| GET | `/api/directories` | List imported directories (tree structure) |

### Tags & Favorites
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/tags` | Tag frequency list |
| GET | `/api/favorites` | Favorited files |

### Duplicates
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/duplicates` | Exact and near-duplicate groups |

### Filters
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/filters` | List custom filter presets |
| POST | `/api/filters` | Save/upsert filter preset |
| DELETE | `/api/filters/<id>` | Delete filter preset |

### Locations
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/locations` | List saved locations |
| POST | `/api/locations` | Save location |
| PUT | `/api/locations/<id>` | Update location |
| DELETE | `/api/locations/<id>` | Delete location |

### Faces & Persons
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/persons` | List all persons |
| PUT | `/api/persons/<id>` | Rename person (syncs name as tag) |
| DELETE | `/api/persons/<id>` | Delete person group |
| GET | `/api/persons/<id>/faces` | Paginated faces for a person |
| GET | `/api/persons/<id>/files` | Paginated files containing a person |
| POST | `/api/persons/scan` | Queue face detection for unscanned files |
| POST | `/api/persons/merge` | Merge multiple persons into one |
| GET | `/api/files/<id>/faces` | Faces detected in a file |
| PUT | `/api/faces/<id>` | Name/rename a face (creates or reuses person) |
| GET | `/api/faces` | List faces (optionally filtered by person) |
| GET | `/api/faces/stats` | Face detection statistics |

### System
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check |
| GET | `/api/status` | API status |
| GET | `/api/stats` | System statistics (files, size, types) |
| GET | `/api/trash` | List trashed files |
| POST | `/api/trash/empty` | Permanently delete all trashed files |
| POST | `/api/trash/restore/<id>` | Restore trashed file |
