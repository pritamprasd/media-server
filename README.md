# Media Server

A scalable, semantic-searchable media viewer for your home media collection. Features AI-powered tagging, face detection & recognition, image/video editing, GPS map visualization, duplicate detection, collections, hidden files, and full PWA offline support.

## Stack

| Layer           | Technology                                                       |
| --------------- | ---------------------------------------------------------------- |
| Frontend        | React 19, React Router 7, Vite 6, Axios, Recharts, Leaflet      |
| Backend         | Flask 3, SQLAlchemy, Flask-Migrate, Gunicorn                     |
| Task Queue      | Celery 5 + Redis (5 workers: import, metadata, AI, thumbnail, face) |
| AI              | Ollama (vision + text models) + InsightFace (face detection/recognition) |
| Database        | PostgreSQL 16 (production), SQLite (development/testing)          |
| Maps            | Leaflet + React-Leaflet (OpenStreetMap tiles with service worker caching) |

## Features

### 📂 Media Import & Management
- **Recursive directory scan** — import folders without copying files; filters by MIME type groups (image, video, audio, document)
- **Import sessions** — each import creates a session; re-importing the same folder updates in-place (removes stale files, adds new ones)
- **Upload** — drag-and-drop zone + file picker; nickname field persisted to IndexedDB; multi-file upload with progress bars; optional subdirectory selection
- **Upload directory management** — browse, create, rename, move, copy, and delete directories and files within the upload area; clipboard (cut/copy/paste) and inline rename
- **Local filesystem browser** — navigate the host filesystem from the import dialog to select folders
- **Trash** — soft-delete files (library-only or library + disk)
- **Nickname persistence** — default nickname stored in IndexedDB, editable from Settings
- **Media Explorer** — unified file-browser-style page (grid/list view) across all sessions with breadcrumb navigation; paginated browsing (100 per page, load-more button + IntersectionObserver infinite scroll); strict folder hierarchy enforced via `directory_id` FK (not `relative_path` string matching); centered layout capped at 1600px / 90% viewport width
- **Folder favorites** — star-toggle any folder in the explorer and see favorites as quick-navigation chips above the breadcrumbs; persisted via `FavoriteFolder` model (DB-backed)
- **Folder customization** — click the pencil hint on any folder tile to choose from 13 Lucide icons and 10 colors, persisted per-folder in IndexedDB (`explorer_folder_styles`)
- **Synthetic session folders** — non-upload sessions with root-only files get a synthetic directory entry (`__session_{id}__`) in the explorer
- **File operations** — rename, move (within/across sessions), copy, and delete files and directories from the explorer; metadata is preserved/duplicated as appropriate

### 🖼️ Gallery & File Viewer
- **Infinite-scroll grid** — Home page with configurable column layout (auto/1/2); click any thumbnail to open the overlay viewer
- **Directory tree** — Gallery page organized by import session; lazy-loaded expandable directories with file counts
- **Overlay viewer** — full-screen modal with zoom, pan (drag when zoomed), rotate, flip, contrast/saturation/brightness controls; left/right arrow and button navigation through the current file list; keyboard shortcuts (← → navigate, Esc close)
- **Loading spinner** — `<Spinner>` overlay shown while media is downloading, hidden once image/video fires `onLoad`/`onCanPlay`
- **Metadata sidebar** — EXIF data, GPS coordinates with **reverse geocoded location name** (via Nominatim with rate limiting + Redis caching) + Google Maps link fallback, dimensions, duration, date taken, AI-generated description and tags, search words, file hash (SHA-256), thumbnail status; people section with face thumbnails and "Detect Faces" button
- **Tags** — view, add, and remove tags inline; person names auto-synced as tags from face detection
- **Filter presets** — save custom filter combinations (brightness, contrast, saturation, warmth, sharpness, highlights, shadows, vignette, crop) as named presets; apply and delete presets from the viewer; persisted via `FilterPreset` model
- **Browse Folder** — opens the parent directory in the Home grid from any file in the viewer
- **Prominent colors** — top 20 most frequent colors extracted from images (grayscale excluded, similar colors merged); multi-select toggle for selective color editing; percentage labels on swatches
- **Histogram** — real-time luminance histogram (debounced 150ms) rendered in edit footer; applies preview filters via off-screen canvas

### ✏️ Image Editing
- **Live CSS preview** — all edits previewed instantly with CSS filters before saving; 9 built-in filter presets (vivid, dramatic, vintage, noir, soft, clarity, warm, cool)
- **Filters tab** — one-click presets; custom filter presets saved to database (save/upsert/delete)
- **Adjust tab** — brightness, contrast, saturation, warmth, sharpness, vibrance, tint sliders
- **Light tab** — exposure, contrast, highlights, shadows, blacks, whites sliders
- **Effects tab** — grain, grayscale toggle, colorize, vignette with intensity sliders
- **Details tab** — clarity and dehaze sliders
- **Colors tab** — selective color editing with color picker + tolerance slider; click a swatch from the prominent colors to toggle it as a filter target
- **Crop** — draggable crop overlay with corner handles + move handle; aspect ratio presets (free, 1:1, 4:3, 3:2, 16:9, 21:9, 3:4, 2:3, 9:16, 9:21); Apply/Reset flow; normalized 0–1 coordinates converted to pixels on save
- **Rotate & Flip** — 90° clockwise/counter-clockwise, horizontal/vertical flip
- **Show Original** — press-and-hold (mouse/touch) to compare edited preview against original
- **Export** — format dropdown (JPEG, PNG, WebP, HEIC, PDF, ASCII Art) with quality slider; ASCII art with configurable character set and width; server-side re-processing in requested format
- **Info tab** — inline markdown reference for all editing properties
- **Server-side processing** — 20+ operation types applied via Pillow on save (tint, vibrance, clarity, dehaze, exposure, blacks, whites, grain, grayscale, colorize, selective_color, and the full filter preset pipeline); saves as a new file in the edited images directory, creates a new ImportSession, and dispatches all post-processing Celery tasks
- **HEIC/HEIF support** — automatic conversion via pillow-heif + ImageMagick throughout the app (display, thumbnail, EXIF, AI metadata, hashing)

