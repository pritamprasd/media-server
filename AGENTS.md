# AGENTS.md - Media Server Repository

> **MUST**: Before making any feature change or feature addition, read this file in full and ensure the change is consistent with all documented patterns and decisions below. Add a new entry under the relevant section for every decision made during the change.

## MUST DOs:
1. Update README.md and the relevant `docs/*.md` file on each feature addition/update — add new features to `docs/features.md`, update API endpoints in `docs/api-endpoints.md`, configuration in `docs/configuration.md`, developer productivity in `docs/developer-guide.md`, and architecture in `docs/architecture.md` as needed.
2. Provide a one line commit message as last line of the output.

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
- **Config docstrings**: Every attribute in `backend/app/config.py` must have a docstring-style comment explaining what changing that value affects (e.g., what breaks, what improves, the tradeoff). One-liner section headers are not sufficient; describe the observable impact.

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

## Key Patterns & Decisions

### General Rules
- **No auto-save on slider drag**: Sliders that persist settings (map zoom level) or trigger expensive computations (map search radius) use a separate explicit Save/Search button. The slider controls a "draft" state; only the button commits it.
- **Pencil hint as sole click target**: When a UI element has both a navigation action and a customization action, the customization trigger is always the smaller/supplementary control (pencil icon), never the primary tile/icon. The primary click navigates.
- **IntersectionObserver over scroll events**: Infinite scroll uses IntersectionObserver with 200px root margin for simplicity and modern browser support; a Load More button remains as fallback.
- **IndexedDB for UI-only persistence**: All user preferences and UI state (folder styles, editor tab order, navbar tab order, map zoom level) go to IndexedDB via `getPref`/`setPref` (in `frontend/src/services/db.js`). Backend persistence (database) is for data, not UI state.

### Prometheus Metrics Architecture
- **Flask app**: `/metrics` served via Flask route on port 5000 AND standalone prometheus HTTP server on `FLASK_METRICS_PORT` (default 9200). The standalone server is started by gunicorn's `when_ready` hook in `backend/gunicorn.conf.py` so it runs only once in the master process (not in each worker).
- **Celery workers**: Each worker starts its own prometheus HTTP server on `WORKER_METRICS_PORT` via the `worker_ready` signal in `backend/app/metrics.py:188-191`.
- **MultiProcessCollector**: Both use `PROMETHEUS_MULTIPROC_DIR` env var with `MultiProcessCollector` to aggregate metrics across gunicorn worker processes / Celery child processes. All metrics write to `.db` files in that directory.
- **Port mapping conventions**:
  - `backend`: API on 5000 → host `15020`, metrics on 9200 → host `9200`
  - Docker compose: 5 separate workers on ports 9201–9205, or single worker on 9201 (`docker-compose.workers.yml`)

### Colors Tab (FileViewer)
- **Grayscale exclusion**: Colors with RGB range (max-min) ≤ 15 are filtered out from the top 20 to avoid picking up near-white/black/near-gray values.
- **Similar-color merging**: Within `extractProminentColors`, shades with Euclidean distance ≤ 30 in 0–255 RGB space are merged by weighted average (weighted by pixel count).
- **Multi-select with toggle**: `selectedColors` is an array of `{r,g,b}` objects; clicking a swatch toggles it in/out. Backwards compatibility maintained: backend `_apply_selective_color` checks for `colors` array first, falls back to legacy single `color`.
- **Swatch display**: CSS `auto-fill, minmax(120px, 1fr)` grid with vertical swatch layout; each swatch shows an area percentage (`pct`) label.

### Upload Tab
- **MIME type filter**: Compact icon-only button group (All / Images / Videos) in toolbar right area. Filter is client-side — directories always pass through; files are filtered by `mime_type` prefix. State: `mimeGroup` (`""`, `"image"`, `"video"`).
- **Video play overlay**: When a video file has a generated thumbnail, a small circular play icon (`.upload__tile-play`) is overlaid at bottom-left of the thumbnail to distinguish videos from images. Uses `Play` Lucide icon with `fill="currentColor"` inside a `rgba(0,0,0,0.6)` circle.

