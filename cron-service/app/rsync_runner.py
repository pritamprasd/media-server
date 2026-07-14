import os
import re
import subprocess
import signal
from datetime import datetime, timezone
from flask import current_app
from app import db, socketio
from app.models import TaskRun


def parse_rsync_line(line):
    """Parse a single rsync --progress line to extract filename and percentage.

    Rsync output lines look like:
        filename.jpg
          1,234,567  45%  12.34MB/s  0:00:03
    """
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


def parse_stats_output(output):
    """Parse rsync --stats final output to extract transfer summary.

    Looks for lines like:
        Number of files: 123
        Number of files transferred: 45
        Total file size: 1,234,567 bytes
        Total transferred file size: 567,890 bytes
        Literal data: 567,890 bytes
        Matched data: 0 bytes
        File list size: 1,234
        Total bytes sent: 567,890
        Total bytes received: 456
    """
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


def run_task(task_id):
    """Execute rsync for a given TaskRun and stream output via SocketIO.

    This function runs in a background greenlet. It:
    1. Spawns rsync with -avz --progress --stats
    2. Reads stdout line by line
    3. Emits each line to the task's SocketIO room
    4. Parses the final stats for a human-readable summary
    5. Updates the TaskRun record in SQLite
    """
    with current_app.app_context():
        task = db.session.get(TaskRun, task_id)
        if not task:
            return

        task.status = "running"
        db.session.commit()

        socketio.emit("task_progress", {
            "task_id": task_id,
            "line": f"Starting rsync: {task.source} -> {task.destination}",
            "filename": None,
            "percent": None,
            "status": "running",
        }, room=f"task_{task_id}")

        cmd = [
            "rsync", "-avz", "--progress", "--stats",
            "--human-readable",
        ]

        if task.extra_flags:
            cmd.extend(task.extra_flags.split())

        cmd.extend([task.source, task.destination])

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
                filename, percent = parse_rsync_line(line)

                socketio.emit("task_progress", {
                    "task_id": task_id,
                    "line": line.rstrip("\n"),
                    "filename": filename,
                    "percent": percent,
                    "status": "running",
                }, room=f"task_{task_id}")

            proc.wait()
            full_output = "".join(output_lines)

            if proc.returncode == 0:
                stats = parse_stats_output(full_output)
                task.status = "completed"
                task.summary = stats.get("message", "Sync complete")
            elif proc.returncode == 20 or proc.returncode == -15:
                task.status = "cancelled"
                task.summary = "Cancelled by user"
            else:
                task.status = "failed"
                task.summary = f"rsync exited with code {proc.returncode}"

            task.output = full_output
            task.ended_at = datetime.now(timezone.utc)
            db.session.commit()

            socketio.emit("task_complete", {
                "task_id": task_id,
                "status": task.status,
                "summary": task.summary,
            }, room=f"task_{task_id}")

        except Exception as e:
            task.status = "failed"
            task.summary = str(e)
            task.ended_at = datetime.now(timezone.utc)
            db.session.commit()

            socketio.emit("task_complete", {
                "task_id": task_id,
                "status": "failed",
                "summary": str(e),
            }, room=f"task_{task_id}")


def cancel_task(task_id):
    """Send SIGTERM to a running rsync process."""
    from app import db
    task = db.session.get(TaskRun, task_id)
    if not task or task.status != "running" or not task.pid:
        return False
    try:
        os.kill(task.pid, signal.SIGTERM)
        return True
    except (ProcessLookupError, PermissionError):
        return False
