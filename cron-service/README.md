# Cron Service

Standalone container for scheduling and monitoring rsync folder sync jobs.

## Quick Start

### Docker (Recommended)
```bash
docker compose -f docker-compose.cron.yml up --build -d
```
Open **http://localhost:5010**

### Local Development
```bash
make cron-setup   # creates venv + installs dependencies
make cron-service  # starts dev server on :5010
```

## Features

- **Rsync incremental sync** — copies only changed files; skipped files reported
- **Live progress** — WebSocket streams rsync output with filename and percentage
- **Cron scheduling** — APScheduler with cron expressions; YAML + UI config
- **Task history** — SQLite-backed log of all runs with full output
- **Cancellation** — kill running rsync processes from the UI

## Configuration

### YAML Config (`config/jobs.yaml`)
```yaml
jobs:
  - name: "Backup Photos"
    source: "/media/photos"
    destination: "/backup/photos"
    schedule: "0 2 * * *"        # cron: min hour day month weekday
    enabled: true
    extra_flags: "--compress"    # optional rsync flags
```

Jobs sync bidirectionally with the SQLite database. UI edits update both.

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CRON_DB_PATH` | `data/cron.db` | SQLite database path |
| `CRON_CONFIG_PATH` | `config/jobs.yaml` | YAML config path |
| `FLASK_SECRET_KEY` | `cron-service-secret` | Flask session secret |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Dashboard |
| `GET` | `/jobs` | Jobs list page |
| `GET` | `/tasks` | Tasks page (running + history) |
| `POST` | `/api/jobs` | Create job |
| `PUT` | `/api/jobs/<id>` | Update job |
| `DELETE` | `/api/jobs/<id>` | Delete job |
| `POST` | `/api/jobs/<id>/run` | Trigger manual run |
| `POST` | `/api/jobs/<id>/toggle` | Enable/disable job |
| `GET` | `/api/tasks` | List tasks |
| `GET` | `/api/tasks/<id>` | Get task detail + output |
| `POST` | `/api/tasks/<id>/cancel` | Cancel running task |
| `DELETE` | `/api/tasks/<id>` | Delete task history |

## Architecture

```
Flask App (port 5010)
├── APScheduler (cron triggers)
├── Flask-SocketIO (gevent async)
├── SQLite (cron_job + task_run tables)
├── Rsync subprocess (per task, with progress parsing)
└── YAML config (bidirectional sync with SQLite)
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make cron-setup` | Create venv + install dependencies |
| `make cron-service` | Start dev server on :5010 |
| `make cron-docker` | Build and run via Docker |
| `make cron-docker-down` | Stop Docker container |