### Media Explorer
- **Strict folder hierarchy**: `directory_id` FK on `ImportedFile` is the source of truth. `relative_path` is NOT used for tree traversal. The `explorer_browse()` endpoint enforces root-level = directories only (no files); files only appear when browsing into a subdirectory.
- **Synthetic session folders**: Non-upload sessions with root-only files get a synthetic directory entry with `path = "__session_{session.id}__"`. Parsed by `prefix.startswith("__session_")` → `int(prefix.split("_")[2])` to get the session ID.
- **No upload-session exclusion**: The `explorer_browse` endpoint does NOT filter out the upload session — all sessions' files appear in Explorer. The `seen_paths` dedup logic prevents duplicate directory entries.
- **Folder icon/color per path**: Customizations stored as a single IndexedDB key `explorer_folder_styles = { [relative_path]: { icon: string, color: string } }`. Supports 13 Lucide icons and 10 color options.
- **File operations guards**: `explorer_delete` must `DetectedFace.query.filter_by(file_id=...).delete()` before hard-deleting any `ImportedFile` to avoid FK NOT NULL violations (autoflush cascade). `FileMetadata` has no `date_added` column — do not reference it in metadata copy constructors. `move_items` and `copy_items` handle both `ImportedFile` and `ImportedDirectory` — when no file matches `relative_path`, they fall back to querying `ImportedDirectory.path`. Directory moves update child dirs/files via `LIKE` prefix matching on `old_prefix = src_path + "/"`. Helper functions `_move_dir_tree` and `_copy_dir_tree` encapsulate recursive directory tree operations. **`file_path` must always be kept in sync with `relative_path`**: every code path that updates `ImportedFile.relative_path` (move, rename, directory tree operations) must also update `file_path = os.path.join(upload_dir, relative_path)`. Stale `file_path` causes `serve_file` to return "not on disk" even though the file exists at the new location. This applies to both `explorer_service.py` (rename_item, _move_dir_tree) and `upload_routes.py` (move_upload_items, rename_upload_item).
- **Batch edit**: When files are selected in Explorer, an "Edit" button appears in the toolbar. Opens a modal (`explorer__modal`) to batch-set `date_taken` (datetime picker) and add a UserMemory note (textarea + tags). Calls `POST /api/files/batch-metadata` and `POST /api/files/batch-memories`. Only file items (not directories) are editable.
- **Folder deletion with filesystem cleanup**: `explorer_delete` deletes both database records AND filesystem files/directories (`os.remove` for files, `shutil.rmtree` for directories). Resolves full path from `ImportSession.root_path` + `relative_path`.
- **Thumbnail size slider**: Auto-saves to IndexedDB on every drag (no Save button). Lives on its own row below the toolbar (after the New dropdown). Uses `--thumb-pct` inline style driving the filled-track gradient. Small `Grid3X3` (14px, muted) on left = "small", large `Grid3X3` (22px, primary) on right = "large". Live `Npx` label via `.explorer__thumb-label`. Grid columns driven by `--thumb-size` CSS variable on `.explorer__items--grid`.
- **Upload duplicate skip**: Before processing each uploaded file, the backend pre-fetches all `(filename, size)` pairs from the target directory (non-deleted `ImportedFile` rows). If a match is found, the file is deleted from disk immediately and added to a `skipped` list. The response includes `{"saved": [...], "skipped": [...], "errors": [...]}`. Newly uploaded files are added to the in-memory set so intra-batch duplicates within the same request are also caught.
- **Folder count badge**: Each directory item in `explorer_browse` response includes `file_count` and `dir_count` fields. Backend aggregates counts across duplicate `ImportedDirectory` rows that share the same path (from different sessions) using `SUM()` for files and `count(DISTINCT path)` for child dirs. Uses raw SQL `ANY()` for batch queries. Frontend renders a small count badge (`.explorer__tile-count`) at top-left of the folder thumbnail in grid view, and a descriptive tooltip (`title` attribute) on hover. List view shows the count text in `.explorer__tile-meta`.
- **Thumbnail URL, not inline base64**: `explorer_browse` does NOT send base64 thumbnails inline — response returns `thumbnail_status` only. Frontend constructs `/api/files/{id}/thumbnail` URLs directly, which the service worker caches in the `thumbs` cache (cache-first). This reduces the response from ~3.3MB to ~48KB for 100 files. Any new list/browse endpoint that returns file thumbnails must follow this pattern — never embed base64 data in list responses.
- **Raw SQL ANY() for batch queries**: All `IN (...)` clauses on `file_metadata` (and similar large tables) use raw SQL `= ANY(:ids)` instead of ORM `.in_()`. SQLAlchemy's `in_()` generates individual positional parameters which are 50x slower than PostgreSQL's `ANY(ARRAY[...])` for the `file_metadata` table (~100ms vs ~2ms for 100 IDs).

