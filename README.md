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
- **Copy, Move, Rename** — clipboard (cut/copy/paste) and inline rename for files and folders; drag-and-drop to move items between directories
- **Media Explorer** — file-browser-style page (grid/list view) with breadcrumb navigation; paginated browsing (100 per page, load-more button + IntersectionObserver infinite scroll); strict folder hierarchy enforced via `directory_id` FK (not `relative_path` string matching); centered layout capped at 1600px / 90% viewport width; **folder favorites** — star-toggle any folder and see favorites as quick-navigation chips above the breadcrumbs; **folder customization** — click the pencil hint on any folder tile to choose from 13 Lucide icons and 10 colors, persisted per-folder in IndexedDB

### 🖼️ Gallery & File Viewer
- **Infinite-scroll grid** — Home page with configurable column layout (auto/1/2); click any thumbnail to open the overlay viewer
- **Directory tree** — Gallery page organized by import session; lazy-loaded expandable directories with file counts
- **Overlay viewer** — full-screen modal with zoom, pan (drag when zoomed), rotate, flip, contrast/saturation/brightness controls; left/right arrow and button navigation through the current file list; keyboard shortcuts (← → navigate, Esc close)
- **Loading spinner** — `<Spinner>` overlay shown while media is downloading, hidden once image/video fires `onLoad`/`onCanPlay`
- **Metadata sidebar** — EXIF data, GPS coordinates with **reverse geocoded location name** (via Nominatim) + Google Maps link fallback, dimensions, duration, date taken, AI-generated description and tags, search words, file hash, thumbnail status; people section with face thumbnails and "Detect Faces" button
- **Tags** — view, add, and remove tags inline; person names auto-synced as tags from face detection
- **Filter presets** — save custom filter combinations (brightness, contrast, saturation, warmth, sharpness, highlights, shadows, vignette, crop) as named presets; apply and delete presets from the viewer
- **Browse Folder** — opens the parent directory in the Home grid from any file in the viewer

### ✏️ Image Editing
- **Live CSS preview** — all edits previewed instantly with CSS filters before saving; 9 built-in filter presets (vivid, dramatic, vintage, noir, soft, clarity, warm, cool)
- **Filters tab** — one-click presets; custom filter presets saved to database (save/upsert/delete)
- **Adjust tab** — brightness, contrast, saturation, warmth, sharpness, vibrance, tint sliders
- **Light tab** — exposure, contrast, highlights, shadows, blacks, whites sliders
- **Effects tab** — grain, grayscale toggle, colorize, vignette with intensity sliders
- **Details tab** — clarity and dehaze sliders
- **Crop** — draggable crop overlay with corner handles + move handle; aspect ratio presets (free, 1:1, 4:3, 3:2, 16:9, 21:9, 3:4, 2:3, 9:16, 9:21); Apply/Reset flow; normalized 0–1 coordinates converted to pixels on save
- **Rotate & Flip** — 90° clockwise/counter-clockwise, horizontal/vertical flip
- **Show Original** — press-and-hold (mouse/touch) to compare edited preview against original
- **Histogram** — real-time luminance histogram (debounced 150ms) rendered in edit footer; applies preview filters via off-screen canvas
- **Export** — format dropdown (JPEG, PNG, WebP, HEIC, PDF, ASCII Art) with quality slider; ASCII art with configurable character set and width; server-side re-processing in requested format
- **Info tab** — inline markdown reference for all editing properties
- **Server-side processing** — all edits applied via Pillow on save with 20+ operation types (tint, vibrance, clarity, dehaze, exposure, blacks, whites, grain, grayscale, colorize, and the full filter preset pipeline); saves as a new file in the edited images directory
- **HEIC/HEIF support** — automatic conversion via pillow-heif throughout the app (display, thumbnail, EXIF, AI metadata, hashing)

### 🎬 Video Support
- **Metadata extraction** — duration, dimensions, codec, frame rate via ffprobe
- **Thumbnails** — keyframe extraction via ffmpeg
- **Video editing** — trim (start/end time), color adjustment (brightness/contrast/saturation/warmth), rotate/flip, speed (0.25x–4x via live `playbackRate`), volume (0–200%), reverse, audio mute, crop, text overlay (configurable font/size/color/position via ffmpeg `drawtext`); video filter presets (vivid, dramatic, vintage, noir, soft, clarity, warm, cool)
- **Video export** — MP4, WebM, AVI, MKV, MOV via ffmpeg re-encoding; format-specific codec args
- **Trim-only operations** — use stream copy for speed
- **Live speed preview** — `playbackRate` set directly on `<video>` element — no re-encode needed
- **AI metadata** — multi-frame extraction sent to Ollama vision model for description and tags

