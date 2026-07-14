# Cron Service

Standalone container for scheduling and running arbitrary tasks via cron jobs. Pluggable task type system — add new task types by creating a Python file in `app/task_types/`.

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

> **Schema change:** If upgrading from the original rsync-only version, delete `data/cron.db` before starting. The schema has changed to support pluggable task types.

## Features

- **Pluggable task types** — rsync built-in; add more by creating `app/task_types/<name>.py`
- **Dynamic job forms** — UI auto-generates form fields from task type schema
- **File browser** — browse the host filesystem when entering path parameters
- **Cron helper** — human-readable description + next 5 run times as you type
- **Live progress** — WebSocket streams task output in real time
- **Dark theme** — full dark UI with responsive sidebar
- **YAML + UI config** — jobs defined in YAML or created via the web interface

## Task Types

Each task type is a Python module in `app/task_types/` that registers itself:

```python
from app.task_types import register

FIELDS = [
    {"key": "source", "label": "Source Path", "type": "path", "required": True},
    {"key": "destination", "label": "Destination Path", "type": "path", "required": True},
    {"key": "extra_flags", "label": "Extra Flags", "type": "text", "required": False},
]

def validate(data):
    return True, None

def execute(task):
    # Run the task, stream output via socketio.emit("task_progress", ...)
    pass

def cancel(task_id):
    # Kill the running process
    pass

register("rsync", {
    "name": "Rsync Sync",
    "description": "Incremental file synchronization",
    "fields": FIELDS,
    "validate": validate,
    "execute": execute,
    "cancel": cancel,
})
```

Field types: `path` (with browse button), `text`, `textarea`, `select`, `number`.

## Configuration

### YAML Config (`config/jobs.yaml`)
```yaml
jobs:
  - name: "Backup Photos"
    task_type: "rsync"
    params:
      source: "/media/photos"
      destination: "/backup/photos"
      extra_flags: "--compress"
    schedule: "0 2 * * *"
    enabled: true
```

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
| `GET` | `/api/task-types` | List available task types |
| `GET` | `/api/task-types/<key>` | Get task type schema (fields) |
| `GET` | `/api/browse?path=` | Browse host filesystem |
| `GET` | `/api/cron/parse?expr=` | Parse cron expression |
| `POST` | `/api/run` | Run a task without creating a job |

## Architecture

```
Flask App (port 5010)
├── task_types/         # Pluggable task type registry
│   ├── __init__.py     # Registry (register, get, list_types)
│   └── rsync.py        # Rsync task type with progress parsing
├── APScheduler         # Cron triggers
├── Flask-SocketIO      # Live progress via WebSocket
├── SQLite              # cron_job + task_run tables
├── cron_parser.py      # Cron expression → human-readable + next runs
└── YAML config         # Bidirectional sync with SQLite
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make cron-setup` | Create venv + install dependencies |
| `make cron-service` | Start dev server on :5010 |
| `make cron-docker` | Build and run via Docker |
| `make cron-docker-down` | Stop Docker container |