### Map
- **Explicit search**: The distance radius slider (1–100 km) controls a `pendingKm` draft state. Only clicking the "Search" button copies it to the active `nearbyKm` state, triggering `filteredMarkers` recalculation. Map click and Zoom In also sync `pendingKm = nearbyKm` so the slider reflects the active radius.
- **Zoom In button on pin popups**: Flies the map to the configured `mapZoomLevel` (default 18, range 10–19, set in Settings). `MapController` receives `zoomToCoords` and `mapZoomLevel` as props; the zoom effect uses `mapZoomLevel` directly rather than `map.getMaxZoom() - 1`.
- **Map zoom level settings**: Persisted to IndexedDB as `mapZoomLevel`. Settings UI shows a range slider + explicit "Save" button (not auto-save on drag).

### Settings — Shortcuts
- **YAML-driven shortcuts**: `frontend/src/data/shortcuts.yaml` (git-ignored) defines browser shortcuts as a flat list of `{ url, label, description }`. Loaded via `@modyfi/vite-plugin-yaml` in Vite.
- **Copy-to-clipboard**: `chrome://` URLs can't be opened via `<a href>`. Clicking a shortcut copies the URL to clipboard with a green checkmark toast for 2s. Fallback: `window.open()` if clipboard API fails.
- **HTTP shortcuts open in new tab**: Non-internal URLs (anything not starting with `chrome://`, `about:`, or `edge://`) are opened directly via `window.open(url, "_blank")` instead of being copied — e.g. the `API Docs (Swagger)` shortcut points to the in-app `/docs` route.
- **Adding shortcuts**: Append entries to `shortcuts.yaml`. `chrome://` and related browser-internal links belong here (they copy to clipboard); same-site HTTP links (e.g. `/docs`) are also allowed and will open in a new tab.

### Theme System (Style + Mode)
- **Two-axis theme**: `data-style` (neumorphic|material|offbeat) × `data-mode` (dark|light) on `<html>` gives 6 theme combinations. Persisted to IndexedDB as `themeStyle` and `themeMode`.
- **ThemeContext API**: `useTheme()` returns `{ style, mode, setStyle, setMode, toggleMode }`. `toggleMode` flips dark/light (used by Navbar button). `setStyle` switches between neumorphic, material, and offbeat.
- **CSS variable architecture**: `index.css` defines variables under `[data-style="X"][data-mode="Y"]` selectors. All components use `var(--color-*)` and `var(--neu-*)` — theme switching is instant via attribute change.
- **`--color-accent`**: Added to all 6 theme blocks. Offbeat theme uses a distinct accent (`sage green #7a9e7e` dark / `#6b8f6b` light) for subtle button hover tints. Neumorphic and material set accent equal to primary. Global offbeat rules tint `.viewer-btn` and `.upload__btn` hover with `color-mix(in srgb, var(--color-accent) 10%, transparent)`.
- **Offbeat theme**: Warm, earthy palette (terracotta primary, sage accent) with neumorphic-style dual shadows. Hover on non-primary buttons gets a subtle sage tint. Active nav links keep primary (terracotta).
- **Material theme (MUI)**: `@mui/material` + `@emotion/react` + `@emotion/styled` are installed but **lazy-loaded** via `MaterialThemeWrapper.jsx` → dynamic `import("./MuiThemeProvider")`. Vite code-splits MUI into a separate chunk (~31KB gzip) that is only fetched when `style === "material"`. Service worker caches MUI chunk in `media-server-mui-v1` cache.
- **Adding a new theme style**: Add entry to `frontend/src/config/themes.js`, add CSS variable block in `index.css` with `[data-style="newstyle"][data-mode="dark|light"]` selectors, include `--color-accent`, and optionally create a lazy-loaded theme wrapper if it needs external dependencies.
- **Missing CSS variables**: `--color-border`, `--color-surface-light`, `--color-success`, `--color-accent` are now defined in all 6 theme blocks. Use these with fallbacks: `var(--color-success, #2ecc71)`.
- **Subtle dark mode icons**: `[data-mode="dark"] svg` gets `opacity: 0.85` and filled icons get `opacity: 0.9` to reduce visual harshness on dark backgrounds. Dark mode palettes use muted primary colors (neumorphic: `#e0525e`, material: `#a87be0`, offbeat: `#c67a4b`).

