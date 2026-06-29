# AGENTS.md - Media Server Repository

> **MUST**: Before making any feature change or feature addition, read this file in full and ensure the change is consistent with all documented patterns and decisions below. Add a new entry under the relevant section for every decision made during the change.

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

## Key Patterns & Decisions

### General Rules
- **No auto-save on slider drag**: Sliders that persist settings (map zoom level) or trigger expensive computations (map search radius) use a separate explicit Save/Search button. The slider controls a "draft" state; only the button commits it.
- **Pencil hint as sole click target**: When a UI element has both a navigation action and a customization action, the customization trigger is always the smaller/supplementary control (pencil icon), never the primary tile/icon. The primary click navigates.
- **IntersectionObserver over scroll events**: Infinite scroll uses IntersectionObserver with 200px root margin for simplicity and modern browser support; a Load More button remains as fallback.
- **IndexedDB for UI-only persistence**: All user preferences and UI state (folder styles, editor tab order, navbar tab order, map zoom level) go to IndexedDB via `getPref`/`setPref` (in `frontend/src/services/db.js`). Backend persistence (database) is for data, not UI state.

### Colors Tab (FileViewer)
- **Grayscale exclusion**: Colors with RGB range (max-min) ≤ 15 are filtered out from the top 20 to avoid picking up near-white/black/near-gray values.
- **Similar-color merging**: Within `extractProminentColors`, shades with Euclidean distance ≤ 30 in 0–255 RGB space are merged by weighted average (weighted by pixel count).
- **Multi-select with toggle**: `selectedColors` is an array of `{r,g,b}` objects; clicking a swatch toggles it in/out. Backwards compatibility maintained: backend `_apply_selective_color` checks for `colors` array first, falls back to legacy single `color`.
- **Swatch display**: CSS `auto-fill, minmax(120px, 1fr)` grid with vertical swatch layout; each swatch shows an area percentage (`pct`) label.

### Media Explorer
- **Strict folder hierarchy**: `directory_id` FK on `ImportedFile` is the source of truth. `relative_path` is NOT used for tree traversal. The `explorer_browse()` endpoint enforces root-level = directories only (no files); files only appear when browsing into a subdirectory.
- **Synthetic session folders**: Non-upload sessions with root-only files get a synthetic directory entry with `path = "__session_{session.id}__"`. Parsed by `prefix.startswith("__session_")` → `int(prefix.split("_")[2])` to get the session ID.
- **No upload-session exclusion**: The `explorer_browse` endpoint does NOT filter out the upload session — all sessions' files appear in Explorer. The `seen_paths` dedup logic prevents duplicate directory entries.
- **Folder icon/color per path**: Customizations stored as a single IndexedDB key `explorer_folder_styles = { [relative_path]: { icon: string, color: string } }`. Supports 13 Lucide icons and 10 color options.
- **File operations guards**: `explorer_delete` must `DetectedFace.query.filter_by(file_id=...).delete()` before hard-deleting any `ImportedFile` to avoid FK NOT NULL violations (autoflush cascade). `FileMetadata` has no `date_added` column — do not reference it in metadata copy constructors.

### Map
- **Explicit search**: The distance radius slider (1–100 km) controls a `pendingKm` draft state. Only clicking the "Search" button copies it to the active `nearbyKm` state, triggering `filteredMarkers` recalculation. Map click and Zoom In also sync `pendingKm = nearbyKm` so the slider reflects the active radius.
- **Zoom In button on pin popups**: Flies the map to the configured `mapZoomLevel` (default 18, range 10–19, set in Settings). `MapController` receives `zoomToCoords` and `mapZoomLevel` as props; the zoom effect uses `mapZoomLevel` directly rather than `map.getMaxZoom() - 1`.
- **Map zoom level settings**: Persisted to IndexedDB as `mapZoomLevel`. Settings UI shows a range slider + explicit "Save" button (not auto-save on drag).

### Faces Tab
- **Case-insensitive name grouping**: `displayPersons` computed via `useMemo` groups persons by `(p.name || "").toLowerCase()`. Combined entries have `_combined: true`, `id: number[]`, `_persons: original[]`, `thumbnails: string[]`.
- **Combined-card constraints**: Edit/delete buttons hidden on combined cards. Operations use `loadId = selectedPerson._combined ? selectedPerson._persons[0].id : selectedPerson.id` for backend calls (backend doesn't support multi-person queries).
- **Merge toolbar**: The merge toolbar (`selectedIds` set) correctly adds all individual IDs from combined cards, so merge-all-of-same-name works as expected.

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

## Production Deployment
- Nginx reverse proxy with HTTPS, HTTP/2 support
- Auto-generated SSL certificates at build time
- Separate containers for each Celery queue for scalability
- All edits go to edited-images directory (~/media-server-edited)
