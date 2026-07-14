"""Rsync task type — incremental file synchronization."""

import os
import re
import subprocess
import signal
from datetime import datetime, timezone
from flask import current_app
from app import db, socketio
from app.task_types import register


FIELDS = [
    {
        "key": "source",
        "label": "Source Path",
        "type": "path",
        "required": True,
        "placeholder": "/home/user/photos or user@host:/path",
    },
    {
        "key": "destination",
        "label": "Destination Path",
        "type": "path",
        "required": True,
        "placeholder": "/backup/photos or user@host:/path",
    },
    {
        "key": "extra_flags",
        "label": "Extra Flags",
        "type": "text",
        "required": False,
        "placeholder": "--delete --compress",
        "help": "Additional rsync flags (space-separated)",
    },
    {
        "key": "exclude",
        "label": "Exclude Patterns",
        "type": "text",
        "required": False,
        "placeholder": "*.log .cache/",
        "help": "Space-separated glob patterns to exclude",
    },
]


def validate(data):
    source = (data.get("source") or "").strip()
    dest = (data.get("destination") or "").strip()
    if not source:
        return False, "Source path is required"
    if not dest:
        return False, "Destination path is required"
    return True, None


def _host_path(user_path):
    """Convert a user-facing host path to the container-visible path."""
    if user_path.startswith("/host"):
        return user_path
    return "/host" + user_path


def _parse_rsync_line(line):
    """Parse a single rsync --progress line for filename and percentage."""
    percent = None
    filename = None

    percent_match = re.search(r"(\d+)%", line)
    if percent_match:
        percent = int(percent_match.group(1))

    clean = line.strip()
    if clean and not clean.startswith("sending") and not clean.startswith("total"):
        parts = clean.split()
        if parts and not parts[0].endswith("%"):
            filename = parts[0]

    return filename, percent


def _parse_stats_output(output):
    """Parse rsync --stats final output for a human-readable summary."""
    summary = {}
    for line in output.split("\n"):
        line = line.strip()
        if "Number of files transferred:" in line:
            val = line.split(":")[-1].strip().replace(",", "")
            try:
                summary["files_transferred"] = int(val)
            except ValueError:
                pass
        elif "Number of files:" in line and "transferred" not in line:
            val = line.split(":")[-1].strip().replace(",", "")
            try:
                summary["total_files"] = int(val)
            except ValueError:
                pass
        elif "Total transferred file size:" in line:
            val = line.split(":")[-1].strip().replace(",", "").replace(" bytes", "")
            try:
                summary["total_bytes"] = int(val)
            except ValueError:
                pass
        elif "Literal data:" in line:
            val = line.split(":")[-1].strip().replace(",", "").replace(" bytes", "")
            try:
                summary["literal_bytes"] = int(val)
            except ValueError:
                pass

    if summary.get("files_transferred", 0) == 0 and summary.get("total_files", 0) > 0:
        summary["message"] = f"All {summary['total_files']} files already up to date, nothing to copy"
    elif summary.get("files_transferred", 0) > 0:
        transferred = summary.get("files_transferred", 0)
        total = summary.get("total_files", 0)
        skipped = total - transferred
        parts = [f"{transferred} files copied"]
        if skipped > 0:
            parts.append(f"{skipped} skipped (already up to date)")
        summary["message"] = ", ".join(parts)
    else:
        summary["message"] = "Sync complete"

    return summary


def execute(task):
    """Run rsync for a TaskRun row and stream output via SocketIO."""
    from app.models import TaskRun

    with current_app.app_context():
        task = db.session.get(TaskRun, task.id) if isinstance(task.id, int) else task
        if not task:
            return

        params = task.params or {}
        source = params.get("source", "")
        destination = params.get("destination", "")
        extra_flags = params.get("extra_flags", "")
        exclude = params.get("exclude", "")

        task.status = "running"
        db.session.commit()

        socketio.emit("task_progress", {
            "task_id": task.id,
            "line": f"Starting rsync: {source} -> {destination}",
            "filename": None,
            "percent": None,
            "status": "running",
        }, room=f"task_{task.id}")

        cmd = [
            "rsync", "-avz", "--progress", "--stats",
            "--human-readable",
        ]

        if extra_flags:
            cmd.extend(extra_flags.split())

        if exclude:
            for pat in exclude.split():
                cmd.extend(["--exclude", pat])

        cmd.extend([_host_path(source), _host_path(destination)])

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            task.pid = proc.pid
            db.session.commit()

            output_lines = []
            for line in iter(proc.stdout.readline, ""):
                if not line:
                    break
                output_lines.append(line)
                filename, percent = _parse_rsync_line(line)

                socketio.emit("task_progress", {
                    "task_id": task.id,
                    "line": line.rstrip("\n"),
                    "filename": filename,
                    "percent": percent,
                    "status": "running",
                }, room=f"task_{task.id}")

            proc.wait()
            full_output = "".join(output_lines)

            if proc.returncode == 0:
                stats = _parse_stats_output(full_output)
                task.status = "completed"
                task.summary = stats.get("message", "Sync complete")
            elif proc.returncode in (20, -15):
                task.status = "cancelled"
                task.summary = "Cancelled by user"
            else:
                task.status = "failed"
                task.summary = f"rsync exited with code {proc.returncode}"

            task.output = full_output
            task.ended_at = datetime.now(timezone.utc)
            db.session.commit()

            socketio.emit("task_complete", {
                "task_id": task.id,
                "status": task.status,
                "summary": task.summary,
            }, room=f"task_{task.id}")

        except Exception as e:
            task.status = "failed"
            task.summary = str(e)
            task.ended_at = datetime.now(timezone.utc)
            db.session.commit()

            socketio.emit("task_complete", {
                "task_id": task.id,
                "status": "failed",
                "summary": str(e),
            }, room=f"task_{task.id}")


def cancel(task_id):
    """Send SIGTERM to a running rsync process."""
    from app.models import TaskRun
    task = db.session.get(TaskRun, task_id)
    if not task or task.status != "running" or not task.pid:
        return False
    try:
        os.kill(task.pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, PermissionError):
        return False


register("rsync", {
    "name": "Rsync Sync",
    "description": "Incremental file synchronization using rsync",
    "fields": FIELDS,
    "validate": validate,
    "execute": execute,
    "cancel": cancel,
})