### 🎬 Video Support
- **Metadata extraction** — duration, dimensions, codec, frame rate via ffprobe
- **Thumbnails** — keyframe extraction via ffmpeg (frame at 30% duration)
- **Video editing operations** — trim (start/end time), rotate (90/-90/180), brightness/contrast/saturation/warmth (eq filter), speed (0.25x–4x via atempo chaining + setpts), volume (0–200%), reverse (video + audio), audio mute, crop, text overlay (configurable font/size/color/position via ffmpeg `drawtext`)
- **Filter presets** — vivid, dramatic, vintage, noir, soft, clarity, warm, cool
- **Video export** — MP4, WebM, AVI, MKV, MOV via ffmpeg re-encoding; format-specific codec args
- **Trim-only optimization** — uses stream copy (no re-encode) when only trim operations are applied
- **Live speed preview** — `playbackRate` set directly on `<video>` element — no re-encode needed
- **AI metadata** — multi-frame extraction (5 keyframes spread across duration) sent to Ollama vision model for description and tags

### 🤖 AI Metadata (Ollama)
- **Automatic tagging** — files sent to a local Ollama vision model for description, 5–10 tags, and 5–10 search keywords; multi-frame extraction for videos
- **Folder tag merging** — tags extracted from parent folder names merged with AI tags
- **Text model** — separate Ollama text model (default `llama3.2`) for non-vision tasks (ingredient analysis, recipe generation)
- **Retrigger** — regenerate AI metadata, EXIF, or thumbnail individually from the viewer sidebar
- **Configurable model** — choose any Ollama vision model (default: `llava`)
- **Pydantic validation** — AI responses validated against `AiMetadataModel` schema (description, tags, search_words)
- **Airplane mode** — set `X-Airplane-Mode: 1` header to disable all external AI/network calls

### 👤 Face Detection & Recognition
- **InsightFace buffalo_l** — ONNX-based face detection with configurable confidence threshold (default 0.3); 512-dimensional embeddings for cross-angle recognition
- **ONNX Runtime providers** — configurable execution provider order (CUDA → TensorRT → CPU fallback)
- **Age & gender estimation** — per-face age and gender metadata stored alongside each detection
- **Auto-grouping** — detected faces matched against known persons via cosine distance (threshold 0.4); new faces auto-grouped into new persons
- **Average encoding** — each Person stores a weighted-average encoding of all their faces; updated on every new detection
- **Batch processing** — images batched (default 5) into single Celery tasks to reuse the loaded model
- **Person management** — rename persons inline (syncs name as tag to all containing files); merge multiple persons into one (recomputes average encoding, sums face count); view all images containing a person
- **Scan all faces** — one-click scan of all unscanned images; modal shows queue count; auto-triggered on import, upload, and edit
- **Tag propagation** — naming a person adds the name as a tag to all containing images (removed on rename)
- **Face viewer** — view detected face thumbnails per image in the file viewer sidebar; name individual faces inline (creates or reuses persons)
- **Person timeline** — timeline view of a person's appearances across files bucketed by year/month/week/day; supports multi-person intersection filtering and date ranges
- **Infinite scroll** — Faces page uses paginated backend (50 per page) with IntersectionObserver for seamless scrolling
- **Case-insensitive name grouping** — persons with the same name (case-insensitive) are grouped into a single combined card showing a 2×2 thumbnail grid, total face count, and group size; edit/delete hidden on combined cards
- **Merge toolbar** — select multiple persons from the faces page and merge them into one; correctly expands combined cards to include all individual IDs
- **Stats** — total persons, faces, named persons, files with faces, average age, gender breakdown

### 📍 Map & Locations
- **GPS visualization** — Leaflet map with clustered markers for all GPS-tagged files; markers grouped by rounded coordinates (3 decimal places)
- **Nearby filtering** — click on the map to find files within a configurable radius (1–100 km slider with explicit Search button); radius only activates on button press, not on slider drag
- **Zoom In on pin** — each pin popup has a "Zoom In" button that flies the map to a configurable zoom level (10–19, default 18 via Settings)
- **Thumbnail gallery** — split-panel layout: map (left) + scrollable thumbnail grid (right); paginated (32 per page via `VITE_MAP_THUMBS_PER_PAGE`)
- **Saved locations** — CRUD management of named locations (name, lat/lng, radius); each location shows the count of files within its radius; click a saved location to navigate and filter the map
- **Tile caching** — OpenStreetMap tiles cached via service worker (cache-first, persistent across sessions)
- **Reverse geocoding** — backend endpoint calls Nominatim API with 1 req/s rate limiting; results cached in Redis by rounded coordinates (4 decimal places)
- **Google Maps link** — every GPS entry shows an `ExternalLink` icon that opens `https://www.google.com/maps?q=lat,lng` in a new tab