### Settings Page Architecture
- **Registry pattern**: `frontend/src/config/settings.js` exports `SETTINGS` array — each entry has `{ id, label, icon, description }`. Adding a new setting = adding an entry to this array + implementing `renderDialogContent(id)` case in `Settings.jsx`.
- **Minimal rows + dialog**: Settings page renders a flat list of clickable rows (icon + label + summary). Clicking opens a `SettingsDialog` (custom portal-based modal, not MUI) with full controls. Dialog uses `.sd-*` CSS classes, supports Escape key and backdrop click to close.
- **Draggable row reorder**: Each settings row has a `GripVertical` drag handle (visible on hover, opacity 0.3→0.7). HTML5 native drag-and-drop with `settingsOrder` state persisted to IndexedDB via `getPref`/`setPref` key `'settingsOrder'`. CSS classes: `.settings__row--dragging` (opacity 0.4 + inset shadow), `.settings__row--drop` (primary color bottom border).
- **Mobile dialog**: On screens ≤768px, dialog slides up from bottom (sheet style) instead of centering.
- **Accent color independence**: Accent color (`--color-primary` override via `document.documentElement.style`) persists across theme style changes. User can reset to theme default via Settings.
- **Portrait mode lock**: "Screen Orientation" setting uses `screen.orientation.lock("portrait")` API. Only effective in standalone PWA mode (installed to home screen). Preference stored in IndexedDB as `orientationLock`, applied on app load in `App.jsx`. Manifest default is `"portrait"`. Fails silently on unsupported browsers/fullscreen-only restrictions.
- **Per-cache clearing**: Cache breakdown rows each have an individual "Clear" button that sends `CLEAR_SINGLE_CACHE` to the SW. SW deletes only the named cache and replies `SINGLE_CACHE_CLEARED`, triggering a fresh `GET_CACHE_STATUS` to update counts. Each cache has a short description (App Shell, API Calls, Thumbnails, Media, Map Tiles, MUI Fonts). Key mapping uses SW's CACHES object keys (`shell`, `api`, `thumbs`, `media`, `tiles`, `mui`). Thumbnail requests (`/api/files/<id>/thumbnail`) are routed to the dedicated `thumbs` cache via cache-first; full media (`/api/files/<id>/serve`) stays in `media`; all other `/api/` GETs go to `api`.
- **Admin Tasks PIN gate**: Admin PIN stored in backend config (`ADMIN_PIN` env var, default `000000`). Verified server-side via `POST /admin/verify-pin` (sends `X-Admin-Pin` header). On page load, section is always locked until correct PIN entered. Lock/unlock state is session-only (`sessionStorage` keys `admin_pin` and `admin_pin_unlocked`, resets on page refresh). Change PIN flow: enter current PIN (backend-verified) → enter new PIN (backend saves to in-memory config). All admin bulk/tag endpoints are protected by `@require_admin_pin` decorator. Admin task rows are disabled (`.settings__row--locked`, opacity 0.4) when locked.
- **Hidden Files PIN change**: `POST /files/change-hidden-pin` endpoint accepts `{ old_pin, new_pin }`, validates old PIN against `current_app.config["HIDDEN_FILES_PIN"]`, updates the config at runtime (in-memory only — does not persist to `.env`). Frontend shows "Change PIN" button when unlocked; flow: enter current PIN → enter new PIN → backend validates old → updates config. Uses `hiddenPinMode` state (`"unlock"` | `"change"` | `"set-new"`) to drive the multi-step form.
- **Bulk tag management**: `POST /admin/tags/rename` and `POST /admin/tags/delete` endpoints in `admin_routes.py`. Rename uses PostgreSQL `jsonb_agg(DISTINCT elem)` with `CASE WHEN` to replace old tag with new tag across all files (deduplicates automatically). Delete uses `jsonb_array_elements` filter to remove the tag, setting `tags = NULL` when array becomes empty. Both use raw SQL via `db.session.execute(text(...))`. Frontend `admin-tags` dialog lists all tags with rename (inline input) and delete (window.confirm) actions. Tags loaded via `GET /api/tags` on dialog open.