### 🤖 AI Metadata (Ollama)
- **Automatic tagging** — files sent to a local Ollama vision model for description, 5–10 tags, and 5–10 search keywords; multi-frame extraction for videos
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
- **Infinite scroll** — Faces page uses paginated backend (50 per page) with IntersectionObserver for seamless scrolling
- **Combine duplicates** — persons with the same name (case-insensitive) are grouped into a single card showing a 2×2 thumbnail grid, total face count, and group size; edit/delete hidden on combined cards to avoid ambiguity
- **Stats** — total persons, faces, named persons, files with faces

### 📍 Map & Locations
- **GPS visualization** — Leaflet map with clustered markers for all GPS-tagged files; markers grouped by rounded coordinates (3 decimal places)
- **Nearby filtering** — click on the map to find files within a configurable radius (1–100 km slider with explicit Search button); radius only activates on button press, not on slider drag
- **Zoom In on pin** — each pin popup has a "Zoom In" button that flies the map to a configurable zoom level (10–19, default 18 via Settings)
- **Thumbnail gallery** — split-panel layout: map (left) + scrollable thumbnail grid (right); paginated (32 per page via `VITE_MAP_THUMBS_PER_PAGE`)
- **Saved locations** — CRUD management of named locations (name, lat/lng, radius); click a saved location to navigate the map
- **Tile caching** — OpenStreetMap tiles cached via service worker (cache-first, persistent across sessions)

### 🔍 Search & Filters
- **Full-text search** — search across filename, tags, AI description, search keywords, and **person names** (via `DetectedFace` + `Person` join)
- **Media type filter** — toggle between All / Images / Videos
- **AI filter** — show only files with AI-generated metadata
- **Dimension filter** — preset resolution thresholds (VGA, HD, Full HD, 4K); responsive dropdown on mobile
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
- **Editor Tab Order** — reorder image and video editor tabs via move-up/move-down; persisted to IndexedDB and reflected in the viewer
- **Cache clear** — clear all IndexedDB caches and service worker caches; uses `navigator.serviceWorker.ready` for Chrome PWA compatibility
- **Map Zoom Level** — slider (10–19) with explicit Save button; persisted to IndexedDB and consumed by the Map tab's Zoom In button

### 🧰 Tools
- **Tool system** — declarative imperative DOM framework; drop a `.js` or `.html` file into `frontend/src/tools/` and it's auto-discovered via `import.meta.glob`; no route, import, or config change needed
- **Barcode Scanner** — scan product barcodes via camera or uploaded image; auto-looks up product info (name, brand, description, price, rating, ingredients, nutritional scores) from 6 sources (Open Food Facts, Datakick, Buycott, BarcodeLookup, SaiSuperMarket) with **per-provider caching** — re-scanning the same barcode shows all cached provider data instantly while refreshing every source in the background
- **3D Globe Explorer** — interactive 3D Earth with OpenStreetMap tile layers, map style switcher, fly-to navigation, Nominatim search autocomplete, and live Open-Meteo weather on click
- **Logs** — real-time IndexedDB log viewer shared across all tools; filter by tool source, color-coded type badges (api_request/api_response/api_error/scan_detected), expandable detail rows, auto-refresh every 3s
- **QR Code Generator** — encode text/URLs into QR codes with configurable size and error correction

### 🌍 Geocoding
- **Reverse geocoding** — backend endpoint calls Nominatim API with 1 req/s rate limiting; results cached in-memory by rounded coordinates (4 decimal places)
- **Google Maps link** — every GPS entry shows an `ExternalLink` icon that opens `https://www.google.com/maps?q=lat,lng` in a new tab