### 🔍 Search & Filters
- **Full-text search** — search across filename, tags, AI description, search keywords, **person names** (via `DetectedFace` + `Person` join), and **user memory content** (via `UserMemory` join)
- **Media type filter** — toggle between All / Images / Videos
- **AI filter** — show only files with AI-generated metadata
- **Dimension filter** — preset resolution thresholds (VGA, HD, Full HD, 4K); responsive dropdown on mobile
- **Tag filter** — dropdown with tag search and count badges
- **Sort** — by name, date, or size; asc/desc toggle per column
- **Directory filter** — tree dialog to filter by import directory

### 📊 Statistics
- **Charts** — files by day (bar chart with MIME split), files by MIME type (bar chart), storage by type (pie chart) via Recharts
- **Summary** — total files, total size, per-type breakdown
- **Coverage** — files with GPS, EXIF, AI description, nickname
- **Metadata status** — distribution of metadata extraction states (pending/extracting/completed/failed)
- **Thumbnail status** — distribution of thumbnail generation states
- **Face stats** — persons count, faces count, named persons, average age, gender breakdown
- **Size & dimension distributions** — file size ranges (<1MB to 100+MB) and resolution categories (<1MP to 10+MP)

### 🔄 Duplicate Detection
- **Exact duplicates** — SHA-256 hash grouping via `file_hash` column
- **Near duplicates** — 64-bit difference hash (dhash) with band-indexed lookup; Hamming distance ≤ 10 via `dhash_bands` table (split into 4×16-bit bands for indexed query)
- **Side-by-side comparison** — overlay viewer for reviewing duplicate groups
- **Per-file lookup** — find near-duplicates for any single file

### ❤️ Favorites
- **Toggle** — favorite/unfavorite from the grid or viewer; heart icon with fill animation
- **Filtered view** — dedicated Favorites page with unfavorite inline

### 👁️ Hidden Files
- **PIN-protected access** — 6-digit PIN set via `HIDDEN_FILES_PIN` in backend `.env` (default `"000000"`); unlock in Settings to reveal the Hidden Files tab in the navbar
- **Hide from any view** — EyeOff button on Home thumbnails, Explorer tiles, and FileViewer (both header bar and float actions); hides using a boolean `is_hidden` database flag — no file movement
- **Hidden page** — dedicated `/hidden` page mirrors Home layout (grid, search, sort, mime filters, infinite scroll); requires the `X-Hidden-Pin` header for all requests
- **Unhide** — unhide from the Hidden page or FileViewer; also PIN-guarded with bulk unhide support
- **Excluded from all listings** — hidden files filtered out from `/files`, `/explorer/browse`, `/favorites`, `/duplicates`, `/files/with-gps`, and stats
- **Session state** — unlock status stored in `sessionStorage`; tab disappears on tab close

### 📚 Collections
- **Many-to-many relationship** — `Collection` model via `collection_files` join table; a file can belong to multiple collections; deleting a collection only removes the join rows, not the files
- **Cover image** — optional `cover_file_id` FK on Collection; frontend resolves to thumbnail URL; falls back to first file's thumbnail
- **Zip download** — on-the-fly streaming via `zipfile.ZipFile` in a generator; handles duplicate filenames by appending `_N` suffix; skips files missing from disk
- **FileViewer integration** — `FolderPlus` icon button in both header toolbar and floating overlay toolbar; opens a popover listing all collections with checkmarks for membership
- **Collection detail page** — `/collections/:id` route; shows file grid with remove (X) buttons; "Add Media" modal with search-as-you-type; "Download ZIP" as direct `<a href>` link

### 📝 User Memories (My Notes)
- **One-to-many relationship** — `UserMemory` model FK to `imported_files.id` with `ondelete="CASCADE"`; a file can have many user memories
- **Fields** — `content` (Text, required), `tags` (JSON list, optional), timestamps
- **Backend API** — `GET/POST /api/files/<id>/memories`, `PUT/DELETE /api/memories/<id>`; tags accepted as JSON array or comma-separated string
- **Search integration** — user memory content is included in the ILIKE search alongside description, search_words, tags, filename, and person names
- **FileViewer UI** — "My Notes" section appears above the AI Description in the sidebar; supports inline add, edit, and delete; tags render as small pill badges; uses `StickyNote` icon from lucide-react

### ⚙️ Settings
- **Theme** — dark/light toggle with smooth transition
- **Accent color** — 8 preset accent colors; applied via CSS custom property `--color-primary`
- **Default tab** — choose which page loads on app start
- **Columns** — default grid column layout (auto/1/2)
- **Nickname** — edit default upload nickname
- **Editor Tab Order** — reorder image and video editor tabs via move-up/move-down; persisted to IndexedDB and reflected in the viewer
- **Navbar Tab Order** — reorder navbar tabs via drag-and-drop; persisted to IndexedDB
- **Cache clear** — clear all IndexedDB caches and service worker caches; uses `navigator.serviceWorker.ready` for Chrome PWA compatibility; broadcasts `CLEAR_CACHES` message to all window clients
- **Map Zoom Level** — slider (10–19) with explicit Save button; persisted to IndexedDB and consumed by the Map tab's Zoom In button
- **Shortcuts** — YAML-driven browser shortcut links (`chrome://` URLs); click to copy URL to clipboard with toast confirmation; source file `frontend/src/data/shortcuts.yaml` is git-ignored for local customization

