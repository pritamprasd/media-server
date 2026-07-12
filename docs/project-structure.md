# Project Structure

```
media-server/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── files_routes.py        # files_bp: file metadata, tags, favorite, primary, hidden, thumbnail, serve, download, edit, delete, duplicates, favorites
│   │   │   ├── upload_routes.py       # upload_bp: upload dirs/files, move, copy, rename, recent, nicknames
│   │   │   ├── explorer_routes.py     # explorer_bp: browse, rename, move, copy, delete, favorites
│   │   │   ├── map_routes.py          # map_bp: locations, geocode/reverse, with-gps, export
│   │   │   ├── tools_routes.py        # tools_bp: ingredient-scanner, barcode-scanner
│   │   │   ├── filters_routes.py      # filters_bp: filter presets
│   │   │   ├── sessions_routes.py     # sessions_bp: status, stats, directories, browse-fs, import, sessions
│   │   │   ├── system_routes.py       # system_bp: openapi.yaml/json, docs, api_docs
│   │   │   ├── face_routes.py         # face_bp: face/person API endpoints
│   │   │   ├── collection_routes.py   # collection_bp: collections API
│   │   │   ├── memory_routes.py       # memory_bp: user memory API
│   │   │   ├── file_helpers.py        # shared route helpers (image edit/filter pipeline)
│   │   │   └── __init__.py            # imports + exposes all blueprints
│   │   ├── services/
│   │   │   ├── explorer_service.py    # explorer browse/rename/move/copy/delete + favorite folders
│   │   │   ├── duplicate_service.py   # exact + near duplicate detection
│   │   │   ├── file_service.py        # favorite/primary toggle, delete (with face cleanup), favorites
│   │   │   └── __init__.py            # re-exports service modules
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
│   │   │   ├── type_utility.py         # safe_int helper
│   │   │   └── video_utility.py       # ffprobe metadata, ffmpeg frame extraction, video editing
│   │   ├── tasks/
│   │   │   ├── import_tasks.py        # process_import_folder (import_queue)
│   │   │   ├── metadata_tasks.py      # extract_file_metadata (metadata queue)
│   │   │   ├── ai_tasks.py            # generate_ai_metadata (ai_metadata queue)
│   │   │   ├── thumbnail_tasks.py     # generate_thumbnail (thumbnail queue)
│   │   │   ├── face_tasks.py          # detect_faces (face_detection queue)
│   │   │   └── __init__.py            # re-exports all 5 tasks (names preserved: app.tasks.*)
│   │   ├── metrics.py                 # Prometheus metrics (HTTP, Celery, file ops, processing, library stats)
│   │   ├── celery_app.py              # Celery app factory + worker init
│   │   ├── config.py                  # App configuration (all env vars with docstrings)
│   │   └── __init__.py                # App factory (create_app)
│   ├── migrations/                    # Alembic migration versions
│   ├── scripts/
│   │   └── regenerate_heic_thumbnails.py
│   ├── tests/
│   │   ├── test_api.py                # API integration tests (pytest, in-memory SQLite)
│   │   └── unit/                      # Unit tests for each app/utility module (pytest)
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
│   │   ├── sw.js                      # Service worker (cache stores)
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
│   └── docker-restart                  # Rebuild & restart a single Docker service (interactive)
├── assets/
│   └── grafana-dashboards/
│       └── media_dashboard.json       # Duplicate of grafana-dashboard.json
├── docs/
│   ├── face-detection.md              # In-depth face pipeline documentation
│   └── ...                            # Other docs (this folder)
├── Makefile                           # 30+ targets
├── AGENTS.md                          # Project conventions for AI agents
├── new_tool_prompt.md                 # Reusable LLM prompt for generating new tools
├── notes.md                           # Developer scratch notes
├── todo.md                            # Project TODO/bug list
├── .env.example                       # Root env template
└── README.md
```