### Faces Tab
- **Case-insensitive name grouping**: `displayPersons` computed via `useMemo` groups persons by `(p.name || "").toLowerCase()`. Combined entries have `_combined: true`, `id: number[]`, `_persons: original[]`, `thumbnails: string[]`.
- **Combined-card constraints**: Edit/delete buttons hidden on combined cards. Operations use `loadId = selectedPerson._combined ? selectedPerson._persons[0].id : selectedPerson.id` for backend calls (backend doesn't support multi-person queries).
- **Merge toolbar**: The merge toolbar (`selectedIds` set) correctly adds all individual IDs from combined cards, so merge-all-of-same-name works as expected.
- **Multi-select delete**: The `selectedIds` set (shared with merge) also powers batch delete. A "Delete N" button appears when `selectedIds.size >= 1`. Calls `POST /api/persons/batch-delete` which un-links faces and deletes persons in one DB transaction.
- **Reload after operation**: After name-save, delete, merge, or batch-delete, `reloadAfterOperation()` re-fetches page 1 plus all previously loaded pages (2 through `personPage`) to preserve the user's scroll context. This avoids the "load more → operation → page resets to 1" problem.
- **Auto-load on filter**: When switching to "Named" or "Unnamed" filter, if the filtered count is below 20, `autoLoadForFilter()` automatically fetches subsequent pages until the threshold is met or no more pages exist. Uses a `prevFilterMode` ref to avoid re-triggering on every render.
- **Name propagation to matching faces**: When a face is named in FileViewer (`PUT /api/faces/<id>`), the backend finds all unnamed faces with similar embeddings (cosine distance < `FACE_MATCH_THRESHOLD` = 0.3) and assigns them to the same person. Returns `propagated_count` in response. The avg_encoding is recomputed from all matched encodings. Frontend re-fetches file faces after naming to pick up propagated changes on the current file.

### Tools Tab
- **Tool discovery**: `frontend/src/tools/index.js` uses `import.meta.glob` to auto-discover all `.js` and `.html` files in `frontend/src/tools/`. No registration needed — dropping a file there automatically adds it to the `/tools` grid.
- **JS tool format** (recommended): Export the following from a `.js` file:
  ```js
  export const name = "Display Name";
  export const description = "Short description shown on the tile";
  export function init(container) { /* imperative setup, return optional cleanup fn */ }
  export function destroy(container) { /* teardown */ }
  ```
  - `init(container)` receives a `<div>` DOM element — append UI to it. Return a cleanup function if needed (called before `destroy`).
  - `destroy(container)` is called on unmount; set `container.innerHTML = ''` at minimum.
  - Use `container.style.cssText` or class-based styling with `var(--color-*)` CSS variables for theme support.
  - Example: `frontend/src/tools/qr-generator.js`, `frontend/src/tools/sample-three.js`.
- **HTML tool format**: Drop a `.html` file; it renders in an iframe with `sandbox="allow-scripts allow-same-origin"`. The filename (minus extension) becomes the display name.
- **Dependencies**: Install via `npm install <pkg>` in `frontend/`. Tools use bare imports (ESM) — Vite bundles them.
- **Three.js tools**: Import from `three` and `three/examples/jsm/controls/OrbitControls.js`. Dispose geometries, materials, renderer, and cancel animation frame in cleanup. See `frontend/src/tools/sample-three.js`.
- **Styling**: Use inline `cssText` or create elements with classes. Available CSS variables: `--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-primary`, `--color-surface`, `--radius`, `--neu-raised-sm`, `--neu-flat`, `--neu-inset-sm`.
- **Grid tile**: Shows tool name, description (from exports), and a JS/HTML type badge. No thumbnail customization yet.
- **Fullscreen view**: Clicking a tile navigates to `/tools/:toolId`. The ToolViewer component renders with a mandatory back button (top-left arrow or browser back). Tool fills entire viewport below the header.
- **Adding a tool**: just create the `.js` or `.html` file in `frontend/src/tools/` and re-build. No route, import, or config changes needed.
- **OCR preprocessing**: The Ingredient Scanner applies canvas-based preprocessing before Tesseract.js: grayscale conversion, unsharp mask (0.8 strength), binarization, and upscaling to 1200px min dimension. All in `preprocessImageForOCR` before `init`.

### Photo Editor Tool
- **FE-only image editor**: `frontend/src/tools/photo-editor.js` — upload, edit, and download images entirely in the browser with no backend processing.
- **Architecture mirrors FileViewer.jsx editor**: Same `computePreviewFilter()` computation (brightness/contrast/saturation/vibrance/warmth/tint/clarity/dehaze/exposure/highlights/shadows/blacks/whites/grayscale/colorize), same 9 filter presets (FILTERS array), same crop coordinate system (normalized0-1), same rotate/flip operations array, same selective color algorithm (Euclidean distance in RGB space), same histogram (luminance bins with HSL-colored bars), same prominent color extraction (quantize→merge→sort).
- **Canvas export**: Renders final image to `<canvas>` via two-pass approach: (1) temp canvas with `ctx.filter` + rotation/flip transform, (2) crop via `drawImage` source rect, then post-processing: selective color pixel manipulation, grain random noise, vignette radial gradient, colorize `globalCompositeOperation: 'color'` overlay. Exports as JPEG/PNG/WebP via `canvas.toBlob()`.
- **No save-as**: No backend API calls. All processing in FE. Download only.
- **7 tabs**: Filters (preset grid with thumbnail previews), Adjust (7 sliders), Light (5 sliders), Effects (vignette/grain/colorize/grayscale), Details (clarity/dehaze), Colors (selective color picker with tolerance), Crop (aspect ratios + rotate/flip + drag handles).
- **Crop preview**: CSS `clip-path: inset()` + `box-shadow: 0 0 0 9999px` overlay dimming + 4 corner drag handles with aspect ratio locking. Same mouse event handling as FileViewer.jsx crop.
- **Presets**: Save/apply/delete named presets capturing all edits (excluding crop). Stored in IndexedDB as `photoEditorPresets`. Preset captures: `adjust`, `activeFilter`, `operations`, `selectedColors`, `colorTolerance`. Saved presets also appear as a "Saved Presets" section at the bottom of the Filters tab, with apply and delete (×) actions directly on each chip.
- **Color grid no-rerender**: Swatch click toggles `.pe-colors-swatch--active` class in-place and updates the "Clear all" counter text directly — does NOT call `renderColorsTab()` to avoid destroying/recreating the entire DOM. Full re-render only happens on `extractColors()` (tolerance change) and "Clear all" button.

### Video Editor Tool
- **FE-only video editor**: `frontend/src/tools/video-editor.js` — upload, preview, trim, and adjust videos entirely in the browser.
- **Architecture mirrors photo-editor.js**: Same `el()` DOM helper, same tab system, same toolbar + preview + panel layout, same toast notifications, same resetAll pattern.
- **WebGL GPU-accelerated rendering**: Hidden `<video>` element plays source; a `<canvas>` with WebGL context renders each frame via fragment shader. All adjustments (brightness, contrast, saturation, vibrance, warmth, tint, exposure, highlights, shadows, whites, blacks, grayscale, sepia) are applied as GLSL uniforms — edits apply live during playback with zero CSS filter overhead.
- **Fragment shader pipeline**: Vertex shader passes UV coords; fragment shader applies exposure (exponential), brightness (composite of shadows/highlights/blacks/whites), contrast, luminance-weighted saturation, vibrance (saturation-of-saturation boost), warmth (color temperature), tint (blue/red shift), grayscale, and sepia (luminance-matrix blend). Rotate/flip via UV coordinate transform.
- **2D canvas fallback**: When WebGL is unavailable, falls back to plain `drawImage` on 2D canvas (no filters, preview only). GPU badge shows ⚡ GPU or ⚗ CPU.
- **HTML5 video preview**: `<video>` element with `playsInline`, hidden; `<canvas>` displays rendered output. Click on either toggles play/pause.
- **Timeline**: Progress bar with seek, draggable trim handles (start/end), trim region visualization. Render loop syncs with `requestAnimationFrame` — each tick uploads the current video frame to the WebGL texture and draws.
- **Trim**: Set start/end via timeline handles or "Set to Current" buttons. Preview trim plays from start to end, auto-stops at trim end.
- **6 tabs**: Trim (timeline + time inputs + info), Adjust (7 sliders), Light (4 sliders), Effects (grayscale toggle + sepia slider), Speed (playback rate 0.25×–4× with presets), Rotate (4 buttons: rotate L/R, flip H/V — applied via UV transform in shader).
- **Frame extraction**: Renders current frame through WebGL pipeline (or 2D fallback) to `<canvas>` → PNG download with applied filters.
- **Download with filters**: Uses `MediaRecorder` + `canvas.captureStream()` to record the GPU-rendered canvas output while video plays through, producing a new WebM video file with all adjustments baked in. Audio from the original video is mixed in via `videoEl.captureStream()`. "⏳ Rendering..." badge shows during export; play/pause/extract disabled while rendering. Button text: "⏳ Rendering..." (not "Recording...").
- **Render cache**: After rendering, the output blob is cached in memory (`lastRenderedBlob`) with a hash of all edit parameters (`lastRenderedHash`). If the user clicks Download again without changing any parameters, the cached blob is re-downloaded instantly without re-rendering. Cache is invalidated on `resetAll()` or video source change.
- **Tab duplication fix**: `renderTrimTab()`, `renderSpeedTab()`, and `renderRotateTab()` all clear `tabContent.innerHTML` at the start. This prevents DOM duplication when these functions are called directly (from button clicks, drag-end, or reset) rather than through `renderTabContent()`.
- **Presets**: Save/apply/delete named presets capturing all edits (excluding trim). Stored in IndexedDB as `videoEditorPresets`. Preset captures: `adjust`, `operations`, `speed`. Saved presets also appear as a "Saved Presets" section at the bottom of the Adjust tab, with apply and delete (×) actions directly on each chip.

### Ingredient Scanner — Nutrition Facts
- **Auto-detect from OCR text**: `runAnalysis()` searches for `nutrition (information|facts|label|values?|data)` in the OCR text and splits it: text before is treated as ingredients, text from the match onwards as nutrition data. Both sections parsed independently.
- **Indian FSSAI format**: `parseNutritionFacts()` handles dual-column (per serving + per 100g) and single-column (per 100g) Indian nutrition labels. Parses 11 nutrients via regex line-by-line. kJ→kcal conversion via divide by 4.184.
- **3 nutrition-based analyses**: `nutrition_breakdown` (per-serving energy/macros), `daily_values` (%DV estimates on 2000 kcal diet), `nutrient_density` (beneficial-to-concerning nutrient ratio). All require `nutritionData` with at least one `per100g` value to activate.
- **Nutrition panel in results**: Renders a CSS grid table with 3 columns (Nutrient / Per serving / Per 100g) between the ingredient list and analysis cards. Only shows rows for detected nutrients.

### Collections
- **Many-to-many relationship**: `Collection` model via `collection_files` join table. A file can belong to multiple collections. Deleting a collection only removes the join rows, not the files.
- **Cover image**: Optional `cover_file_id` FK on Collection. Frontend resolves to thumbnail URL via `/api/files/{id}/thumbnail`. Falls back to first file's thumbnail if no cover set.
- **Zip download**: On-the-fly streaming via `zipfile.ZipFile` in a generator. Handles duplicate filenames by appending `_N` suffix. Skips files missing from disk.
- **FileViewer integration**: `FolderPlus` icon button in both header toolbar and floating overlay toolbar. Opens a popover listing all collections with checkmarks for membership. Toggle via `addFilesToCollection`/`removeFilesFromCollection` API calls.
- **Collection detail page**: `/collections/:id` route. Shows file grid with remove (X) buttons. "Add Media" modal with search-as-you-type. "Download ZIP" as direct `<a href>` link.

### Duplicates
- **is_primary flag**: `ImportedFile.is_primary` (Boolean, default False). When True, the file is excluded from both exact and near duplicate detection queries. The "Keep" button (ShieldCheck icon) on each card toggles `is_primary` via `PATCH /api/files/<id>/primary` and removes the file from the current duplicates view.
- **Exact duplicates**: Backend groups `FileMetadata` rows by `file_hash` (SHA-256), filtering out `is_primary` files. Returns groups with count > 1.
- **Near duplicates**: Backend does O(n²) pairwise comparison of `dhash` values with band pre-filter (3/4 match required) and hamming distance <= 10. Excludes `is_primary` files.

### FileViewer — AI Description Regeneration
- **"Delete & Regenerate" button**: Shown when `meta.description` exists AND `metadata_status === "completed"`. Calls `regenerateAiMetadata(file.id)` then polls `getFileMetadata(file.id)` every 2 seconds (max 30 attempts) until `metadata_status` becomes `"completed"` or `"failed"`. Uses `pollRef.current` for cleanup.
- **EXIF data collapsed by default**: `exifExpanded` state defaults to `false`. The EXIF section (`.viewer-exif-toggle`) is collapsed with a `▶` arrow; clicking toggles `max-height` between 0 and 300px via `.viewer-exif-content--expanded`. Previously defaulted to `true` on desktop.
- **Location loading state**: `locationLoading` state set to `true` while `reverseGeocode` is in-flight. Shows a Spinner icon next to "Location" label in the meta sidebar while geocoding is pending. Backend `reverse_geocode` in `routes.py` only caches successful results (no `None` cache entries).
- **Float buttons mobile UX**: On screens ≤768px, float buttons reduced to 34px (from 40px), gap to 0.35rem, icon SVGs scaled to 14px via CSS. Close button retains 16px. `.viewer-float-btn--zoom` is always 34px.
- **Zoom hover buttons**: `.viewer-zoom-controls` div positioned absolutely at bottom-right of `.viewer-body`. Hidden by default (`opacity: 0`), shown on `.viewer-body:hover` (`opacity: 1`). Contains ZoomOut button, percentage label, and ZoomIn button. Uses existing `zoom` state (0.25–5x range, step via ×1.2/÷1.2). On mobile (≤768px), always visible and centered at bottom.

### User Memories (My Notes)
- **One-to-many relationship**: `UserMemory` model FK to `imported_files.id` with `ondelete="CASCADE"`. A file can have many user memories.
- **Fields**: `content` (Text, required), `tags` (JSON list, optional), timestamps.
- **Backend API**: `GET/POST /api/files/<id>/memories`, `PUT/DELETE /api/memories/<id>`. Tags accepted as JSON array or comma-separated string.
- **Search integration**: User memory content is included in the ILIKE search alongside `description`, `search_words`, `tags`, `filename`, and person names — both in `GET /api/files` and `GET /api/files/hidden`.
- **FileViewer UI**: "My Notes" section appears above the AI Description in the sidebar. Supports inline add, edit, and delete. Tags render as small pill badges. Uses `StickyNote` icon from lucide-react.
- **CSS classes**: `.viewer-mem-*` namespace in `FileViewer.css` — all use neumorphic variables for theme consistency.

### Cron Service (Standalone Container)
- **Location**: `cron-service/` directory, separate from the main media-server codebase.
- **Stack**: Flask + Flask-SocketIO + APScheduler + SQLite + subprocess tasks. Jinja2 templates (no React). Deployed via `cron-service/docker-compose.cron.yml`.
- **Port**: 5010. No shared network with the main media-server Docker services.
- **Database**: SQLite at `cron-service/data/cron.db`. Two tables: `cron_job` (schedule definitions with `task_type` + `params` JSON) and `task_run` (execution history + output logs).
- **Pluggable task types**: `app/task_types/` package with registry. Each type is a Python module that calls `register()` with name, description, form fields, validate, execute, and cancel functions. Currently only `rsync` is built-in. Add new types by creating `app/task_types/<name>.py`.
- **Field types**: `path` (with filesystem browser), `text`, `textarea`, `select`, `number`. Task type schemas are served via `/api/task-types/<key>`.
- **File browser**: `/api/browse?path=` lists host directory contents. Paths shown to user are real host paths (without `/host` prefix); backend prepends `/host` for container access.
- **Cron helper**: `/api/cron/parse?expr=` returns human-readable description + next 5 run times. Frontend shows live preview as user types cron expression.
- **Live updates**: Flask-SocketIO with gevent async mode. Clients join `task_{id}` rooms; server emits `task_progress`, `task_complete` events per line.
- **YAML config**: `config/jobs.yaml` is the source of truth on startup (synced into SQLite via upsert-by-name). UI edits write back to both SQLite and YAML (bidirectional sync).
- **Makefile targets**: `make cron-setup`, `make cron-service`, `make cron-docker`, `make cron-docker-down`.
- **No Postgres, no Redis**: entirely self-contained. Uses gevent for concurrent WebSocket + subprocess handling.
- **Dark theme**: Full dark CSS with GitHub-inspired color palette (--bg: #0d1117, --surface: #1c2128, --primary: #58a6ff).
- **Schema note**: Upgrading from the original rsync-only version requires deleting `data/cron.db` — the schema changed to support pluggable task types (added `task_type`, `params` columns; removed `source`, `destination`, `extra_flags`).

## Production Deployment
- Nginx reverse proxy with HTTPS, HTTP/2 support
- Auto-generated SSL certificates at build time
- Separate containers for each Celery queue for scalability
- All edits go to edited-images directory (~/media-server-edited)


## Developer Productivity
- Keep `docs/developer-guide.md` up to date with all Makefile targets, scripts, helper files, and utility commands. The README links to it from its Documentation table.
- When adding a new feature, check if any new Makefile targets, scripts, Docker compose changes, or developer helper files are needed and document them there.
- See `docs/developer-guide.md` for the current reference.