### 🧰 Tools
- **Tool system** — declarative imperative DOM framework; drop a `.js` or `.html` file into `frontend/src/tools/` and it's auto-discovered via `import.meta.glob`; no route, import, or config change needed
- **Barcode Scanner** — scan product barcodes via camera or uploaded image; auto-looks up product info (name, brand, description, price, rating, ingredients, nutritional scores) from 6 sources (Open Food Facts, Datakick, Buycott, BarcodeLookup, SaiSuperMarket) with **per-provider caching** — re-scanning the same barcode shows all cached provider data instantly while refreshing every source in the background
- **3D Globe Explorer** — interactive 3D Earth with OpenStreetMap tile layers, map style switcher, fly-to navigation, Nominatim search autocomplete, and live Open-Meteo weather on click
- **Log Viewer** — real-time IndexedDB log viewer shared across all tools; filter by tool source, color-coded type badges (api_request/api_response/api_error/scan_detected), expandable detail rows, auto-refresh every 3s
- **QR Code Generator** — encode text/URLs into QR codes with configurable size and error correction
- **Photo Editor** — FE-only image editor with upload, edit, and download in the browser; mirrors FileViewer.jsx editor architecture (same filter computation, presets, crop system, histogram, selective color, prominent color extraction); 7 tabs (Filters, Adjust, Light, Effects, Details, Colors, Crop); canvas-based two-pass export to JPEG/PNG/WebP
- **Ingredient Scanner** — analyze ingredient lists via text input; backend parses each ingredient with name, category, function, whole_food/recognizable/additive flags, and E-number detection; async Ollama text model processing with task polling
- **Ingredient Scanner AI** — upload a food label image; two-step pipeline: (1) Ollama vision model extracts all text, (2) text model parses structured ingredients + nutrition data; supports Indian FSSAI nutrition labels (dual-column and single-column); 3 nutrition-based analyses (breakdown, daily values, nutrient density)
- **AI Sanitizer** — sanitize and clean text data using AI
- **Device Sensors** — view live device sensor data (accelerometer, gyroscope, etc.)
- **Ludo** — browser-based Ludo game
- **PDF Tools** — merge, split, and manipulate PDF files
- **Photo to 3D** — convert 2D photos to 3D models
- **System Info** — display detailed system information
- **Sample Three.js** — reference implementation for Three.js tools with OrbitControls and responsive ResizeObserver
- **Tool logging** — shared `tool-logger` module logs API requests/responses/errors and scan events to IndexedDB; filterable and auto-refreshing UI

### 🌐 PWA & Offline
- **Installable** — full PWA manifest with standalone display, theme color (`#1a1a2e`), icon set (192/512 PNG + SVG)
- **Service worker** — 4 cache stores with different strategies:
  | Cache | Strategy | Contents |
  |-------|----------|----------|
  | Shell (`media-server-shell-v1`) | Cache-first | App JS/CSS (precached), `/index.html` |
  | API (`media-server-api-v1`) | Network-first | File listings, metadata, tags (with offline fallback) |
  | Media (`media-server-media-v1`) | Custom (Range-aware) | Full images and videos (Range requests for streaming, background caching for offline) |
  | Map Tiles (`media-server-tiles-v1`) | Cache-first | OpenStreetMap tiles, CartoDB, ArcGIS, NASA imagery |
- **Offline API fallback** — Axios interceptor caches GET responses to IndexedDB; when offline or network error, serves cached responses transparently
- **Registration** — `updateViaCache: "none"`, `CLAIM`/`SKIP_WAITING` message handlers, `controllerchange` listener with debounced reload; works reliably on Chrome mobile/PWA
- **Cache clear** — broadcasts `CLEAR_CACHES` to `{ type: "window" }` clients; all active tabs receive the clear signal
- **Loading animation** — animated gradient blobs, rotating rings, orbiting dots, pulsing icon, and blinking text in `index.html` until React mounts
- **Airplane mode** — toggle in the app to disable all AI/network calls; sets `X-Airplane-Mode: 1` header; geocoding and AI regeneration skip when active

### 🎨 Design System
- **Neumorphic UI** — custom box-shadow system (`--neu-raised`, `--neu-inset`, `--neu-flat`) across all interactive elements
- **Dark/Light themes** — 50+ CSS custom properties; dark base `#0d0d0d`, light base `#e4e4ed`
- **Animations** — 10 CSS-only SpinKit spinner variants (ring, dual-ring, dots, pulse, bars, hourglass, ripple, infinity, grid, circle) with size/color theming
- **Lucide icons** — every button uses a thoughtful lucide-react icon
- **Responsive** — mobile layouts for Faces sidebar, Upload bottom sheet, map layout, viewer padding (buttons no longer hidden behind image content); filter bar collapses to stacked layout with dimension dropdown, full-width tag selector, and evenly-spaced sort buttons on ≤768px

