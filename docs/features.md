# Features

This document is the complete feature reference. For a short highlight, see the [README](../README.md#features).

## 📂 Media Import & Management
- **Recursive directory scan** — import folders without copying files; filters by MIME type groups (image, video, audio, document)
- **Import sessions** — each import creates a session; re-importing the same folder updates in-place (removes stale files, adds new ones)
- **Upload** — drag-and-drop zone + file picker; nickname field persisted to IndexedDB; multi-file upload with progress bars; optional subdirectory selection; duplicate detection (same filename + size in target folder) skips redundant files and shows a summary with skipped count
- **Upload directory management** — browse, create, rename, move, copy, and delete directories and files within the upload area; clipboard (cut/copy/paste) and inline rename
- **Local filesystem browser** — navigate the host filesystem from the import dialog to select folders
- **Trash** — soft-delete files (library-only or library + disk)
- **Nickname persistence** — default nickname stored in IndexedDB, editable from Settings
- **Media Explorer** — unified file-browser-style page (grid/list view) across all sessions with breadcrumb navigation; paginated browsing (100 per page, load-more button + IntersectionObserver infinite scroll); strict folder hierarchy enforced via `directory_id` FK (not `relative_path` string matching); centered layout capped at 1600px / 90% viewport width; batch edit (date taken + notes) via toolbar modal when files selected; folder deletion removes both DB records and filesystem files/directories; folder tile shows file+folder count badge (top-left) with tooltip breakdown on hover
- **Folder favorites** — star-toggle any folder in the explorer and see favorites as quick-navigation chips above the breadcrumbs; persisted via `FavoriteFolder` model (DB-backed)
- **Folder customization** — click the pencil hint on any folder tile to choose from 13 Lucide icons and 10 colors, persisted per-folder in IndexedDB (`explorer_folder_styles`)
- **Synthetic session folders** — non-upload sessions with root-only files get a synthetic directory entry (`__session_{id}__`) in the explorer
- **File operations** — rename, move (within/across sessions), copy, and delete files and directories from the explorer; metadata is preserved/duplicated as appropriate

## 🖼️ Gallery & File Viewer
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

## ✏️ Image Editing
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

## 🎬 Video Support
- **Metadata extraction** — duration, dimensions, codec, frame rate via ffprobe
- **Thumbnails** — keyframe extraction via ffmpeg (frame at 30% duration)
- **Video editing operations** — trim (start/end time), rotate (90/-90/180), brightness/contrast/saturation/warmth (eq filter), speed (0.25x–4x via atempo chaining + setpts), volume (0–200%), reverse (video + audio), audio mute, crop, text overlay (configurable font/size/color/position via ffmpeg `drawtext`)
- **Filter presets** — vivid, dramatic, vintage, noir, soft, clarity, warm, cool
- **Video export** — MP4, WebM, AVI, MKV, MOV via ffmpeg re-encoding; format-specific codec args
- **Trim-only optimization** — uses stream copy (no re-encode) when only trim operations are applied
- **Live speed preview** — `playbackRate` set directly on `<video>` element — no re-encode needed
- **AI metadata** — multi-frame extraction (5 keyframes spread across duration) sent to Ollama vision model for description and tags

## 🤖 AI Metadata (Ollama)
- **Automatic tagging** — files sent to a local Ollama vision model for description, 5–10 tags, and 5–10 search keywords; multi-frame extraction for videos
- **Folder tag merging** — tags extracted from parent folder names merged with AI tags
- **Text model** — separate Ollama text model (default `llama3.2`) for non-vision tasks (ingredient analysis, recipe generation)
- **Retrigger** — regenerate AI metadata, EXIF, or thumbnail individually from the viewer sidebar
- **Configurable model** — choose any Ollama vision model (default: `llava`)
- **Pydantic validation** — AI responses validated against `AiMetadataModel` schema (description, tags, search_words)
- **Airplane mode** — set `X-Airplane-Mode: 1` header to disable all external AI/network calls

## 👤 Face Detection & Recognition
- **InsightFace buffalo_l** — ONNX-based face detection with configurable confidence threshold (default 0.3); 512-dimensional embeddings for cross-angle recognition
- **ONNX Runtime providers** — configurable execution provider order (CUDA → TensorRT → CPU fallback)
- **Age & gender estimation** — per-face age and gender metadata stored alongside each detection
- **Auto-grouping** — detected faces matched against known persons via cosine distance (threshold 0.4); new faces auto-grouped into new persons
- **Average encoding** — each Person stores a weighted-average encoding of all their faces; updated on every new detection
- **Batch processing** — images batched (default 5) into single Celery tasks to reuse the loaded model
- **Person management** — rename persons inline (syncs name as tag to all containing files); merge multiple persons into one (recomputes average encoding, sums face count); view all images containing a person
- **Scan all faces** — one-click scan of all unscanned images; modal shows queue count; auto-triggered on import, upload, and edit
- **Tag propagation** — naming a person adds the name as a tag to all containing images (removed on rename)
- **Face viewer** — view detected face thumbnails per image in the file viewer sidebar; name individual faces inline (creates or reuses persons); naming propagates to all unnamed faces with similar embeddings (cosine distance < 0.3)
- **Person timeline** — timeline view of a person's appearances across files bucketed by year/month/week/day; supports multi-person intersection filtering and date ranges
- **Infinite scroll** — Faces page uses paginated backend (50 per page) with IntersectionObserver for seamless scrolling
- **Case-insensitive name grouping** — persons with the same name (case-insensitive) are grouped into a single combined card showing a 2×2 thumbnail grid, total face count, and group size; edit/delete hidden on combined cards
- **Merge toolbar** — select multiple persons from the faces page and merge them into one; correctly expands combined cards to include all individual IDs
- **Batch delete** — select one or more persons and delete them in one action; faces are unlinked (person_id set to NULL), not deleted; batch endpoint `POST /api/persons/batch-delete`
- **Reload after operation** — name-save, delete, merge, and batch-delete re-fetch all previously loaded pages to preserve scroll context (no more "load more → operation → reset to page 1")
- **Auto-load on filter** — switching to Named/Unnamed filter auto-fetches more pages if the current filtered count is below 20, so the view isn't empty after filtering
- **Stats** — total persons, faces, named persons, files with faces, average age, gender breakdown

See also [docs/face-detection.md](face-detection.md) for the in-depth pipeline.

## 📍 Map & Locations
- **GPS visualization** — Leaflet map with clustered markers for all GPS-tagged files; markers grouped by rounded coordinates (3 decimal places)
- **Nearby filtering** — click on the map to find files within a configurable radius (1–100 km slider with explicit Search button); radius only activates on button press, not on slider drag
- **Zoom In on pin** — each pin popup has a "Zoom In" button that flies the map to a configurable zoom level (10–19, default 18 via Settings)
- **Thumbnail gallery** — split-panel layout: map (left) + scrollable thumbnail grid (right); paginated (32 per page via `VITE_MAP_THUMBS_PER_PAGE`)
- **Saved locations** — CRUD management of named locations (name, lat/lng, radius); each location shows the count of files within its radius; click a saved location to navigate and filter the map
- **Tile caching** — OpenStreetMap tiles cached via service worker (cache-first, persistent across sessions)
- **Reverse geocoding** — backend endpoint calls Nominatim API with 1 req/s rate limiting; results cached in Redis by rounded coordinates (4 decimal places)
- **Google Maps link** — every GPS entry shows an `ExternalLink` icon that opens `https://www.google.com/maps?q=lat,lng` in a new tab

## 🔍 Search & Filters
- **Full-text search** — search across filename, tags, AI description, search keywords, **person names** (via `DetectedFace` + `Person` join), and **user memory content** (via `UserMemory` join)
- **Media type filter** — toggle between All / Images / Videos
- **AI filter** — show only files with AI-generated metadata
- **Dimension filter** — preset resolution thresholds (VGA, HD, Full HD, 4K); responsive dropdown on mobile
- **Tag filter** — dropdown with tag search and count badges
- **Sort** — by name, date, or size; asc/desc toggle per column
- **Directory filter** — tree dialog to filter by import directory

## 📊 Statistics
- **Charts** — files by day (bar chart with MIME split), files by MIME type (bar chart), storage by type (pie chart) via Recharts
- **Summary** — total files, total size, per-type breakdown
- **Coverage** — files with GPS, EXIF, AI description, nickname
- **Metadata status** — distribution of metadata extraction states (pending/extracting/completed/failed)
- **Thumbnail status** — distribution of thumbnail generation states
- **Face stats** — persons count, faces count, named persons, average age, gender breakdown
- **Size & dimension distributions** — file size ranges (<1MB to 100+MB) and resolution categories (<1MP to 10+MP)

## 🔄 Duplicate Detection
- **Exact duplicates** — SHA-256 hash grouping via `file_hash` column
- **Near duplicates** — 64-bit difference hash (dhash) with band-indexed lookup; Hamming distance ≤ 10 via `dhash_bands` table (split into 4×16-bit bands for indexed query)
- **Keep flag** — "Keep" button (ShieldCheck icon) on each card toggles `is_primary` on `ImportedFile`, excluding the file from all duplicate detection queries
- **Side-by-side comparison** — overlay viewer for reviewing duplicate groups
- **Per-file lookup** — find near-duplicates for any single file

## ❤️ Favorites
- **Toggle** — favorite/unfavorite from the grid or viewer; heart icon with fill animation
- **Filtered view** — dedicated Favorites page with unfavorite inline

## 👁️ Hidden Files
- **PIN-protected access** — 6-digit PIN set via `HIDDEN_FILES_PIN` in backend `.env` (default `"000000"`); unlock in Settings to reveal the Hidden Files tab in the navbar
- **Hide from any view** — EyeOff button on Home thumbnails, Explorer tiles, and FileViewer (both header bar and float actions); hides using a boolean `is_hidden` database flag — no file movement
- **Hidden page** — dedicated `/hidden` page mirrors Home layout (grid, search, sort, mime filters, infinite scroll); requires the `X-Hidden-Pin` header for all requests
- **Unhide** — unhide from the Hidden page or FileViewer; also PIN-guarded with bulk unhide support
- **Excluded from all listings** — hidden files filtered out from `/files`, `/explorer/browse`, `/favorites`, `/duplicates`, `/files/with-gps`, and stats
- **Session state** — unlock status stored in `sessionStorage`; tab disappears on tab close

## 📚 Collections
- **Many-to-many relationship** — `Collection` model via `collection_files` join table; a file can belong to multiple collections; deleting a collection only removes the join rows, not the files
- **Cover image** — optional `cover_file_id` FK on Collection; frontend resolves to thumbnail URL; falls back to first file's thumbnail
- **Zip download** — on-the-fly streaming via `zipfile.ZipFile` in a generator; handles duplicate filenames by appending `_N` suffix; skips files missing from disk
- **FileViewer integration** — `FolderPlus` icon button in both header toolbar and floating overlay toolbar; opens a popover listing all collections with checkmarks for membership
- **Collection detail page** — `/collections/:id` route; shows file grid with remove (X) buttons; "Add Media" modal with search-as-you-type; "Download ZIP" as direct `<a href>` link

## 📝 User Memories (My Notes)
- **One-to-many relationship** — `UserMemory` model FK to `imported_files.id` with `ondelete="CASCADE"`; a file can have many user memories
- **Fields** — `content` (Text, required), `tags` (JSON list, optional), timestamps
- **Backend API** — `GET/POST /api/files/<id>/memories`, `PUT/DELETE /api/memories/<id>`; tags accepted as JSON array or comma-separated string
- **Search integration** — user memory content is included in the ILIKE search alongside description, search_words, tags, filename, and person names
- **FileViewer UI** — "My Notes" section appears above the AI Description in the sidebar; supports inline add, edit, and delete; tags render as small pill badges; uses `StickyNote` icon from lucide-react

## ⚙️ Settings
- **Theme** — dark/light toggle with smooth transition
- **Accent color** — 8 preset accent colors; applied via CSS custom property `--color-primary`
- **Default tab** — choose which page loads on app start
- **Columns** — default grid column layout (auto/1/2)
- **Nickname** — edit default upload nickname
- **Editor Tab Order** — reorder image and video editor tabs via move-up/move-down; persisted to IndexedDB and reflected in the viewer
- **Navbar Tab Order** — reorder navbar tabs via drag-and-drop; persisted to IndexedDB
- **Settings Row Order** — reorder settings rows via drag-and-drop; grip handle appears on hover; persisted to IndexedDB
- **Cache clear** — clear all IndexedDB caches and service worker caches; uses `navigator.serviceWorker.ready` for Chrome PWA compatibility; broadcasts `CLEAR_CACHES` message to all window clients; shows per-cache entry breakdown with individual "Clear" buttons and short descriptions (App Shell: HTML/CSS/JS/icons, API Calls: backend data, Thumbnails: image thumbnails, Media: photos/videos, Map Tiles: OpenStreetMap tiles, MUI Fonts: Material UI fonts)
- **Map Zoom Level** — slider (10–19) with explicit Save button; persisted to IndexedDB and consumed by the Map tab's Zoom In button
- **Shortcuts** — YAML-driven browser shortcut links (`chrome://` URLs); click to copy URL to clipboard with toast confirmation; source file `frontend/src/data/shortcuts.yaml` is git-ignored for local customization
- **Screen Orientation** — lock screen to portrait mode in standalone PWA mode (installed to home screen); preference stored in IndexedDB; uses `screen.orientation.lock()` API; fails silently on unsupported browsers
- **Admin Tasks** — a dedicated section with background maintenance jobs, each opening a dialog with a Run button that queues the work and reports how many files were queued:
  - **Generate AI Descriptions** — queues one `generate_ai_metadata` Celery task per file missing an AI description
  - **Generate EXIF Data** — queues metadata extraction for all files missing EXIF/metadata
  - **Generate Thumbnails** — queues thumbnail generation for all files missing a thumbnail
  - **Detect & Save Faces** — queues face detection for all image files not yet scanned
  - **Manage Tools** — enable/disable individual tools in the Tools tab; disabled tools are hidden from the grid and persisted to IndexedDB (`disabledTools`)

## 🧰 Tools
- **Tool system** — declarative imperative DOM framework; drop a `.js` or `.html` file into `frontend/src/tools/` and it's auto-discovered via `import.meta.glob`; no route, import, or config change needed
- **Barcode Scanner** — scan product barcodes via camera or uploaded image; auto-looks up product info (name, brand, description, price, rating, ingredients, nutritional scores) from 6 sources (Open Food Facts, Datakick, Buycott, BarcodeLookup, SaiSuperMarket) with **per-provider caching** — re-scanning the same barcode shows all cached provider data instantly while refreshing every source in the background
- **3D Globe Explorer** — interactive 3D Earth with OpenStreetMap tile layers, map style switcher, fly-to navigation, Nominatim search autocomplete, and live Open-Meteo weather on click
- **Log Viewer** — real-time IndexedDB log viewer shared across all tools; filter by tool source, color-coded type badges (api_request/api_response/api_error/scan_detected), expandable detail rows, auto-refresh every 3s
- **QR Code Generator** — encode text/URLs into QR codes with configurable size and error correction
- **Photo Editor** — FE-only image editor with upload, edit, and download in the browser; mirrors FileViewer.jsx editor architecture (same filter computation, crop system, histogram, selective color, prominent color extraction); 7 tabs (Filters, Adjust, Light, Effects, Details, Colors, Crop); canvas-based two-pass export to JPEG/PNG/WebP; saveable presets (adjust, filter, operations, selective color) stored in IndexedDB; presets also shown in Filters tab for quick apply
- **Video Editor** — FE-only video editor with upload, preview, and download; WebGL GPU-accelerated rendering via fragment shader (all adjustments applied as GLSL uniforms — live preview during playback); hidden `<video>` plays source, `<canvas>` displays filtered output; 6 tabs (Trim, Adjust, Light, Effects, Speed, Rotate); timeline with draggable trim handles, speed control (0.25×–4×), rotate/flip via UV transform, frame extraction to PNG; download records canvas output via `MediaRecorder` + `captureStream` with audio mix-in; render cache (re-downloads cached blob if no edits changed); "⏳ Rendering..." badge during export; 2D canvas fallback when WebGL unavailable; saveable presets (adjust, operations, speed) stored in IndexedDB; presets shown in Adjust tab
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

## 🌐 PWA & Offline
- **Installable** — full PWA manifest with standalone display, theme color (`#1a1a2e`), icon set (192/512 PNG + SVG)
- **Service worker** — 5 cache stores with different strategies:
  | Cache | Strategy | Contents |
  |-------|----------|----------|
  | Shell (`media-server-shell-v1`) | Cache-first | App JS/CSS (precached), `/index.html` |
  | API (`media-server-api-v1`) | Network-first | File listings, metadata, tags (with offline fallback) |
  | Thumbnails (`media-server-thumbs-v1`) | Cache-first | Image thumbnails for fast grid browsing |
  | Media (`media-server-media-v1`) | Custom (Range-aware) | Full images and videos (Range requests for streaming, background caching for offline) |
  | Map Tiles (`media-server-tiles-v1`) | Cache-first | OpenStreetMap tiles, CartoDB, ArcGIS, NASA imagery |
  | MUI (`media-server-mui-v1`) | Cache-first | Lazy-loaded Material UI chunk (when Material theme is selected) |
- **Offline API fallback** — Axios interceptor caches GET responses to IndexedDB; when offline or network error, serves cached responses transparently
- **Registration** — `updateViaCache: "none"`, `CLAIM`/`SKIP_WAITING` message handlers, `controllerchange` listener with debounced reload; works reliably on Chrome mobile/PWA
- **Cache clear** — broadcasts `CLEAR_CACHES` to `{ type: "window" }` clients; all active tabs receive the clear signal; shows per-cache entry breakdown (App Shell, API Calls, Thumbnails, Media, Map Tiles, MUI Fonts) via `GET_CACHE_STATUS` message to service worker; each entry has its own Clear button via `CLEAR_SINGLE_CACHE`
- **Loading animation** — animated gradient blobs, rotating rings, orbiting dots, pulsing icon, and blinking text in `index.html` until React mounts
- **Airplane mode** — toggle in the app to disable all AI/network calls; sets `X-Airplane-Mode: 1` header; geocoding and AI regeneration skip when active

## 🎨 Design System
- **Theme system (Style × Mode)** — two-axis theming: Style (Neumorphic / Material) × Mode (Dark / Light) gives 4 theme combinations; persists to IndexedDB as `themeStyle` and `themeMode`; toggle mode via navbar sun/moon button, select style from Settings
- **Neumorphic UI** — custom box-shadow system (`--neu-raised`, `--neu-inset`, `--neu-flat`) across all interactive elements
- **Material Design theme** — MUI (`@mui/material` + `@emotion`) lazy-loaded only when Material style is selected; Vite code-splits into separate ~31KB gzip chunk; service worker caches in `media-server-mui-v1` cache
- **CSS variables** — 20+ custom properties per theme block; `--color-border`, `--color-surface-light`, `--color-success` defined across all 4 variants
- **Accent color** — independent accent color override (`--color-primary`) persists across theme style changes; reset to theme default via Settings
- **Animations** — 10 CSS-only SpinKit spinner variants (ring, dual-ring, dots, pulse, bars, hourglass, ripple, infinity, grid, circle) with size/color theming
- **Lucide icons** — every button uses a thoughtful lucide-react icon
- **Responsive** — mobile layouts for Faces sidebar, Upload bottom sheet, map layout, viewer padding (buttons no longer hidden behind image content); filter bar collapses to stacked layout with dimension dropdown, full-width tag selector, and evenly-spaced sort buttons on ≤768px
- **Settings page** — minimal card rows (icon + label + summary) that open portal-based dialogs with full controls; mobile dialogs slide up from bottom

## 🖥️ Deployment (Docker)
- **9 services** — backend (Flask/Gunicorn), 5 Celery workers (import, metadata, AI, thumbnail, face), frontend (Nginx), PostgreSQL, Redis
- **HTTPS** — self-signed CA + server certificate generated at build time (`entrypoint.sh`); nginx reverse proxy with HTTP/2, TLSv1.2/1.3, and secure ciphers
- **Workers** — separate concurrency settings per queue (import=1, metadata=3, ai=1, thumbnail=3, face=1)
- **Single-worker variant** — `docker-compose.workers.yml` combines all queues into one worker (concurrency=8)
- **Face worker** — InsightFace model volume-mounted from host (`~/.insightface`); `FACE_PROVIDERS=CPUExecutionProvider` for Docker; `FACE_DET_THRESH=0.3`, `FACE_MATCH_THRESHOLD=0.4`; DNS fallback `8.8.8.8`
- **Monitoring** — every service exposes a Prometheus `/metrics` endpoint (backend:9200, workers:9201–9205); `grafana-dashboard.json` provides a pre-built Grafana dashboard with 37 panels
- **Persistent volumes** — PostgreSQL data, Redis data, edited images, media files, uploads, SSL certificates

See [docs/monitoring.md](monitoring.md) for metrics details.

## Cron Service (Standalone Container)

- **Separate container** — Flask + Jinja2 + SQLite service running on port 5010, deployed via `cron-service/docker-compose.cron.yml`
- **Rsync-based sync** — incremental copy using `rsync -avz --progress --stats`; skips identical files automatically; supports local-to-local and remote SSH sync
- **Live progress** — WebSocket (Flask-SocketIO) streams rsync output line-by-line to the browser with filename and percentage updates
- **Cron scheduling** — APScheduler with cron expressions; jobs defined in `config/jobs.yaml` and synced bidirectionally with SQLite
- **Tasks page** — running tasks show live terminal output; history table with status, duration, and full log expand
- **Job management** — create, edit, enable/disable, delete, and manually trigger jobs from the web UI
- **Task cancellation** — running rsync processes can be cancelled via SIGTERM from the UI