### 🎨 Design System
- **Neumorphic UI** — custom box-shadow system (`--neu-raised`, `--neu-inset`, `--neu-flat`) across all interactive elements
- **Dark/Light themes** — 50+ CSS custom properties; dark base `#0d0d0d`, light base `#e4e4ed`
- **Animations** — 10 CSS-only SpinKit spinner variants (ring, dual-ring, dots, pulse, bars, hourglass, ripple, infinity, grid, circle) with size/color theming
- **Lucide icons** — every button uses a thoughtful lucide-react icon
- **Responsive** — mobile layouts for Faces sidebar, Upload bottom sheet, map layout, viewer padding (buttons no longer hidden behind image content); filter bar collapses to stacked layout with dimension dropdown, full-width tag selector, and evenly-spaced sort buttons on ≤768px

### 🌐 PWA & Offline
- **Installable** — full PWA manifest with standalone display, theme color, icon set (192/512 PNG + SVG)
- **Service worker** — 4 cache stores with different strategies (CLEAR_CACHES broadcasts to all window clients):
  | Cache | Strategy | Contents |
  |-------|----------|----------|
  | Shell | Cache-first | App JS/CSS (precached) |
  | API | Network-first | File listings, metadata, tags |
  | Media | Network-first | Full images and videos |
  | Map Tiles | Cache-first | OpenStreetMap tile images |
- **Registration** — `updateViaCache: "none"`, `CLAIM`/`SKIP_WAITING` message handlers, `controllerchange` listener with debounced reload; works reliably on Chrome mobile/PWA
- **Cache clear** — broadcasts to `{ type: "window" }` clients; all active tabs receive the clear signal
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
│   │   │   ├── routes.py           # 50+ API endpoints
│   │   │   └── face_routes.py      # Face/person API endpoints
│   │   ├── models/                 # 10 SQLAlchemy models
│   │   ├── utility/                # 11 utility modules
│   │   ├── tasks.py                # 5 Celery task definitions
│   │   ├── config.py               # App configuration
│   │   └── __init__.py             # App factory
│   ├── migrations/                 # 10 Alembic migrations
│   ├── scripts/
│   │   └── regenerate_heic_thumbnails.py
│   ├── tests/
│   │   └── test_api.py             # 13 test cases
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/                  # 11 pages
│   │   ├── components/             # 4 components
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

## Database Optimization

The following indexes are defined across 9 tables to support the most frequent query patterns:

| Table | Index | Type | Covers |
|-------|-------|------|--------|
| `import_sessions` | `root_path` | Single | Session lookup by root path |
| `import_sessions` | `created_at` | Single | Session listing sort |
| `imported_directories` | `session_id + parent_path` | Composite | Browse hierarchy queries |
| `imported_directories` | `name` | Single | Directory listing sort |
| `imported_directories` | `path`, `parent_path`, `deleted` | Single | Explorer hierarchy filters |
| `imported_files` | `session_id + relative_path` | Composite | Upload management (8+ queries) |
| `imported_files` | `created_at + deleted` | Composite | Default file listing sort + filter |
| `imported_files` | `directory_id` | Single | FK join to directories |
| `imported_files` | `mime_type` | Single | Media type filtering (7+ queries) |
| `imported_files` | `relative_path` | Single | Path matching (10+ queries) |
| `imported_files` | `filename` | Single | File name sort |
| `imported_files` | `is_favorite` | Single | Favorites listing |
| `imported_files` | `nickname` | Single | Upload nickname filtering |
| `imported_files` | `deleted` | Single | Trash filtering |
| `file_metadata` | `file_hash` | Single | Duplicate detection |
| `file_metadata` | `latitude + longitude` | Composite | GIS range queries (saved locations) |
| `file_metadata` | `metadata_status` | Single | Metadata status stats |
| `file_metadata` | `thumbnail_status` | Single | Thumbnail status stats |
| `dhash_bands` | `band_index + band_value` | Composite | Near-duplicate lookup |
| `dhash_bands` | `metadata_id` | Single | FK cascade deletes |
| `persons` | `name` | Single | Face assignment lookup + search |
| `persons` | `face_count` | Single | Person listing sort |
| `persons` | `created_at` | Single | Person listing sort |
| `detected_faces` | `file_id`, `person_id` | Single | FK joins |
| `detected_faces` | `created_at` | Single | Face listing pagination |
| `detected_faces` | `confidence` | Single | Face confidence sort |
| `saved_locations` | `name` | Single | Location listing sort |
| `filter_presets` | `name` | Single | Preset listing + lookup |

Run `make db-upgrade` to apply new indexes after pulling.

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