### 🖥️ Docker Deployment
- **9 services** — backend (Flask/Gunicorn), 5 Celery workers (import, metadata, AI, thumbnail, face), frontend (Nginx), PostgreSQL, Redis
- **HTTPS** — self-signed CA + server certificate generated at build time (`entrypoint.sh`); nginx reverse proxy with HTTP/2, TLSv1.2/1.3, and secure ciphers
- **Workers** — separate concurrency settings per queue (import=1, metadata=3, ai=1, thumbnail=3, face=1)
- **Single-worker variant** — `docker-compose.workers.yml` combines all queues into one worker (concurrency=8)
- **Face worker** — InsightFace model volume-mounted from host (`~/.insightface`); `FACE_PROVIDERS=CPUExecutionProvider` for Docker; `FACE_DET_THRESH=0.3`, `FACE_MATCH_THRESHOLD=0.4`; DNS fallback `8.8.8.8`
- **Monitoring** — every service exposes a Prometheus `/metrics` endpoint (backend:9200, workers:9201–9205); `grafana-dashboard.json` provides a pre-built Grafana dashboard with 37 panels
- **Persistent volumes** — PostgreSQL data, Redis data, edited images, media files, uploads, SSL certificates

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
│   │   │   ├── routes.py              # 80+ API endpoints (files, import, upload, explorer, stats, etc.)
│   │   │   ├── face_routes.py         # Face/person API endpoints
│   │   │   └── __init__.py            # API blueprint
│   │   ├── models/
│   │   │   ├── __init__.py            # BaseModel (id, created_at, updated_at)
│   │   │   ├── import_session.py      # ImportSession
│   │   │   ├── imported_directory.py  # ImportedDirectory
│   │   │   ├── imported_file.py       # ImportedFile (files, favorites, hidden)
│   │   │   ├── file_metadata.py       # FileMetadata + DHashBand
│   │   │   ├── ai_metadata.py         # AiMetadataModel (Pydantic schema)
│   │   │   ├── detected_face.py       # DetectedFace
│   │   │   ├── person.py              # Person (face groups)
│   │   │   ├── collection.py          # Collection + collection_files join table
│   │   │   ├── filter_preset.py       # FilterPreset
│   │   │   ├── favorite_folder.py     # FavoriteFolder (explorer favorites)
│   │   │   ├── location.py            # SavedLocation
│   │   │   └── user_memory.py         # UserMemory
│   │   ├── utility/
│   │   │   ├── database_utility.py    # get_or_create_session, get_or_create_metadata
│   │   │   ├── face_utility.py        # InsightFace detection, encoding matching
│   │   │   ├── file_system.py         # traverse_directory
│   │   │   ├── hash_utility.py        # SHA-256, dhash, Hamming distance
│   │   │   ├── image_utility.py       # EXIF extraction, thumbnail generation, HEIC conversion
│   │   │   ├── llm_utility.py         # AI response parser
│   │   │   ├── location_utility.py    # DMS to decimal conversion
│   │   │   ├── mime_utility.py        # MIME type detection (extension, magic bytes)
│   │   │   ├── tags_utility.py        # Folder tag extraction
│   │   │   ├── type_utility.py        # safe_int helper
│   │   │   └── video_utility.py       # ffprobe metadata, ffmpeg frame extraction, video editing
│   │   ├── tasks.py                   # 5 Celery task definitions
│   │   ├── metrics.py                 # Prometheus metrics (HTTP, Celery, file ops, processing, library stats)
│   │   ├── celery_app.py              # Celery app factory + worker init
│   │   ├── config.py                  # App configuration (all env vars with docstrings)
│   │   └── __init__.py                # App factory (create_app)
│   ├── migrations/                    # Alembic migration versions
│   ├── scripts/
│   │   └── regenerate_heic_thumbnails.py
│   ├── tests/
│   │   └── test_api.py                # 14 test cases (pytest, in-memory SQLite)
│   ├── Dockerfile
│   ├── gunicorn.conf.py               # Gunicorn config + metrics server startup
│   └── requirements.txt               # 22 pinned packages
├── frontend/
│   ├── src/
│   │   ├── pages/                     # 15 pages (Home, Gallery, Upload, Explorer, Faces, Map, Stats, Duplicates, Favorites, Hidden, Collections, Settings, Tools, Timeline, About)
│   │   ├── components/                # 6 components (FileViewer, Navbar, Spinner, TreeNode, ToolViewer, CollectionMenuButton)
│   │   ├── services/
│   │   │   ├── api.js                 # Axios client with offline cache + all API functions
│   │   │   ├── db.js                  # IndexedDB wrapper (preferences, cache, tool logs)
│   │   │   └── tool-logger.js         # Shared tool logging module
│   │   ├── contexts/
│   │   │   └── ThemeContext.jsx        # Theme context provider
│   │   ├── hooks/
│   │   │   └── useApi.js              # API hook with loading/error states
│   │   ├── tools/                     # 15 auto-discovered tools
│   │   │   ├── index.js               # import.meta.glob discovery
│   │   │   ├── qr-generator.js
│   │   │   ├── barcode-scanner.js
│   │   │   ├── globe.js
│   │   │   ├── logs.js
│   │   │   ├── photo-editor.js
│   │   │   ├── ingredient-scanner.js
│   │   │   ├── ingredient-scanner-ai.js
│   │   │   ├── ai-sanitizer.js
│   │   │   ├── device-sensors.js
│   │   │   ├── ludo.js
│   │   │   ├── pdf-tools.js
│   │   │   ├── photo-to-3d.js
│   │   │   ├── sample-three.js
│   │   │   ├── system-info.js
│   │   │   └── ...
│   │   ├── index.css                  # Global styles + design tokens
│   │   └── main.jsx                   # React entry point
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sw.js                      # Service worker (4 cache stores)
│   │   └── icons/                     # PWA icons (192/512 PNG + SVG)
│   ├── index.html                     # Loading animation (blobs, rings, dots)
│   ├── nginx.conf                     # HTTPS reverse proxy config
│   ├── entrypoint.sh                  # SSL cert generation + envsubst
│   ├── vite.config.js
│   ├── eslint.config.js
│   └── Dockerfile                     # Multi-stage build (node:22 → nginx:alpine)
├── docker-compose.yml                 # 7 application services (metrics ports 9200-9205)
├── docker-compose.infra.yml           # PostgreSQL + Redis
├── docker-compose.workers.yml         # Combined-worker variant (metrics ports 9200-9201)
├── grafana-dashboard.json             # 37-panel Prometheus/Grafana dashboard
├── scripts/
│   └── docker-restart                 # Rebuild & restart a single Docker service (interactive)
├── assets/
│   └── grafana-dashboards/
│       └── media_dashboard.json       # Duplicate of grafana-dashboard.json
├── docs/
│   └── face-detection.md              # In-depth face pipeline documentation
├── Makefile                           # 30+ targets
├── AGENTS.md                          # Project conventions for AI agents
├── new_tool_prompt.md                 # Reusable LLM prompt for generating new tools
├── notes.md                           # Developer scratch notes
├── todo.md                            # Project TODO/bug list
├── .env.example                       # Root env template
└── README.md
```

## Database Models (12 tables)

| Model | Table | Key Fields | Purpose |
|-------|-------|------------|---------|
| `BaseModel` | (abstract) | id, created_at, updated_at | Base for all models |
| `ImportSession` | `import_sessions` | root_path, mime_groups, total_files | Import folder tracking |
| `ImportedDirectory` | `imported_directories` | session_id, path, name, parent_path, deleted | Directory hierarchy |
| `ImportedFile` | `imported_files` | session_id, directory_id, filename, file_path, mime_type, size, is_favorite, is_hidden, nickname, deleted | File records |
| `FileMetadata` | `file_metadata` | file_id (1:1), exif, lat/lng, date_taken, width/height, duration, tags, description, search_words, file_hash, dhash, thumbnail, metadata_status, thumbnail_status | Per-file metadata |
| `DHashBand` | `dhash_bands` | metadata_id, band_index, band_value | Near-duplicate indexed lookup |
| `DetectedFace` | `detected_faces` | file_id, person_id, encoding, bounding_box, confidence, thumbnail, age, gender, face_status | Per-face detections |
| `Person` | `persons` | name, thumbnail, face_count, avg_encoding, meta_info | Named/unnamed person groups |
| `SavedLocation` | `saved_locations` | name, lat, lng, radius | Map saved locations |
| `Collection` | `collections` | name, description, cover_file_id | File collections |
| `collection_files` | `collection_files` | collection_id, file_id | Many-to-many join table |
| `FilterPreset` | `filter_presets` | name, operations, file_id | Saved edit filter presets |
| `FavoriteFolder` | `favorite_folders` | path, name | Explorer folder favorites |
| `UserMemory` | `user_memories` | file_id, content, tags | User notes on files |

## Database Indexes

The following indexes are defined across 9 tables to support query performance:

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
| `imported_files` | `is_hidden` | Single | Hidden files filtering |
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

Or use Docker with separate or combined workers (metrics ports auto-exposed):

```bash
docker compose up -d                                    # separate workers (9200-9205)
docker compose -f docker-compose.workers.yml up -d      # combined worker (9200-9201)
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:5173** (proxies `/api` to backend).

