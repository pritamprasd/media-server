# API Endpoints

All endpoints are prefixed with `/api` unless noted. Authentication is via the hidden-files PIN header (`X-Hidden-Pin`) where required.

> A machine-readable **OpenAPI 3.1** specification covering all endpoints is available at [`backend/openapi.yaml`](../backend/openapi.yaml).
> The backend also serves a live **Swagger UI** viewer at `GET /api/docs` (raw spec at `GET /api/openapi.yaml` / `/api/openapi.json`). In the app, open **Settings → Shortcuts → API Docs (Swagger)**, or visit the in-app route `/docs`.


## Files
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
| POST | `/api/files/change-hidden-pin` | Change hidden files PIN: `{ "old_pin": "...", "new_pin": "..." }` |
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

## Admin Tasks
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/admin/bulk-ai` | Queue one `generate_ai_metadata` Celery task per file missing an AI description (respects Airplane Mode) |
| POST | `/api/admin/bulk-exif` | Queue `extract_file_metadata` for all files missing EXIF/metadata |
| POST | `/api/admin/bulk-thumbnails` | Queue `generate_thumbnail` for all files missing a thumbnail |
| POST | `/api/admin/bulk-faces` | Queue `detect_faces` for all image files not yet scanned for faces |
| POST | `/api/admin/tags/rename` | Rename a tag across all files: `{ "old_tag": "...", "new_tag": "..." }` → `{ "renamed": <count> }` |
| POST | `/api/admin/tags/delete` | Remove a tag from all files: `{ "tag": "..." }` → `{ "deleted": <count> }` |
| POST | `/api/admin/verify-pin` | Verify admin PIN: sends `X-Admin-Pin` header → `{ "valid": true }` or 403 |
| POST | `/api/admin/change-pin` | Change admin PIN: `{ "old_pin": "...", "new_pin": "..." }` (validates old, updates in-memory) |
| GET | `/api/admin/tags` | All tags with frequency counts (requires `X-Admin-Pin` header); frontend filters client-side |

The bulk tasks return `{ "queued": <count> }` (HTTP 202). The heavy work is fanned out to the existing Celery workers; the response only reports how many files were queued. All admin endpoints require `X-Admin-Pin` header (verified server-side against `ADMIN_PIN` config). Tag operations use raw SQL `jsonb_agg` for atomic bulk updates. The `/admin/tags` endpoint returns all tags with frequency counts; frontend filters client-side.

## Import & Upload
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

## Media Explorer
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/explorer/browse` | Unified browsing across sessions (pagination, dedup) |
| POST | `/api/explorer/rename` | Rename file or directory |
| POST | `/api/explorer/move` | Move items within/across sessions |
| POST | `/api/explorer/copy` | Copy items to target location |
| POST | `/api/explorer/delete` | Hard delete files/directories (removes from disk) |
| GET | `/api/explorer/favorites` | List favorited folders |
| POST | `/api/explorer/favorites` | Add folder favorite |
| DELETE | `/api/explorer/favorites` | Remove folder favorite |

## Batch Operations
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/files/batch-metadata` | Batch update date_taken for multiple files |
| POST | `/api/files/batch-memories` | Batch add a note to multiple files |

## Tags & Favorites
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/tags` | Tag frequency list (sorted by frequency) |
| GET | `/api/favorites` | Favorited files (non-deleted, non-hidden) |
| PATCH | `/api/files/<id>/primary` | Toggle is_primary flag (excluded from duplicates) |

## Duplicates
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/duplicates` | Exact (SHA-256) and near-duplicate groups (dhash Hamming ≤ 10) |

## Filters
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/filters` | List custom filter presets |
| POST | `/api/filters` | Save/upsert filter preset |
| DELETE | `/api/filters/<id>` | Delete filter preset |

## Locations
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/locations` | List saved locations (with file counts within radius) |
| POST | `/api/locations` | Save location |
| PUT | `/api/locations/<id>` | Update location |
| DELETE | `/api/locations/<id>` | Delete location |
| GET | `/api/files/with-gps` | Paginated GPS-tagged files with thumbnails |

## Faces & Persons
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/persons` | Paginated persons list (search by name, sort by face_count) |
| PUT | `/api/persons/<id>` | Rename person (syncs name as tag) |
| DELETE | `/api/persons/<id>` | Delete person (faces become unassigned) |
| POST | `/api/persons/batch-delete` | Batch delete persons by IDs |
| GET | `/api/persons/<id>/faces` | Paginated faces for a person |
| GET | `/api/persons/<id>/files` | Paginated files containing a person |
| GET | `/api/persons/<id>/timeline` | Timeline of person's appearances (year/month/week/day buckets) |
| POST | `/api/persons/scan` | Queue face detection for unscanned files |
| POST | `/api/persons/merge` | Merge multiple persons into one |
| GET | `/api/faces` | List faces (optionally filtered by person) |
| GET | `/api/faces/stats` | Face detection statistics |
| PUT | `/api/faces/<id>` | Name/rename a face (creates or reuses person) |

## Collections
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

## User Memories
| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/files/<id>/memories` | List memories for a file |
| POST | `/api/files/<id>/memories` | Create memory |
| PUT | `/api/memories/<id>` | Update memory |
| DELETE | `/api/memories/<id>` | Delete memory |

## Tools
| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/tools/ingredient-scanner/analyze` | Analyze ingredient text (async Ollama) |
| GET | `/api/tools/ingredient-scanner/result/<id>` | Poll ingredient analysis result |
| POST | `/api/tools/ingredient-scanner-ai/analyze` | Analyze food label image (vision + text pipeline) |
| GET | `/api/tools/ingredient-scanner-ai/result/<id>` | Poll AI ingredient analysis result |
| POST | `/api/tools/barcode-scanner/stats` | Log barcode scan events |
| POST | `/api/tools/barcode-scanner/sync` | Log cart sync events |

## System & Geocoding
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