## Writing a New Tool (LLM Prompt)

Copy and paste the following block into another LLM (ChatGPT, Gemini, Claude, etc.) to generate a new tool that automatically works with this codebase.

---

```
You are generating a tool for a media-server React app (Vite + React 19). The tool system uses imperative DOM construction (no JSX).

## How tools work

1. Drop a `.js` file into `frontend/src/tools/`.
2. The file is **auto-discovered** via `import.meta.glob` — no route, import, or config change needed.
3. The filename (minus `.js`) becomes the tool's URL `id` at `/tools/:toolId`.
4. The grid tile shows the `name` and `description` exports, plus a "JS" type badge.

## Required exports

```js
export const name = "Display Name";        // Shown on grid tile + viewer header
export const description = "Short description";  // Shown on grid tile
export function init(container) { /* ... */ }    // Called when tool mounts
export function destroy(container) { /* ... */ } // Called when tool unmounts
```

## `init(container)` rules

- `container` is a plain `<div>` already in the DOM. Append your UI to it.
- **Do NOT use JSX or React components.** Create elements with `document.createElement`, set styles via `.style.cssText` or classes.
- Return a **cleanup function** from `init` (called before `destroy`). Use it to remove event listeners, stop streams, cancel animation frames, dispose WebGL resources, etc.

## `destroy(container)` rules

- Always set `container.innerHTML = ""` at minimum.

## Styling

Use these CSS custom properties for theme support (they adapt to dark/light mode):

| Variable              | Purpose            |
|-----------------------|--------------------|
| `--color-bg`          | Page background    |
| `--color-surface`     | Card/surface bg    |
| `--color-text`        | Primary text       |
| `--color-text-muted`  | Muted/secondary    |
| `--color-border`      | Borders            |
| `--color-primary`     | Accent/action color|
| `--radius`            | Border radius      |
| `--neu-raised-sm`     | Raised shadow      |
| `--neu-flat`          | Flat shadow        |
| `--neu-inset-sm`      | Inset shadow       |

## npm dependencies

Install via `npm install <pkg>` in `frontend/`. Use bare ESM imports — Vite bundles them. Examples:
```js
import QRCode from "qrcode";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
```

## Three.js tools

- Import from `three` and `three/examples/jsm/controls/OrbitControls.js`.
- Use `ResizeObserver` on the container for responsive sizing.
- In the cleanup function: `cancelAnimationFrame`, `ro.disconnect()`, `renderer.dispose()`, dispose all geometries and materials, remove wrapper.

## HTML tools (alternative)

Instead of a `.js` file, drop a `.html` file into `frontend/src/tools/`. It renders in an iframe with `sandbox="allow-scripts allow-same-origin"`. The filename (minus `.html`) becomes the display name. No metadata exports needed.

## Example: minimum viable tool

Create `frontend/src/tools/hello.js`:

```js
export const name = "Hello World";
export const description = "A minimal sample tool";

export function init(container) {
  const el = document.createElement("div");
  el.style.cssText = "padding:2rem;color:var(--color-text);";
  el.textContent = "Hello from a tool!";
  container.appendChild(el);

  return () => { container.removeChild(el); };
}

export function destroy(container) {
  container.innerHTML = "";
}
```

## What to generate

Generate a tool that [DESCRIBE YOUR IDEA HERE]. Follow all the conventions above:
- Use `var(--color-*)` for theme support
- Use inline `.style.cssText` for styling
- No JSX, no React components
- Return a cleanup function from `init`
- Set `container.innerHTML = ""` in `destroy`
- If using Three.js, dispose all resources in cleanup
- File name will become the URL slug — use kebab-case

---

To use: copy the block above, replace `[DESCRIBE YOUR IDEA HERE]` with your tool idea, and paste the whole thing into another LLM. The generated `.js` file goes directly into `frontend/src/tools/` and will appear in the app on next build.

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

### System & Geocoding
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check |
| GET | `/api/status` | API status |
| GET | `/api/geocode/reverse` | Reverse geocode lat/lng to location name (Nominatim) |
| GET | `/api/stats` | System statistics (files, size, types) |
| GET | `/api/trash` | List trashed files |
| POST | `/api/trash/empty` | Permanently delete all trashed files |
| POST | `/api/trash/restore/<id>` | Restore trashed file |
