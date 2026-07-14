import os
import json
from datetime import datetime, timezone
from flask import Blueprint, render_template, request, jsonify, current_app
from app import db, socketio
from app.models import CronJob, TaskRun
from app.task_types import get_all as get_task_types, get as get_task_type, list_types
from app.cron_parser import parse as parse_cron
from app.config_loader import save_config
from app.scheduler import resync_scheduler

bp = Blueprint("main", __name__, static_folder="static")


def trigger_job_run(job_id):
    """Trigger a run for a CronJob. Called from scheduler or API.

    Callers must ensure they are within an app context.
    """
    job = db.session.get(CronJob, job_id)
    if not job:
        return None

    task = TaskRun(
        job_id=job.id,
        job_name=job.name,
        task_type=job.task_type,
        params=dict(job.params or {}),
        status="running",
    )
    db.session.add(task)
    db.session.commit()

    task_type = get_task_type(job.task_type)
    if task_type and task_type.get("execute"):
        socketio.start_background_task(task_type["execute"], task)
    return task


# ── Pages ──────────────────────────────────────────────────────────────

@bp.route("/")
def dashboard():
    total_jobs = CronJob.query.count()
    active_jobs = CronJob.query.filter_by(enabled=True).count()
    running_tasks = TaskRun.query.filter_by(status="running").count()
    completed_today = TaskRun.query.filter(
        TaskRun.status == "completed",
        TaskRun.ended_at >= datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ),
    ).count()
    recent_tasks = TaskRun.query.order_by(TaskRun.started_at.desc()).limit(10).all()
    jobs = CronJob.query.order_by(CronJob.name).all()
    return render_template(
        "dashboard.html",
        total_jobs=total_jobs,
        active_jobs=active_jobs,
        running_tasks=running_tasks,
        completed_today=completed_today,
        recent_tasks=recent_tasks,
        jobs=jobs,
    )


@bp.route("/jobs")
def jobs_page():
    jobs = CronJob.query.order_by(CronJob.name).all()
    return render_template("jobs.html", jobs=jobs, task_types=list_types())


@bp.route("/tasks")
def tasks_page():
    running = TaskRun.query.filter_by(status="running").order_by(TaskRun.started_at.desc()).all()
    history = TaskRun.query.filter(TaskRun.status != "running").order_by(TaskRun.started_at.desc()).limit(100).all()
    return render_template("tasks.html", running=running, history=history)


# ── API: Jobs ─────────────────────────────────────────────────────────

@bp.route("/api/jobs", methods=["POST"])
def create_job():
    data = request.json or {}
    name = (data.get("name") or "").strip()
    task_type_key = data.get("task_type", "rsync")
    params = data.get("params", {})
    schedule = data.get("schedule", "0 * * * *")

    if not name:
        return jsonify({"error": "Job name is required"}), 400

    task_type = get_task_type(task_type_key)
    if not task_type:
        return jsonify({"error": f"Unknown task type: {task_type_key}"}), 400

    if task_type.get("validate"):
        ok, err = task_type["validate"](params)
        if not ok:
            return jsonify({"error": err}), 400

    if CronJob.query.filter_by(name=name).first():
        return jsonify({"error": "Job name already exists"}), 409

    job = CronJob(
        name=name,
        task_type=task_type_key,
        params=params,
        schedule=schedule,
        enabled=data.get("enabled", True),
    )
    db.session.add(job)
    db.session.commit()
    save_config()
    resync_scheduler(current_app._get_current_object())
    return jsonify(job.to_dict()), 201