## Developer Productivity

### Makefile Targets (30+)

The project provides a comprehensive Makefile for common development tasks:

#### Setup
| Target | Description |
|--------|-------------|
| `make venv` | Create Python virtualenv |
| `make pip-install` | Install Python dependencies |
| `make backend-env` | Copy .env.example to .env |
| `make db-create` | Create PostgreSQL database `media_server` |
| `make backend-setup` | Full backend setup (venv + pip + .env + db + migrations) |
| `make frontend-setup` | Frontend setup (npm install + .env) |
| `make ollama-pull` | Pull default Ollama vision model (`llava`) |

#### Database Migrations
| Target | Description |
|--------|-------------|
| `make db-migrate "msg"` | Generate new migration |
| `make db-upgrade` | Apply pending migrations |
| `make db-downgrade` | Rollback one migration |
| `make db-current` | Show current migration revision |
| `make db-history` | Show full migration history |
| `make db-stamp rev=xxxx` | Stamp DB at a specific revision |

#### Development Servers
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

#### Testing & Build
| Target | Description |
|--------|-------------|
| `make test` | Run backend pytest suite |
| `make lint` | Run frontend ESLint |
| `make build` | Build frontend for production |
| `make preview` | Preview production frontend build |

#### Docker
| Target | Description |
|--------|-------------|
| `make restart` | Interactive menu to rebuild/restart a single Docker service |
| `make logs` | Interactive menu to tail logs for a Docker service |

#### Utility
| Target | Description |
|--------|-------------|
| `make celery-purge` | Purge all pending Celery tasks |

### Scripts

- **`backend/scripts/regenerate_heic_thumbnails.py`** — Standalone script to regenerate thumbnails for all HEIC/HEIF files in the database. Run via `python scripts/regenerate_heic_thumbnails.py` or `docker compose exec backend python scripts/regenerate_heic_thumbnails.py`.
- **`scripts/docker-restart`** — Python script for rebuilding and restarting a single Docker Compose service with spinner animation and colored output.
- **`frontend/entrypoint.sh`** — Container entrypoint that generates self-signed SSL certs and configures nginx.

### Queue Name Configuration

Celery queue names are dynamically read from `backend/.env` at build time. Configurable via environment variables:
- `CELERY_QUEUE_IMPORT` (default: `import_queue`)
- `CELERY_QUEUE_METADATA` (default: `metadata`)
- `CELERY_QUEUE_AI` (default: `ai_metadata`)
- `CELERY_QUEUE_THUMBNAIL` (default: `thumbnail`)
- `CELERY_QUEUE_FACE` (default: `face_queue`)

### Docker Commands

