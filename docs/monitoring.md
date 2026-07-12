# Monitoring

The backend and all workers expose Prometheus metrics at `/metrics` for real-time observability. A Grafana dashboard is included at `grafana-dashboard.json` with 37 panels across 9 rows.

## Metrics Endpoints

| Service | Container | Port |
|---------|-----------|------|
| Backend (Flask) | `media_server_be` | 9200 |
| Worker Import | `media_server_w_import` | 9201 |
| Worker Metadata | `media_server_w_metadata` | 9202 |
| Worker AI | `media_server_w_ai` | 9203 |
| Worker Thumbnail | `media_server_w_thumb` | 9204 |
| Worker Face | `media_server_w_face` | 9205 |

## Metrics Collected

**HTTP** — request rate, duration (p50/p95/p99), error rate (4xx/5xx), in-flight requests per method.

**Celery Tasks** — task rate, duration, success/failure count, retry rate per task type (import, metadata, AI, thumbnail, face).

**File Operations** — import, delete, serve, download, edit, export (by format: jpeg/png/webp/heic/pdf/ascii/mp4/webm/avi/mkv/mov).

**Processing Pipeline** — metadata extraction (success/failure), thumbnail generation, AI description (success/failure), face detection (faces detected + new persons created, duration), face scans queued.

**Upload & Explorer** — upload file rate, upload byte rate, explorer operations (rename/move/copy/delete), geocode cache hit/miss rate.

**Library Statistics** — total files (active/deleted), library size in bytes, total sessions, total unique tags, tagged file count, files by MIME category, persons, detected faces, unprocessed files by step.

**Process Resources** — resident memory, virtual memory, CPU usage, open file descriptors.

## Grafana Dashboard Rows

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

## Adding to Prometheus

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
