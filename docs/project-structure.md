# Project Structure

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
│   │   │   ├── type_utility.py         # safe_int helper
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