```bash
docker compose up -d                          # Start all services
docker compose -f docker-compose.infra.yml up -d  # Start infra (PG + Redis)
docker compose -f docker-compose.workers.yml up -d  # Combined worker
docker compose exec backend python scripts/regenerate_heic_thumbnails.py  # Run script
```

### Code Quality

- **Backend**: `pytest` with in-memory SQLite for fast tests
- **Frontend**: ESLint + Prettier for consistent code style
- **Pre-commit**: No pre-commit hooks configured

### Troubleshooting

- **Database already exists**: `make db-create` is idempotent — it silently skips if the database exists
- **Face worker DNS**: Docker face worker uses `8.8.8.8` as DNS fallback for network stability
- **HEIC support**: Requires `libheif-dev` (Debian) and `pillow-heif` Python package

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

## Monitoring

The backend and all workers expose Prometheus metrics at `/metrics` for real-time observability. A Grafana dashboard is included at `grafana-dashboard.json` with 37 panels across 9 rows.

### Metrics Endpoints

| Service | Container | Port |
|---------|-----------|------|
| Backend (Flask) | `media_server_be` | 9200 |
| Worker Import | `media_server_w_import` | 9201 |
| Worker Metadata | `media_server_w_metadata` | 9202 |
| Worker AI | `media_server_w_ai` | 9203 |
| Worker Thumbnail | `media_server_w_thumb` | 9204 |
| Worker Face | `media_server_w_face` | 9205 |

### Metrics Collected

**HTTP** — request rate, duration (p50/p95/p99), error rate (4xx/5xx), in-flight requests per method.

**Celery Tasks** — task rate, duration, success/failure count, retry rate per task type (import, metadata, AI, thumbnail, face).

**File Operations** — import, delete, serve, download, edit, export (by format: jpeg/png/webp/heic/pdf/ascii/mp4/webm/avi/mkv/mov).

**Processing Pipeline** — metadata extraction (success/failure), thumbnail generation, AI description (success/failure), face detection (faces detected + new persons created, duration), face scans queued.

**Upload & Explorer** — upload file rate, upload byte rate, explorer operations (rename/move/copy/delete), geocode cache hit/miss rate.

**Library Statistics** — total files (active/deleted), library size in bytes, total sessions, total unique tags, tagged file count, files by MIME category, persons, detected faces, unprocessed files by step.

**Process Resources** — resident memory, virtual memory, CPU usage, open file descriptors.

### Grafana Dashboard Rows

| Row | Panels |
|-----|--------|
| HTTP Overview | Request rate, duration (p50/p95/p99), active requests, top endpoints by rate |
| Celery Tasks | Task rate by type, duration (p50/p95), success vs failure, retry rate |
| File Operations | Import/delete rate, serve/download rate, edit rate, export rate by format |
| Uploads | Upload rate (files + bytes), explorer ops rate, geocode cache hit/miss |
| Processing Pipeline | Metadata extraction, thumbnail generation, AI description, face detection rates |
| Pending Processing | Unprocessed by step, files by MIME category |
| Library Statistics | Total files, deleted files, library size, sessions, tags, tagged files, persons, faces |
| Face Processing | Face detection duration, scans queued, persons created |
| Process Resources | Resident/virtual memory, CPU usage, open FDs |

### Adding to Prometheus

```yaml
scrape_configs:
  - job_name: 'media-server'
    static_configs:
      - targets:
        - 'media_server_be:9200'
        - 'media_server_w_import:9201'
        - 'media_server_w_metadata:9202'
        - 'media_server_w_ai:9203'
        - 'media_server_w_thumb:9204'
        - 'media_server_w_face:9205'
```

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
| GET | `/api/files/hidden` | PIN-guarded hidden files list |
| GET | `/api/files/<id>` | Single file details |
| PATCH | `/api/files/<id>/favorite` | Toggle favorite |
| PATCH | `/api/files/<id>/toggle-hidden` | Toggle file hidden status |
| PATCH | `/api/files/<id>/tags` | Update tags (replaces array) |
| PATCH | `/api/files/<id>/metadata` | Update date_taken |
| POST | `/api/files/verify-hidden-pin` | Validate hidden files PIN |
| POST | `/api/files/unhide` | PIN-guarded bulk unhide |
| GET | `/api/files/<id>/serve` | Serve file (images auto-resized >1MB; HEIC/HEIF converted to JPEG) |
| GET | `/api/files/<id>/download` | Force download (as_attachment) |
| GET | `/api/files/<id>/metadata` | Full metadata (EXIF, GPS, AI, tags, thumbnail) |
| GET | `/api/files/<id>/thumbnail` | Base64 thumbnail |
| GET | `/api/files/<id>/near-duplicates` | Perceptually similar images (dhash, Hamming ≤ 10) |
| GET | `/api/files/<id>/faces` | Faces detected in a file |
| GET | `/api/files/<id>/memories` | List user memories for a file |
| POST | `/api/files/<id>/memories` | Create user memory |
| POST | `/api/files/<id>/edit` | Apply image/video edits (saves new file) |
| POST | `/api/files/<id>/export` | Export processed file (jpeg/png/webp/heic/pdf/ascii) |
| POST | `/api/files/<id>/export-video` | Export video (mp4/webm/avi/mkv/mov) |
| POST | `/api/files/<id>/regenerate-ai` | Retrigger AI metadata |
| POST | `/api/files/<id>/regenerate-exif` | Retrigger EXIF extraction |
| POST | `/api/files/<id>/regenerate-thumbnail` | Retrigger thumbnail generation |
| POST | `/api/files/<id>/detect-faces` | Trigger face detection for file |
| DELETE | `/api/files/<id>` | Hard-delete file (optional delete_storage) |

