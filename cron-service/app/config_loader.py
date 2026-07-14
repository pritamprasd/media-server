import os
import yaml
from datetime import datetime, timezone
from app import db
from app.models import CronJob


def get_config_path():
    return os.environ.get("CRON_CONFIG_PATH", "config/jobs.yaml")


def load_jobs_from_config(app):
    """Read YAML config and upsert CronJob rows into SQLite.

    Jobs in the YAML are synced by name. New entries in YAML are created,
    existing entries are updated. Jobs in SQLite not in YAML are left untouched.
    """
    config_path = get_config_path()

    if not os.path.exists(config_path):
        os.makedirs(os.path.dirname(config_path) or "config", exist_ok=True)
        with open(config_path, "w") as f:
            yaml.dump({"jobs": []}, f, default_flow_style=False)
        return

    with open(config_path, "r") as f:
        data = yaml.safe_load(f) or {}

    jobs = data.get("jobs", [])
    existing = {j.name: j for j in CronJob.query.all()}

    for job_data in jobs:
        name = job_data.get("name", "").strip()
        if not name:
            continue

        task_type = job_data.get("task_type", "rsync")
        params = job_data.get("params", {})

        if name in existing:
            job = existing[name]
            job.task_type = task_type
            job.params = params
            job.schedule = job_data.get("schedule", job.schedule)
            job.enabled = job_data.get("enabled", job.enabled)
            job.updated_at = datetime.now(timezone.utc)
        else:
            job = CronJob(
                name=name,
                task_type=task_type,
                params=params,
                schedule=job_data.get("schedule", "0 * * * *"),
                enabled=job_data.get("enabled", True),
            )
            db.session.add(job)

    db.session.commit()


def save_config():
    """Write all CronJob rows back to the YAML config file."""
    jobs = CronJob.query.order_by(CronJob.name).all()

    data = {
        "jobs": [
            {
                "name": j.name,
                "task_type": j.task_type,
                "params": j.params or {},
                "schedule": j.schedule,
                "enabled": j.enabled,
            }
            for j in jobs
        ]
    }

    config_path = get_config_path()
    os.makedirs(os.path.dirname(config_path) or "config", exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
