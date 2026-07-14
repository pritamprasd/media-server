from datetime import datetime, timezone
from flask import Blueprint, render_template, request, jsonify, current_app
from app import db, socketio
from app.models import CronJob, TaskRun
from app.rsync_runner import run_task, cancel_task
from app.config_loader import save_config
from app.scheduler import resync_scheduler

bp = Blueprint("main", __name__)


def trigger_job_run(job_id):
    """Trigger an rsync run for a CronJob. Called from scheduler or API.

    Callers must ensure they are within an app context.
    """
    job = db.session.get(CronJob, job_id)
    if not job:
        return None

    task = TaskRun(
        job_id=job.id,
        job_name=job.name,
        source=job.source,
        destination=job.destination,
        extra_flags=job.extra_flags,
        status="running",
    )
    db.session.add(task)
    db.session.commit()

    socketio.start_background_task(run_task, task.id)
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
    return render_template("jobs.html", jobs=jobs)


@bp.route("/tasks")
def tasks_page():
    running = TaskRun.query.filter_by(status="running").order_by(TaskRun.started_at.desc()).all()
    history = TaskRun.query.filter(TaskRun.status != "running").order_by(TaskRun.started_at.desc()).limit(100).all()
    return render_template("tasks.html", running=running, history=history)


# ── API ────────────────────────────────────────────────────────────────

@bp.route("/api/jobs", methods=["POST"])
def create_job():
    data = request.json or {}
    if not data.get("name") or not data.get("source") or not data.get("destination"):
        return jsonify({"error": "name, source, destination are required"}), 400

    if CronJob.query.filter_by(name=data["name"]).first():
        return jsonify({"error": "Job name already exists"}), 409

    job = CronJob(
        name=data["name"],
        source=data["source"],
        destination=data["destination"],
        schedule=data.get("schedule", "0 * * * *"),
        enabled=data.get("enabled", True),
        extra_flags=data.get("extra_flags", ""),
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
    job.name = data.get("name", job.name)
    job.source = data.get("source", job.source)
    job.destination = data.get("destination", job.destination)
    job.schedule = data.get("schedule", job.schedule)
    job.enabled = data.get("enabled", job.enabled)
    job.extra_flags = data.get("extra_flags", job.extra_flags)
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
    if cancel_task(task_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Task not found or not running"}), 400


@bp.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    task = db.session.get(TaskRun, task_id)
    if not task:
        return jsonify({"error": "Task not found"}), 404
    if task.status == "running":
        cancel_task(task_id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({"ok": True})