### Import & Upload
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/import` | Import media folder (creates session + dispatches Celery tasks) |
| GET | `/api/browse-fs` | Browse local filesystem (for import dialog) |
| GET | `/api/sessions` | List import sessions |
| GET | `/api/sessions/<id>` | Session details |
| GET | `/api/sessions/<id>/browse` | Browse session directory tree |
| DELETE | `/api/sessions/<id>` | Delete session |
| GET | `/api/directories` | List imported directories (tree structure) |
| POST | `/api/upload` | Upload files (multipart, with nickname + optional directory) |
| GET | `/api/upload/directories` | List upload subdirectories |
| POST | `/api/upload/directories` | Create upload subdirectory |
| POST | `/api/upload/directories/delete` | Soft-delete upload directory + all children (+ filesystem) |
| POST | `/api/upload/files/delete` | Soft-delete upload files by file_ids and/or paths |
| POST | `/api/upload/move` | Move files/directories within upload area |
| POST | `/api/upload/copy` | Copy files/directories within upload area |
| POST | `/api/upload/rename` | Rename file or directory in upload area |
| GET | `/api/upload/files/recent` | List recent (100) non-deleted upload files |
| GET | `/api/upload/nicknames` | List distinct upload nicknames |

### Media Explorer
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/explorer/browse` | Unified browsing across sessions (pagination, dedup) |
| POST | `/api/explorer/rename` | Rename file or directory |
| POST | `/api/explorer/move` | Move items within/across sessions |
| POST | `/api/explorer/copy` | Copy items to target location |
| POST | `/api/explorer/delete` | Hard delete files/directories |
| GET | `/api/explorer/favorites` | List favorited folders |
| POST | `/api/explorer/favorites` | Add folder favorite |
| DELETE | `/api/explorer/favorites` | Remove folder favorite |

### Tags & Favorites
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/tags` | Tag frequency list (sorted by frequency) |
| GET | `/api/favorites` | Favorited files (non-deleted, non-hidden) |

### Duplicates
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/duplicates` | Exact (SHA-256) and near-duplicate groups (dhash Hamming ≤ 10) |

### Filters
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/filters` | List custom filter presets |
| POST | `/api/filters` | Save/upsert filter preset |
| DELETE | `/api/filters/<id>` | Delete filter preset |

### Locations
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/locations` | List saved locations (with file counts within radius) |
| POST | `/api/locations` | Save location |
| PUT | `/api/locations/<id>` | Update location |
| DELETE | `/api/locations/<id>` | Delete location |
| GET | `/api/files/with-gps` | Paginated GPS-tagged files with thumbnails |

### Faces & Persons
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/persons` | Paginated persons list (search by name, sort by face_count) |
| PUT | `/api/persons/<id>` | Rename person (syncs name as tag) |
| DELETE | `/api/persons/<id>` | Delete person (faces become unassigned) |
| GET | `/api/persons/<id>/faces` | Paginated faces for a person |
| GET | `/api/persons/<id>/files` | Paginated files containing a person |
| GET | `/api/persons/<id>/timeline` | Timeline of person's appearances (year/month/week/day buckets) |
| POST | `/api/persons/scan` | Queue face detection for unscanned files |
| POST | `/api/persons/merge` | Merge multiple persons into one |
| GET | `/api/faces` | List faces (optionally filtered by person) |
| GET | `/api/faces/stats` | Face detection statistics |
| PUT | `/api/faces/<id>` | Name/rename a face (creates or reuses person) |

### Collections
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/collections` | List collections (optional file_id for membership check) |
| POST | `/api/collections` | Create collection (name unique, case-insensitive) |
| GET | `/api/collections/<id>` | Get collection with file list + cover thumbnail |
| PUT | `/api/collections/<id>` | Update name/description/cover_file_id |
| DELETE | `/api/collections/<id>` | Delete collection (files not affected) |
| POST | `/api/collections/<id>/files` | Add files to collection (deduplicates) |
| DELETE | `/api/collections/<id>/files` | Remove files from collection |
| GET | `/api/collections/<id>/download` | Download collection as ZIP |

### User Memories
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/files/<id>/memories` | List memories for a file |
| POST | `/api/files/<id>/memories` | Create memory |
| PUT | `/api/memories/<id>` | Update memory |
| DELETE | `/api/memories/<id>` | Delete memory |

### Tools
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/tools/ingredient-scanner/analyze` | Analyze ingredient text (async Ollama) |
| GET | `/api/tools/ingredient-scanner/result/<id>` | Poll ingredient analysis result |
| POST | `/api/tools/ingredient-scanner-ai/analyze` | Analyze food label image (vision + text pipeline) |
| GET | `/api/tools/ingredient-scanner-ai/result/<id>` | Poll AI ingredient analysis result |
| POST | `/api/tools/barcode-scanner/stats` | Log barcode scan events |
| POST | `/api/tools/barcode-scanner/sync` | Log cart sync events |

### System & Geocoding
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check |
| GET | `/api/status` | API status |
| GET | `/api/geocode/reverse` | Reverse geocode lat/lng (Nominatim, rate-limited, cached) |
| POST | `/api/stats/refresh` | Refresh Prometheus library stats gauges |
| GET | `/api/stats` | System statistics (files, size, types, coverage, face stats) |
| GET | `/api/trash` | List trashed files |
| POST | `/api/trash/empty` | Permanently delete all trashed files |
| POST | `/api/trash/restore/<id>` | Restore trashed file |