@bp.route("/api/jobs/<int:job_id>", methods=["PUT"])
def update_job(job_id):
    job = db.session.get(CronJob, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    data = request.json or {}
    if "name" in data:
        job.name = data["name"]
    if "task_type" in data:
        job.task_type = data["task_type"]
    if "params" in data:
        job.params = data["params"]
    if "schedule" in data:
        job.schedule = data["schedule"]
    if "enabled" in data:
        job.enabled = data["enabled"]

    if job.task_type:
        task_type = get_task_type(job.task_type)
        if task_type and task_type.get("validate"):
            ok, err = task_type["validate"](job.params or {})
            if not ok:
                return jsonify({"error": err}), 400

    job.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    save_config()
    resync_scheduler(current_app._get_current_object())
    return jsonify(job.to_dict())


@bp.route("/api/jobs/<int:job_id>", methods=["DELETE"])
def delete_job(job_id):
    job = db.session.get(CronJob, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    try:
        from app.scheduler import scheduler
        scheduler.remove_job(str(job.id))
    except Exception:
        pass

    db.session.delete(job)
    db.session.commit()
    save_config()
    return jsonify({"ok": True})


@bp.route("/api/jobs/<int:job_id>/run", methods=["POST"])
def run_job(job_id):
    task = trigger_job_run(job_id)
    if not task:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(task.to_dict()), 201


@bp.route("/api/jobs/<int:job_id>/toggle", methods=["POST"])
def toggle_job(job_id):
    job = db.session.get(CronJob, job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    job.enabled = not job.enabled
    db.session.commit()
    save_config()
    resync_scheduler(current_app._get_current_object())
    return jsonify(job.to_dict())


# ── API: Tasks ────────────────────────────────────────────────────────

@bp.route("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    q = TaskRun.query
    if status:
        q = q.filter_by(status=status)
    tasks = q.order_by(TaskRun.started_at.desc()).limit(200).all()
    return jsonify([t.to_dict() for t in tasks])


@bp.route("/api/tasks/<int:task_id>")
def get_task(task_id):
    task = db.session.get(TaskRun, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(task.to_dict())


@bp.route("/api/tasks/<int:task_id>/cancel", methods=["POST"])
def cancel_task_route(task_id):
    task = db.session.get(TaskRun, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404

    task_type = get_task_type(task.task_type) if task.task_type else None
    cancel_fn = task_type.get("cancel") if task_type else None
    if cancel_fn and cancel_fn(task.id):
        return jsonify({"ok": True})
    return jsonify({"error": "Task not found or not running"}), 400


@bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    task = db.session.get(TaskRun, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task.status == "running":
        task_type = get_task_type(task.task_type) if task.task_type else None
        cancel_fn = task_type.get("cancel") if task_type else None
        if cancel_fn:
            cancel_fn(task.id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({"ok": True})


# ── API: Task Types ───────────────────────────────────────────────────

@bp.route("/api/task-types")
def api_task_types():
    return jsonify(list_types())


@bp.route("/api/task-types/<task_type>")
def api_task_type_schema(task_type):
    tt = get_task_type(task_type)
    if not tt:
        return jsonify({"error": "Unknown task type"}), 404
    return jsonify({
        "key": task_type,
        "name": tt["name"],
        "description": tt["description"],
        "fields": tt["fields"],
    })


# ── API: File Browser ─────────────────────────────────────────────────

@bp.route("/api/browse")
def browse_path():
    """List directory contents. Paths are user-facing host paths (without /host prefix).

    The container has / mounted at /host:ro, so /host/home/user = /home/user on the host.
    """
    raw_path = request.args.get("path", "/")
    if not raw_path.startswith("/"):
        raw_path = "/" + raw_path

    container_path = "/host" + raw_path if not raw_path.startswith("/host") else raw_path

    try:
        entries = []
        for name in sorted(os.listdir(container_path)):
            full = os.path.join(container_path, name)
            try:
                is_dir = os.path.isdir(full)
                size = os.path.getsize(full) if not is_dir else None
            except OSError:
                continue
            entries.append({
                "name": name,
                "type": "dir" if is_dir else "file",
                "size": size,
            })

        # Sort: dirs first, then files
        entries.sort(key=lambda e: (0 if e["type"] == "dir" else 1, e["name"].lower()))

        return jsonify({
            "path": raw_path,
            "items": entries,
        })

    except PermissionError:
        return jsonify({"error": "Permission denied", "path": raw_path}), 403
    except FileNotFoundError:
        return jsonify({"error": "Path not found", "path": raw_path}), 404
    except Exception as e:
        return jsonify({"error": str(e), "path": raw_path}), 500


# ── API: Cron Parser ──────────────────────────────────────────────────

@bp.route("/api/cron/parse")
def api_cron_parse():
    expr = request.args.get("expr", "")
    result = parse_cron(expr)
    return jsonify(result)


# ── Manual run (from tasks page) ─────────────────────────────────────

@bp.route("/api/run", methods=["POST"])
def manual_run():
    """Run a task manually without creating a job."""
    data = request.json or {}
    task_type_key = data.get("task_type", "rsync")
    params = data.get("params", {})

    task_type = get_task_type(task_type_key)
    if not task_type:
        return jsonify({"error": f"Unknown task type: {task_type_key}"}), 400

    if task_type.get("validate"):
        ok, err = task_type["validate"](params)
        if not ok:
            return jsonify({"error": err}), 400

    task = TaskRun(
        job_name="Manual Run",
        task_type=task_type_key,
        params=params,
        status="running",
    )
    db.session.add(task)
    db.session.commit()

    if task_type.get("execute"):
        socketio.start_background_task(task_type["execute"], task)

    return jsonify(task.to_dict()), 201
